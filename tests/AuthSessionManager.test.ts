import {
    AuthSessionStore,
    consumeRefreshSession,
    createRefreshSession,
    revokeAllRefreshSessions,
    revokeRefreshSession,
} from '../src/user/AuthSessionManager'
import { RefreshSessionRecord } from '../src/models/AuthSession'

class MemorySessionStore implements AuthSessionStore {
    sessions: RefreshSessionRecord[] = []

    getRefreshSessions() {
        return Promise.resolve(this.sessions)
    }

    setRefreshSessions(sessions: RefreshSessionRecord[]) {
        this.sessions = sessions
        return Promise.resolve()
    }
}

describe('refresh sessions', () => {
    test('stores only a hash and validates the opaque token', async () => {
        const store = new MemorySessionStore()
        const created = await createRefreshSession(store, {
            userAgent: 'browser',
            ip: '127.0.0.1',
        })

        expect(created.token).toMatch(/^cr_refresh_/)
        expect(store.sessions[0].tokenHash).not.toContain(created.token)
        await expect(
            consumeRefreshSession(store, created.token, false)
        ).resolves.toBeDefined()
        await expect(
            consumeRefreshSession(store, `${created.token}bad`, false)
        ).resolves.toBeUndefined()
    })

    test('rotation invalidates the previous token', async () => {
        const store = new MemorySessionStore()
        const created = await createRefreshSession(store)
        const rotated = await consumeRefreshSession(store, created.token, true)

        expect(rotated?.token).not.toBe(created.token)
        expect(rotated?.record.expiresAt).toBe(created.record.expiresAt)
        await expect(
            consumeRefreshSession(store, created.token, false)
        ).resolves.toBeUndefined()
        await expect(
            consumeRefreshSession(store, rotated!.token, false)
        ).resolves.toBeDefined()
    })

    test('revokes one session or all sessions', async () => {
        const store = new MemorySessionStore()
        const first = await createRefreshSession(store)
        await createRefreshSession(store)
        await revokeRefreshSession(store, first.token)
        expect(store.sessions).toHaveLength(1)
        await revokeAllRefreshSessions(store)
        expect(store.sessions).toHaveLength(0)
    })

    test('serializes concurrent creation and refresh rotation', async () => {
        const store = new MemorySessionStore()
        const created = await Promise.all(
            Array.from({ length: 10 }, () => createRefreshSession(store))
        )
        expect(store.sessions).toHaveLength(10)

        const [first, second] = await Promise.all([
            consumeRefreshSession(store, created[0].token, true),
            consumeRefreshSession(store, created[0].token, true),
        ])
        expect([first, second].filter(Boolean)).toHaveLength(1)
        expect(store.sessions).toHaveLength(10)
    })
})
