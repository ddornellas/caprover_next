import {
    AgentAccessStore,
    authenticateAgentApiKey,
    assertAgentAppScope,
    createAgentDeploymentRequest,
    createAgentKey,
    revokeAgentKey,
    sanitizeCaptainDefinition,
    startAgentDeployment,
} from '../src/user/agents/AgentAccessManager'
import {
    AgentDeploymentRequest,
    AgentKeyRecord,
} from '../src/models/AgentAccess'

class MemoryAgentStore implements AgentAccessStore {
    keys: AgentKeyRecord[] = []
    requests: AgentDeploymentRequest[] = []

    getAgentKeys() {
        return Promise.resolve(this.keys)
    }

    setAgentKeys(keys: AgentKeyRecord[]) {
        this.keys = keys
        return Promise.resolve()
    }

    getAgentDeploymentRequests() {
        return Promise.resolve(this.requests)
    }

    setAgentDeploymentRequests(requests: AgentDeploymentRequest[]) {
        this.requests = requests
        return Promise.resolve()
    }
}

describe('agent access', () => {
    test('creates a one-time secret and authenticates it by hash', async () => {
        const store = new MemoryAgentStore()
        const created = await createAgentKey(store, {
            name: 'production deploy bot',
            role: 'deploy_approval',
            appNames: ['api', 'web'],
        })

        expect(created.apiKey).toMatch(/^cr_agent_agent_/)
        expect(created.metadata.tokenHash).toBeUndefined()
        expect(store.keys[0].tokenHash).toBeDefined()

        const authenticated = await authenticateAgentApiKey(
            store,
            created.apiKey
        )
        expect(authenticated?.id).toBe(created.metadata.id)
        expect(authenticated?.lastUsedAt).toBeDefined()

        const firstLastUsedAt = authenticated?.lastUsedAt
        await authenticateAgentApiKey(store, created.apiKey)
        expect(store.keys[0].lastUsedAt).toBe(firstLastUsedAt)
    })

    test('revocation immediately invalidates a key', async () => {
        const store = new MemoryAgentStore()
        const created = await createAgentKey(store, {
            name: 'read bot',
            role: 'read',
            appNames: ['api'],
        })

        await revokeAgentKey(store, created.metadata.id)

        await expect(
            authenticateAgentApiKey(store, created.apiKey)
        ).resolves.toBeUndefined()
    })

    test('rejects access outside the explicit app allowlist', async () => {
        const store = new MemoryAgentStore()
        const created = await createAgentKey(store, {
            name: 'scoped bot',
            role: 'deploy',
            appNames: ['api'],
        })
        const key = await authenticateAgentApiKey(store, created.apiKey)

        expect(() => assertAgentAppScope(key!, 'web')).toThrow(
            'Agent key is not allowed to access app: web'
        )
    })

    test('allows only the safe captain definition fields', () => {
        expect(
            sanitizeCaptainDefinition({
                schemaVersion: 2,
                imageName: 'registry.example/api:latest',
            })
        ).toEqual({
            schemaVersion: 2,
            imageName: 'registry.example/api:latest',
        })

        expect(() =>
            sanitizeCaptainDefinition({
                schemaVersion: 2,
                imageName: 'registry.example/api:latest',
                envVars: [{ key: 'SECRET', value: 'do-not-accept' }],
            })
        ).toThrow('captainDefinition field is not allowed: envVars')
    })

    test('approval deploys remain pending until a human starts them', async () => {
        const store = new MemoryAgentStore()
        const created = await createAgentKey(store, {
            name: 'approval bot',
            role: 'deploy_approval',
            appNames: ['api'],
        })
        const key = await authenticateAgentApiKey(store, created.apiKey)

        const request = await createAgentDeploymentRequest(store, key!, {
            appName: 'api',
            gitHash: 'abc123',
            captainDefinition: {
                schemaVersion: 2,
                imageName: 'registry.example/api:abc123',
            },
        })

        expect(request.status).toBe('pending')
        const started = await startAgentDeployment(
            store,
            request.id,
            'human@example.com'
        )
        expect(started.status).toBe('running')
        expect(started.approvedBy).toBe('human@example.com')
    })

    test('rejects extra deployment fields and read-only deployments', async () => {
        const store = new MemoryAgentStore()
        const created = await createAgentKey(store, {
            name: 'read bot',
            role: 'read',
            appNames: ['api'],
        })
        const key = await authenticateAgentApiKey(store, created.apiKey)

        await expect(
            createAgentDeploymentRequest(store, key!, {
                appName: 'api',
                captainDefinition: {
                    schemaVersion: 2,
                    imageName: 'registry.example/api:latest',
                },
            })
        ).rejects.toThrow('read-only')

        const deployCreated = await createAgentKey(store, {
            name: 'deploy bot',
            role: 'deploy',
            appNames: ['api'],
        })
        const deployKey = await authenticateAgentApiKey(
            store,
            deployCreated.apiKey
        )

        await expect(
            createAgentDeploymentRequest(store, deployKey!, {
                appName: 'api',
                captainDefinition: {
                    schemaVersion: 2,
                    imageName: 'registry.example/api:latest',
                },
                role: 'deploy',
            } as never)
        ).rejects.toThrow('Deployment field is not allowed: role')
    })

    test('allows a scoped new app request and prevents duplicate pending apps', async () => {
        const store = new MemoryAgentStore()
        const created = await createAgentKey(store, {
            name: 'new app approval bot',
            role: 'deploy_approval',
            appNames: ['new-api'],
        })
        const key = await authenticateAgentApiKey(store, created.apiKey)

        const request = await createAgentDeploymentRequest(store, key!, {
            appName: 'new-api',
            createApp: true,
            description: 'Created by an automation agent',
            captainDefinition: {
                schemaVersion: 2,
                imageName: 'registry.example/new-api:latest',
            },
        })

        expect(request.isNewApp).toBe(true)
        expect(request.description).toBe('Created by an automation agent')
        await expect(
            createAgentDeploymentRequest(store, key!, {
                appName: 'new-api',
                createApp: true,
                captainDefinition: {
                    schemaVersion: 2,
                    imageName: 'registry.example/new-api:latest',
                },
            })
        ).rejects.toThrow('approval request already exists')
    })

    test('returns the same deployment request for a repeated idempotency key', async () => {
        const store = new MemoryAgentStore()
        const created = await createAgentKey(store, {
            name: 'idempotent deploy bot',
            role: 'deploy_approval',
            appNames: ['api'],
        })
        const key = await authenticateAgentApiKey(store, created.apiKey)
        const input = {
            appName: 'api',
            captainDefinition: {
                schemaVersion: 2,
                imageName: 'nginx:alpine',
            },
        }

        const first = await createAgentDeploymentRequest(
            store,
            key!,
            input,
            'release-123'
        )
        const second = await createAgentDeploymentRequest(
            store,
            key!,
            input,
            'release-123'
        )

        expect(second.id).toBe(first.id)
        expect((await store.getAgentDeploymentRequests()).length).toBe(1)
        expect(
            (await store.getAgentDeploymentRequests())[0].idempotencyKey
        ).toBeUndefined()
        expect(
            (await store.getAgentDeploymentRequests())[0].idempotencyKeyHash
        ).toMatch(/^[a-f0-9]{64}$/)
    })

    test('serializes concurrent idempotent requests for the same key', async () => {
        const store = new MemoryAgentStore()
        const created = await createAgentKey(store, {
            name: 'concurrent deploy bot',
            role: 'deploy_approval',
            appNames: ['api'],
        })
        const key = await authenticateAgentApiKey(store, created.apiKey)
        const input = {
            appName: 'api',
            captainDefinition: {
                schemaVersion: 2,
                imageName: 'nginx:alpine',
            },
        }

        const [first, second] = await Promise.all([
            createAgentDeploymentRequest(store, key!, input, 'release-456'),
            createAgentDeploymentRequest(store, key!, input, 'release-456'),
        ])

        expect(second.id).toBe(first.id)
        expect((await store.getAgentDeploymentRequests()).length).toBe(1)
    })
})
