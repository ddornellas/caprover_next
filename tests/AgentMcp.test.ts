import {
    callAgentMcpTool,
    getMcpTools,
    MCP_PROTOCOL_VERSION,
} from '../src/user/agents/AgentMcpManager'
import { AgentKeyRecord } from '../src/models/AgentAccess'

function key(role: AgentKeyRecord['role']): AgentKeyRecord {
    return {
        id: 'agent_test',
        name: 'test agent',
        role,
        appNames: ['api'],
        tokenHash: 'a'.repeat(64),
        createdAt: new Date().toISOString(),
    }
}

describe('agent MCP contract', () => {
    test('uses the stable protocol revision and deterministic read tools', () => {
        expect(MCP_PROTOCOL_VERSION).toBe('2025-11-25')
        expect(getMcpTools(key('read')).map((tool) => tool.name)).toEqual([
            'caprover_context',
            'caprover_list_apps',
            'caprover_read_logs',
            'caprover_events',
            'caprover_deployment_status',
        ])
    })

    test('read logs includes build status and the latest scoped deployment', async () => {
        const result = await callAgentMcpTool(
            {
                key: key('read'),
                datastore: {
                    getAgentDeploymentRequests: jest.fn().mockResolvedValue([
                        {
                            id: 'deployment-1',
                            agentKeyId: 'agent_test',
                            agentKeyName: 'test agent',
                            role: 'read',
                            appName: 'api',
                            isNewApp: false,
                            captainDefinition: {
                                schemaVersion: 2,
                                imageName: 'nginx:latest',
                            },
                            status: 'failed',
                            createdAt: '2026-08-17T10:00:00.000Z',
                            expiresAt: '2026-08-17T10:30:00.000Z',
                            updatedAt: '2026-08-17T10:05:00.000Z',
                            diagnostics: ['build failed'],
                        },
                    ]),
                } as never,
                serviceManager: {
                    getAppLogs: jest.fn().mockResolvedValue('runtime line'),
                    getBuildStatus: jest.fn().mockReturnValue({
                        isAppBuilding: false,
                        isBuildFailed: true,
                        logs: { lines: ['', 'build line'] },
                    }),
                } as never,
            },
            'caprover_read_logs',
            { appName: 'api' }
        )

        expect(result.structuredContent).toMatchObject({
            appName: 'api',
            lines: ['runtime line'],
            build: {
                isAppBuilding: false,
                isBuildFailed: true,
                lines: ['build line'],
            },
            latestDeployment: {
                id: 'deployment-1',
                diagnostics: ['build failed'],
            },
        })
    })

    test('only deployment identities receive mutation tools', () => {
        const names = getMcpTools(key('deploy_approval')).map(
            (tool) => tool.name
        )
        expect(names).toContain('caprover_preview_deployment')
        expect(names).toContain('caprover_deploy')
    })
})
