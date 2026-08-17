import ApiStatusCodes from '../../api/ApiStatusCodes'
import type DataStore from '../../datastore/DataStore'
import type { AgentKeyRecord } from '../../models/AgentAccess'
import type { AppStatus } from '../../models/AppDefinition'
import Logger from '../../utils/Logger'
import { recordAuditEvent } from '../AuditLogger'
import type ServiceManager from '../ServiceManager'
import {
    assertAgentAppScope,
    createAgentDeploymentRequest,
    getAgentDeploymentRequest,
    getAgentDeploymentStatusForResponse,
    previewAgentDeployment,
    runAgentDeployment,
    startAgentDeployment,
} from './AgentAccessManager'

export const MCP_PROTOCOL_VERSION = '2025-11-25'

export interface AgentMcpContext {
    key: AgentKeyRecord
    datastore: DataStore
    serviceManager: ServiceManager
}

function getAppStatus(app: { status?: AppStatus; instanceCount?: number }) {
    return (
        app.status || (Number(app.instanceCount) === 0 ? 'paused' : 'published')
    )
}

export function mcpToolResult(value: unknown, isError = false) {
    return {
        content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
        structuredContent: value,
        isError,
    }
}

export function getMcpTools(key: AgentKeyRecord) {
    const appNameSchema = {
        type: 'object',
        properties: { appName: { type: 'string' } },
        required: ['appName'],
        additionalProperties: false,
    }
    const tools: Array<Record<string, unknown>> = [
        {
            name: 'caprover_context',
            description:
                'Read safe ecosystem context, app state, deploy history, and guardrails for this agent.',
            inputSchema: {
                type: 'object',
                properties: {},
                additionalProperties: false,
            },
        },
        {
            name: 'caprover_list_apps',
            description: 'List apps in this agent identity exact scope.',
            inputSchema: {
                type: 'object',
                properties: {},
                additionalProperties: false,
            },
        },
        {
            name: 'caprover_read_logs',
            description: 'Read the last 500 log lines for one scoped app.',
            inputSchema: appNameSchema,
        },
        {
            name: 'caprover_events',
            description: 'Read this agent scoped audit timeline.',
            inputSchema: {
                type: 'object',
                properties: {
                    limit: { type: 'integer', minimum: 1, maximum: 100 },
                },
                additionalProperties: false,
            },
        },
        {
            name: 'caprover_deployment_status',
            description: 'Read one deployment request created by this agent.',
            inputSchema: {
                type: 'object',
                properties: { deploymentId: { type: 'string' } },
                required: ['deploymentId'],
                additionalProperties: false,
            },
        },
    ]
    if (key.role !== 'read') {
        const deploymentSchema = {
            type: 'object',
            properties: {
                appName: { type: 'string' },
                createApp: { type: 'boolean' },
                description: { type: 'string' },
                gitHash: { type: 'string' },
                captainDefinition: {
                    type: 'object',
                    properties: {
                        schemaVersion: { const: 2 },
                        imageName: { type: 'string' },
                        dockerfileLines: {
                            type: 'array',
                            items: { type: 'string' },
                        },
                    },
                    required: ['schemaVersion'],
                    additionalProperties: false,
                },
            },
            required: ['appName', 'captainDefinition'],
            additionalProperties: false,
        }
        tools.push(
            {
                name: 'caprover_preview_deployment',
                description:
                    'Validate policy and preview deployment impact without changing state.',
                inputSchema: deploymentSchema,
            },
            {
                name: 'caprover_deploy',
                description:
                    key.role === 'deploy_approval'
                        ? 'Submit an immutable deployment request for human approval.'
                        : 'Start a scoped deployment. Preview it first.',
                inputSchema: {
                    ...deploymentSchema,
                    properties: {
                        ...(deploymentSchema.properties as object),
                        idempotencyKey: { type: 'string', maxLength: 128 },
                    },
                },
            }
        )
    }
    return tools
}

