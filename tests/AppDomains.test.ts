import AppsDataStore from '../src/datastore/AppsDataStore'
import { normalizeAppDomainType } from '../src/utils/AppDomains'

function createConfigStore(initialData: { [key: string]: any }) {
    const data = { ...initialData }
    return {
        get: jest.fn((key: string) => data[key]),
        set: jest.fn((key: string, value: any) => {
            data[key] = value
        }),
    } as any
}

function createAppDefinition() {
    return {
        description: '',
        deployedVersion: 0,
        notExposeAsWebApp: false,
        hasPersistentData: false,
        hasDefaultSubDomainSsl: false,
        captainDefinitionRelativeFilePath: './captain-definition',
        forceSsl: false,
        websocketSupport: false,
        instanceCount: 1,
        networks: ['captain-overlay-network'],
        customDomain: [],
        ports: [],
        volumes: [],
        envVars: [],
        versions: [],
    }
}

describe('app domain types', () => {
    test('normalizes supported values and defaults old records to custom', () => {
        expect(normalizeAppDomainType(undefined)).toBe('custom')
        expect(normalizeAppDomainType(' INTERNAL ')).toBe('internal')
        expect(normalizeAppDomainType('external')).toBe('external')
        expect(normalizeAppDomainType('test')).toBe('test')
        expect(normalizeAppDomainType('custom')).toBe('custom')
    })

    test('rejects unsupported values', () => {
        expect(() => normalizeAppDomainType('private')).toThrow(
            'domainType must be one of: internal, external, test, custom'
        )
    })

    test('persists a typed alias without changing the app service model', async () => {
        const data = createConfigStore({
            appDefinitions: {
                'my-app': createAppDefinition(),
            },
        })
        const appsDataStore = new AppsDataStore(data, 'captain')

        await appsDataStore.addCustomDomainForApp(
            'my-app',
            'internal.example.com',
            'internal'
        )

        expect(data.set).toHaveBeenCalledWith(
            'appDefinitions.my-app',
            expect.objectContaining({
                customDomain: [
                    {
                        publicDomain: 'internal.example.com',
                        hasSsl: false,
                        domainType: 'internal',
                    },
                ],
            })
        )
    })

    test('does not persist an invalid alias type', async () => {
        const data = createConfigStore({
            appDefinitions: {
                'my-app': createAppDefinition(),
            },
        })
        const appsDataStore = new AppsDataStore(data, 'captain')

        await expect(
            appsDataStore.addCustomDomainForApp(
                'my-app',
                'invalid.example.com',
                'private'
            )
        ).rejects.toThrow('domainType must be one of')
        expect(data.set).not.toHaveBeenCalled()
    })
})
