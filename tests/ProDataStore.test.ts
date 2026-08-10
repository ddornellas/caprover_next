import CaptainEncryptor from '../src/utils/Encryptor'
import ProDataStore from '../src/datastore/ProDataStore'

class MemoryConfigStore {
    private values: Record<string, unknown> = {}

    get(path: string) {
        return path.split('.').reduce<unknown>((current, part) => {
            if (!current || typeof current !== 'object') return undefined
            return (current as Record<string, unknown>)[part]
        }, this.values)
    }

    set(path: string, value: unknown) {
        const parts = path.split('.')
        const leaf = parts.pop() as string
        let target = this.values
        parts.forEach((part) => {
            const next = target[part]
            if (!next || typeof next !== 'object') {
                target[part] = {}
            }
            target = target[part] as Record<string, unknown>
        })
        target[leaf] = value
    }

    delete(path: string) {
        const parts = path.split('.')
        const leaf = parts.pop() as string
        let target: Record<string, unknown> | undefined = this.values
        parts.forEach((part) => {
            const next = target?.[part]
            target =
                next && typeof next === 'object'
                    ? (next as Record<string, unknown>)
                    : undefined
        })
        if (target) delete target[leaf]
    }

    read(path: string) {
        return this.get(path)
    }
}

function createStore() {
    const config = new MemoryConfigStore()
    const dataStore = new ProDataStore(config as never)
    dataStore.setEncryptor(
        new CaptainEncryptor('pro-data-store-test-key-with-enough-length')
    )
    return { config, dataStore }
}

describe('ProDataStore', () => {
    it('encrypts API keys and preserves the installation identity when clearing integration data', async () => {
        const { config, dataStore } = createStore()

        await dataStore.setApiKey('integration-secret')
        const installationId = await dataStore.getInstallationId()

        expect(config.read('pro.proApiKey')).toMatch(/^v2:/)
        expect(await dataStore.getApiKey()).toBe('integration-secret')

        await dataStore.clearAllProConfigs()

        expect(await dataStore.getApiKey()).toBe('')
        expect(await dataStore.getInstallationId()).toBe(installationId)
        expect(await dataStore.isOtpEnabled()).toBe(false)
        expect((await dataStore.getConfig()).alerts).toEqual([])
    })

    it('migrates a legacy plaintext API key on first read', async () => {
        const { config, dataStore } = createStore()
        config.set('pro.proApiKey', 'legacy-integration-secret')

        expect(await dataStore.getApiKey()).toBe('legacy-integration-secret')
        expect(config.read('pro.proApiKey')).toMatch(/^v2:/)
    })
})