export async function callAgentMcpTool(
    context: AgentMcpContext,
    name: string,
    args: Record<string, unknown>
) {
    const { key, datastore, serviceManager } = context
    if (name === 'caprover_list_apps') {
        const apps = await datastore.getAppsDataStore().getAppDefinitions()
        return mcpToolResult(
            key.appNames.map((appName) => {
                const app = apps[appName]
                return app
                    ? {
                          appName,
                          status: getAppStatus(app),
                          deployedVersion: app.deployedVersion || 0,
                          isBuilding: serviceManager.isAppBuilding(appName),
                      }
                    : { appName, status: 'not_created' }
            })
        )
    }
    if (name === 'caprover_context') {
        const [apps, deployments] = await Promise.all([
            datastore.getAppsDataStore().getAppDefinitions(),
            datastore.getAgentDeploymentRequests(),
        ])
        return mcpToolResult({
            generatedAt: new Date().toISOString(),
            identity: {
                id: key.id,
                name: key.name,
                role: key.role,
                purpose: key.purpose,
            },
            apps: key.appNames.map((appName) => {
                const app = apps[appName]
                return app
                    ? {
                          appName,
                          status: getAppStatus(app),
                          deployedVersion: app.deployedVersion || 0,
                      }
                    : { appName, status: 'not_created' }
            }),
            deployments: deployments
                .filter((deployment) => deployment.agentKeyId === key.id)
                .slice(-20)
                .map(getAgentDeploymentStatusForResponse),
            guardrails: {
                appScope: key.appNames,
                deleteApps: false,
                ssh: false,
                readSecrets: false,
            },
        })
    }
    if (name === 'caprover_read_logs') {
        const appName = `${args.appName || ''}`
        assertAgentAppScope(key, appName)
        const logs = await serviceManager.getAppLogs(appName, 'utf8')
        return mcpToolResult({
            appName,
            lines: `${logs || ''}`.split(/\r?\n/).filter(Boolean).slice(-500),
        })
    }
    if (name === 'caprover_events') {
        const requested = Number(args.limit || 50)
        const limit = Number.isFinite(requested)
            ? Math.min(Math.max(Math.floor(requested), 1), 100)
            : 50
        const events = (await datastore.getAuditEvents())
            .filter(
                (event) =>
                    event.actor === `agent:${key.id}` ||
                    (typeof event.metadata?.appName === 'string' &&
                        key.appNames.includes(event.metadata.appName))
            )
            .slice(-limit)
            .reverse()
            .map(({ ip: _ip, ...event }) => event)
        return mcpToolResult({ events })
    }
    if (name === 'caprover_deployment_status') {
        const deployment = await getAgentDeploymentRequest(
            datastore,
            `${args.deploymentId || ''}`
        )
        if (deployment.agentKeyId !== key.id) {
            throw ApiStatusCodes.createError(
                ApiStatusCodes.STATUS_ERROR_NOT_AUTHORIZED,
                'Deployment request is outside this agent identity scope'
            )
        }
        return mcpToolResult({
            deployment: getAgentDeploymentStatusForResponse(deployment),
        })
    }
    if (name === 'caprover_preview_deployment' || name === 'caprover_deploy') {
        const deploymentInput = {
            appName: args.appName,
            createApp: args.createApp,
            description: args.description,
            gitHash: args.gitHash,
            captainDefinition: args.captainDefinition,
        }
        const apps = await datastore.getAppsDataStore().getAppDefinitions()
        const appName = `${args.appName || ''}`.trim()
        const preview = previewAgentDeployment(
            key,
            deploymentInput,
            Object.prototype.hasOwnProperty.call(apps, appName)
        )
        if (name === 'caprover_preview_deployment') {
            return mcpToolResult({ preview })
        }

        const request = await createAgentDeploymentRequest(
            datastore,
            key,
            deploymentInput,
            typeof args.idempotencyKey === 'string'
                ? args.idempotencyKey
                : undefined
        )
        void recordAuditEvent(datastore, {
            action: 'agent.deployment.request',
            outcome: 'success',
            actor: `agent:${key.id}`,
            resource: request.id,
            metadata: { appName: request.appName, transport: 'mcp' },
        })
        if (key.role === 'deploy') {
            await startAgentDeployment(datastore, request.id, `agent:${key.id}`)
            void runAgentDeployment(
                datastore,
                serviceManager,
                request.id
            ).catch((error) =>
                Logger.e(
                    error as Error,
                    `MCP agent deployment failed: ${request.id}`
                )
            )
        }
        return mcpToolResult({
            preview,
            deployment: getAgentDeploymentStatusForResponse(
                await getAgentDeploymentRequest(datastore, request.id)
            ),
        })
    }

    throw ApiStatusCodes.createError(
        ApiStatusCodes.NOT_FOUND,
        `Unknown MCP tool: ${name}`
    )
}
