import express = require('express')

import ApiStatusCodes from '../../api/ApiStatusCodes'
import BaseApi from '../../api/BaseApi'
import { UserManagerProvider } from '../../user/UserManagerProvider'
import {
    assertAgentAppScope,
    authenticateAgentApiKey,
    createAgentDeploymentRequest,
    extractAgentApiKey,
    getAgentDeploymentRequest,
    getAgentDeploymentStatusForResponse,
    getAgentLifecycleStatus,
    previewAgentDeployment,
    runAgentDeployment,
    startAgentDeployment,
} from '../../user/agents/AgentAccessManager'
import CaptainConstants from '../../utils/CaptainConstants'
import Logger from '../../utils/Logger'
import { auditFromRequest } from '../../user/AuditLogger'
import { getRequestClientKey, RateLimiter } from '../../utils/RateLimiter'
import { AgentKeyRecord } from '../../models/AgentAccess'
import type { AppStatus } from '../../models/AppDefinition'
import { isSameOriginRequest } from '../../injection/Injector'
import {
    callAgentMcpTool,
    getMcpTools,
    MCP_PROTOCOL_VERSION,
    mcpToolResult,
} from '../../user/agents/AgentMcpManager'

const router = express.Router()
const agentRateLimiter = new RateLimiter(120, 60_000)

function getAgentKey(res: express.Response) {
    return res.locals.agentKey as AgentKeyRecord
}

function getUserManager() {
    return UserManagerProvider.get(CaptainConstants.rootNameSpace)
}

function sendAgentError(
    res: express.Response,
    statusCode: number,
    message: string
) {
    res.status(statusCode).send(
        new BaseApi(ApiStatusCodes.STATUS_ERROR_NOT_AUTHORIZED, message)
    )
}

function getAppStatus(app: { status?: AppStatus; instanceCount?: number }) {
    return (
        app.status || (Number(app.instanceCount) === 0 ? 'paused' : 'published')
    )
}

