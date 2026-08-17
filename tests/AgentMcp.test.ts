import {
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

    test('only deployment identities receive mutation tools', () => {
        const names = getMcpTools(key('deploy_approval')).map(
            (tool) => tool.name
        )
        expect(names).toContain('caprover_preview_deployment')
        expect(names).toContain('caprover_deploy')
    })
})