router.use(function (req, res, next) {
    const rateLimit = agentRateLimiter.consume(getRequestClientKey(req))
    if (!rateLimit.allowed) {
        res.setHeader('Retry-After', `${rateLimit.retryAfterSeconds}`)
        res.status(429).send(
            new BaseApi(
                ApiStatusCodes.STATUS_PASSWORD_BACK_OFF,
                'Too many agent requests. Please retry later.'
            )
        )
        return
    }
    const userManager = getUserManager()
    const apiKey = extractAgentApiKey(req.header('authorization'))

    return authenticateAgentApiKey(userManager.datastore, apiKey)
        .then(function (record) {
            if (!record) {
                sendAgentError(res, 401, 'A valid agent API key is required.')
                return
            }

            res.locals.agentKey = record
            res.locals.agentUserManager = userManager
            next()
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/', function (req, res) {
    const key = getAgentKey(res)
    const baseApi = new BaseApi(
        ApiStatusCodes.STATUS_OK,
        'Agent access is ready'
    )
    baseApi.data = {
        key: {
            id: key.id,
            name: key.name,
            role: key.role,
            appNames: key.appNames,
            expiresAt: key.expiresAt,
            owner: key.owner,
            purpose: key.purpose,
            provider: key.provider,
            policy: key.policy,
            status: getAgentLifecycleStatus(key),
        },
        capabilities: {
            read: true,
            deploy: key.role !== 'read',
            requiresHumanApproval: key.role === 'deploy_approval',
            delete: false,
            ssh: false,
            createApps: key.policy?.allowAppCreation !== false,
            dockerfileDeploys: key.policy?.allowDockerfileDeploys !== false,
        },
        onboarding: {
            authentication: 'Authorization: Bearer <agent-api-key>',
            context: '/api/v2/agent/context',
            preview: '/api/v2/agent/deployments/preview',
            deploy: '/api/v2/agent/deployments',
            events: '/api/v2/agent/events',
            manifest: '/api/v2/agent/manifest',
        },
    }
    res.send(baseApi)
})

router.get('/manifest', function (req, res) {
    const key = getAgentKey(res)
    const baseApi = new BaseApi(
        ApiStatusCodes.STATUS_OK,
        'Agent integration manifest retrieved'
    )
    baseApi.data = {
        protocolVersion: '2026-08-17',
        authentication: { type: 'bearer', scoped: true },
        identity: { id: key.id, name: key.name, role: key.role },
        tools: [
            { name: 'context', method: 'GET', path: '/context' },
            { name: 'list_apps', method: 'GET', path: '/apps' },
            { name: 'read_logs', method: 'GET', path: '/apps/{appName}/logs' },
            {
                name: 'preview_deployment',
                method: 'POST',
                path: '/deployments/preview',
            },
            {
                name: 'deploy',
                method: 'POST',
                path: '/deployments',
                requiresHumanApproval: key.role === 'deploy_approval',
            },
            {
                name: 'deployment_status',
                method: 'GET',
                path: '/deployments/{id}',
            },
            { name: 'events', method: 'GET', path: '/events' },
        ],
        deniedCapabilities: ['delete_apps', 'ssh', 'read_secrets'],
    }
    res.send(baseApi)
})

router.get('/mcp', function (req, res) {
    if (!isSameOriginRequest(req)) {
        res.status(403).send('Invalid Origin')
        return
    }
    // This stateless server does not emit server-initiated messages.
    res.status(405).setHeader('Allow', 'POST')
    res.send('MCP event streams are not enabled')
})

router.post('/mcp', async function (req, res) {
    const key = getAgentKey(res)
    const userManager = res.locals.agentUserManager as ReturnType<
        typeof getUserManager
    >
    const body = req.body as {
        jsonrpc?: unknown
        id?: unknown
        method?: unknown
        params?: unknown
    }
    const id = body?.id ?? null
    const respond = (result: unknown) =>
        res.send({ jsonrpc: '2.0', id, result })
    const respondError = (code: number, message: string, data?: unknown) =>
        res.send({
            jsonrpc: '2.0',
            id,
            error: { code, message, ...(data === undefined ? {} : { data }) },
        })

    if (!isSameOriginRequest(req)) {
        res.status(403).send({
            jsonrpc: '2.0',
            id,
            error: { code: -32000, message: 'Invalid Origin' },
        })
        return
    }
    if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
        respondError(-32600, 'Invalid Request')
        return
    }
    if (body.method === 'notifications/initialized') {
        res.status(202).send()
        return
    }
    if (body.method === 'initialize') {
        res.setHeader('MCP-Protocol-Version', MCP_PROTOCOL_VERSION)
        respond({
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: {
                name: 'caprover-next',
                version: CaptainConstants.configs.version,
                description:
                    'Scoped deployment control plane for CapRover Next agents.',
            },
            instructions:
                'Read context and preview a deployment before calling deploy. Never request secrets, SSH, app deletion, or apps outside the assigned scope.',
        })
        return
    }
    if (body.method === 'ping') {
        respond({})
        return
    }
    if (body.method === 'tools/list') {
        respond({ tools: getMcpTools(key) })
        return
    }
    if (body.method !== 'tools/call') {
        respondError(-32601, 'Method not found')
        return
    }

    const params = body.params as
        { name?: unknown; arguments?: Record<string, unknown> } | undefined
    if (!params || typeof params.name !== 'string') {
        respondError(-32602, 'Invalid tools/call parameters')
        return
    }
    if (!getMcpTools(key).some((tool) => tool.name === params.name)) {
        respondError(-32601, `Unknown or unavailable tool: ${params.name}`)
        return
    }
    const args = params.arguments || {}

    try {
        respond(
            await callAgentMcpTool(
                {
                    key,
                    datastore: userManager.datastore,
                    serviceManager: userManager.serviceManager,
                },
                params.name,
                args
            )
        )
    } catch (toolError) {
        const message =
            toolError instanceof Error ? toolError.message : 'Tool call failed'
        respond(mcpToolResult({ error: message }, true))
    }
})

router.get('/context', async function (req, res) {
    const key = getAgentKey(res)
    const userManager = res.locals.agentUserManager as ReturnType<
        typeof getUserManager
    >
    try {
        const [apps, deployments] = await Promise.all([
            userManager.datastore.getAppsDataStore().getAppDefinitions(),
            userManager.datastore.getAgentDeploymentRequests(),
        ])
        const scopedApps = key.appNames.map((appName) => {
            const app = apps[appName]
            return app
                ? {
                      appName,
                      status: getAppStatus(app),
                      deployedVersion: app.deployedVersion || 0,
                      isBuilding:
                          userManager.serviceManager.isAppBuilding(appName),
                  }
                : { appName, status: 'not_created' }
        })
        const ownDeployments = deployments
            .filter((deployment) => deployment.agentKeyId === key.id)
            .slice(-20)
            .map(getAgentDeploymentStatusForResponse)
        const baseApi = new BaseApi(
            ApiStatusCodes.STATUS_OK,
            'Agent context retrieved'
        )
        baseApi.data = {
            generatedAt: new Date().toISOString(),
            agent: {
                id: key.id,
                name: key.name,
                role: key.role,
                purpose: key.purpose,
            },
            apps: scopedApps,
            deployments: ownDeployments,
            guardrails: {
                appScope: key.appNames,
                deleteApps: false,
                ssh: false,
                readSecrets: false,
            },
        }
        res.send(baseApi)
    } catch (error) {
        ApiStatusCodes.createCatcher(res)(error)
    }
})

router.get('/events', async function (req, res) {
    const key = getAgentKey(res)
    const userManager = res.locals.agentUserManager as ReturnType<
        typeof getUserManager
    >
    try {
        const requestedLimit = Number(req.query.limit || 50)
        const limit = Number.isFinite(requestedLimit)
            ? Math.min(Math.max(Math.floor(requestedLimit), 1), 100)
            : 50
        const events = (await userManager.datastore.getAuditEvents())
            .filter(
                (event) =>
                    event.actor === `agent:${key.id}` ||
                    (typeof event.metadata?.appName === 'string' &&
                        key.appNames.includes(event.metadata.appName))
            )
            .slice(-limit)
            .reverse()
            .map(({ ip: _ip, ...event }) => event)
        const baseApi = new BaseApi(
            ApiStatusCodes.STATUS_OK,
            'Scoped agent events retrieved'
        )
        baseApi.data = { events }
        res.send(baseApi)
    } catch (error) {
        ApiStatusCodes.createCatcher(res)(error)
    }
})

router.post('/deployments/preview', async function (req, res) {
    const key = getAgentKey(res)
    const userManager = res.locals.agentUserManager as ReturnType<
        typeof getUserManager
    >
    try {
        const apps = await userManager.datastore
            .getAppsDataStore()
            .getAppDefinitions()
        const appName = `${req.body?.appName || ''}`.trim()
        const preview = previewAgentDeployment(
            key,
            req.body,
            Object.prototype.hasOwnProperty.call(apps, appName)
        )
        const baseApi = new BaseApi(
            ApiStatusCodes.STATUS_OK,
            'Deployment preview retrieved'
        )
        baseApi.data = { preview }
        res.send(baseApi)
    } catch (error) {
        ApiStatusCodes.createCatcher(res)(error)
    }
})

router.get('/apps', function (req, res, next) {
    const key = getAgentKey(res)
    const userManager = res.locals.agentUserManager as ReturnType<
        typeof getUserManager
    >

    return userManager.datastore
        .getAppsDataStore()
        .getAppDefinitions()
        .then(function (apps) {
            const scopedApps = key.appNames
                .filter((appName) =>
                    Object.prototype.hasOwnProperty.call(apps, appName)
                )
                .map((appName) => {
                    const app = apps[appName]
                    const deployedVersion = app.deployedVersion || 0
                    const deployedVersionInfo = (app.versions || []).find(
                        (version) => version.version === deployedVersion
                    )

                    return {
                        appName,
                        projectId: app.projectId,
                        description: app.description,
                        deployedVersion,
                        deployedAt: deployedVersionInfo?.timeStamp,
                        status: getAppStatus(app),
                        isBuilding:
                            userManager.serviceManager.isAppBuilding(appName),
                        notExposeAsWebApp: !!app.notExposeAsWebApp,
                    }
                })

            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Scoped apps retrieved'
            )
            baseApi.data = { apps: scopedApps }
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/apps/:appName', function (req, res, next) {
    const key = getAgentKey(res)
    const userManager = res.locals.agentUserManager as ReturnType<
        typeof getUserManager
    >
    const appName = req.params.appName

    try {
        assertAgentAppScope(key, appName)
    } catch (error) {
        return ApiStatusCodes.createCatcher(res)(error)
    }

    return userManager.datastore
        .getAppsDataStore()
        .getAppDefinition(appName)
        .then(function (app) {
            const deployedVersion = app.deployedVersion || 0
            const deployedVersionInfo = (app.versions || []).find(
                (version) => version.version === deployedVersion
            )
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Scoped app retrieved'
            )
            baseApi.data = {
                app: {
                    appName,
                    projectId: app.projectId,
                    description: app.description,
                    deployedVersion,
                    deployedAt: deployedVersionInfo?.timeStamp,
                    status: getAppStatus(app),
                    isBuilding:
                        userManager.serviceManager.isAppBuilding(appName),
                    notExposeAsWebApp: !!app.notExposeAsWebApp,
                },
            }
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/apps/:appName/logs', function (req, res, next) {
    const key = getAgentKey(res)
    const userManager = res.locals.agentUserManager as ReturnType<
        typeof getUserManager
    >
    const appName = req.params.appName

    try {
        assertAgentAppScope(key, appName)
        const requestedEncoding = `${req.query.encoding || 'ascii'}`
        if (!['ascii', 'utf8'].includes(requestedEncoding)) {
            throw ApiStatusCodes.createError(
                ApiStatusCodes.ILLEGAL_PARAMETER,
                'encoding must be ascii or utf8'
            )
        }

        return userManager.serviceManager
            .getAppLogs(appName, requestedEncoding)
            .then(function (logs) {
                const baseApi = new BaseApi(
                    ApiStatusCodes.STATUS_OK,
                    'Scoped app logs retrieved'
                )
                baseApi.data = { appName, logs }
                res.send(baseApi)
            })
            .catch(ApiStatusCodes.createCatcher(res))
    } catch (error) {
        return ApiStatusCodes.createCatcher(res)(error)
    }
})

router.get('/apps/:appName/logs/structured', function (req, res) {
    const key = getAgentKey(res)
    const userManager = res.locals.agentUserManager as ReturnType<
        typeof getUserManager
    >
    const appName = req.params.appName

    try {
        assertAgentAppScope(key, appName)
        return userManager.serviceManager
            .getAppLogs(appName, 'utf8')
            .then(function (logs) {
                const lines = `${logs || ''}`
                    .split(/\r?\n/)
                    .filter(Boolean)
                    .slice(-500)
                    .map((message, index) => ({
                        sequence: index + 1,
                        message,
                    }))
                const baseApi = new BaseApi(
                    ApiStatusCodes.STATUS_OK,
                    'Structured scoped app logs retrieved'
                )
                baseApi.data = {
                    appName,
                    generatedAt: new Date().toISOString(),
                    lines,
                }
                res.send(baseApi)
            })
            .catch(ApiStatusCodes.createCatcher(res))
    } catch (error) {
        return ApiStatusCodes.createCatcher(res)(error)
    }
})

router.post('/deployments', function (req, res, next) {
    const key = getAgentKey(res)
    const userManager = res.locals.agentUserManager as ReturnType<
        typeof getUserManager
    >
    const appName = `${req.body?.appName || ''}`.trim()

    return Promise.resolve()
        .then(function () {
            assertAgentAppScope(key, appName)
            const requestedCreateApp = req.body?.createApp
            if (
                requestedCreateApp !== undefined &&
                typeof requestedCreateApp !== 'boolean'
            ) {
                throw ApiStatusCodes.createError(
                    ApiStatusCodes.ILLEGAL_PARAMETER,
                    'createApp must be a boolean'
                )
            }
            const createApp = requestedCreateApp === true
            return userManager.datastore
                .getAppsDataStore()
                .getAppDefinitions()
                .then(function (apps) {
                    const appExists = Object.prototype.hasOwnProperty.call(
                        apps,
                        appName
                    )
                    if (createApp && appExists) {
                        throw ApiStatusCodes.createError(
                            ApiStatusCodes.STATUS_ERROR_ALREADY_EXIST,
                            `App already exists: ${appName}`
                        )
                    }
                    if (!createApp && !appExists) {
                        throw ApiStatusCodes.createError(
                            ApiStatusCodes.NOT_FOUND,
                            `App does not exist: ${appName}. Set createApp to true to create it.`
                        )
                    }
                })
        })
        .then(function () {
            return createAgentDeploymentRequest(
                userManager.datastore,
                key,
                req.body,
                req.get('Idempotency-Key')
            )
        })
        .then(async function (request) {
            void auditFromRequest(
                userManager.datastore,
                req,
                'agent.deployment.request',
                'success',
                `agent:${key.id}`,
                request.id,
                { appName: request.appName, role: key.role }
            )
            if (key.role === 'deploy') {
                await startAgentDeployment(
                    userManager.datastore,
                    request.id,
                    `agent:${key.id}`
                )
                void runAgentDeployment(
                    userManager.datastore,
                    userManager.serviceManager,
                    request.id
                ).catch((error) =>
                    Logger.e(
                        error as Error,
                        `Agent deployment failed: ${request.id}`
                    )
                )
            }

            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK_DEPLOY_STARTED,
                key.role === 'deploy'
                    ? 'Deployment started'
                    : 'Deployment is waiting for human approval'
            )
            baseApi.data = {
                deployment: getAgentDeploymentStatusForResponse(
                    await getAgentDeploymentRequest(
                        userManager.datastore,
                        request.id
                    )
                ),
            }
            res.status(202).send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/deployments/:requestId', function (req, res, next) {
    const key = getAgentKey(res)
    const userManager = res.locals.agentUserManager as ReturnType<
        typeof getUserManager
    >

    return getAgentDeploymentRequest(
        userManager.datastore,
        req.params.requestId
    )
        .then(function (request) {
            if (request.agentKeyId !== key.id) {
                throw ApiStatusCodes.createError(
                    ApiStatusCodes.STATUS_ERROR_NOT_AUTHORIZED,
                    'Deployment request is outside this agent key scope'
                )
            }

            res.send(
                Object.assign(
                    new BaseApi(
                        ApiStatusCodes.STATUS_OK,
                        'Deployment status retrieved'
                    ),
                    {
                        data: {
                            deployment:
                                getAgentDeploymentStatusForResponse(request),
                        },
                    }
                )
            )
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

export default router
