import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import type { RefreshSessionRecord } from '../models/AuthSession'

export const REFRESH_SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
const REFRESH_SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000

export interface AuthSessionStore {
    getRefreshSessions(): Promise<RefreshSessionRecord[]>
    setRefreshSessions(sessions: RefreshSessionRecord[]): Promise<void>
}

const sessionMutationQueues = new WeakMap<object, Promise<void>>()

async function withSessionMutation<T>(
    store: AuthSessionStore,
    operation: () => Promise<T>
) {
    const storeObject = store as object
    const previous = sessionMutationQueues.get(storeObject) || Promise.resolve()
    const current = previous.then(operation)
    sessionMutationQueues.set(
        storeObject,
        current.then(
            () => undefined,
            () => undefined
        )
    )
    return current
}

function hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex')
}

function parseToken(token: string) {
    const match = /^cr_refresh_([0-9a-f-]{36})_([A-Za-z0-9_-]{32,})$/.exec(
        `${token || ''}`
    )
    return match ? { id: match[1] } : undefined
}

function tokenMatches(token: string, expectedHash: string) {
    const actual = Buffer.from(hashToken(token), 'hex')
    const expected = Buffer.from(expectedHash || '', 'hex')
    return (
        actual.length === expected.length && timingSafeEqual(actual, expected)
    )
}

function buildRefreshSession(metadata: { userAgent?: string; ip?: string }) {
    const id = randomUUID()
    const token = `cr_refresh_${id}_${randomBytes(32).toString('base64url')}`
    const now = new Date()
    const record: RefreshSessionRecord = {
        id,
        tokenHash: hashToken(token),
        createdAt: now.toISOString(),
        expiresAt: new Date(
            now.getTime() + REFRESH_SESSION_LIFETIME_MS
        ).toISOString(),
        userAgent: metadata.userAgent?.slice(0, 200),
        ip: metadata.ip?.slice(0, 100),
    }
    return { token, record }
}

export async function createRefreshSession(
    store: AuthSessionStore,
    metadata: { userAgent?: string; ip?: string } = {}
) {
    return withSessionMutation(store, async () => {
        const created = buildRefreshSession(metadata)
        const sessions = await store.getRefreshSessions()
        await store.setRefreshSessions([...sessions, created.record].slice(-10))
        return created
    })
}

export async function consumeRefreshSession(
    store: AuthSessionStore,
    token: string,
    rotate: boolean
) {
    const parsed = parseToken(token)
    if (!parsed) return undefined

    return withSessionMutation(store, async () => {
        const sessions = await store.getRefreshSessions()
        const record = sessions.find((candidate) => candidate.id === parsed.id)
        if (
            !record ||
            Date.parse(record.expiresAt) <= Date.now() ||
            !tokenMatches(token, record.tokenHash)
        ) {
            return undefined
        }

        if (rotate) {
            const created = buildRefreshSession({
                userAgent: record.userAgent,
                ip: record.ip,
            })
            // Rotation replaces the secret but does not extend the absolute
            // lifetime established at login.
            created.record.expiresAt = record.expiresAt
            await store.setRefreshSessions(
                [
                    ...sessions.filter((session) => session.id !== record.id),
                    created.record,
                ].slice(-10)
            )
            return created
        }

        const lastUsedAt = record.lastUsedAt
            ? Date.parse(record.lastUsedAt)
            : Number.NaN
        if (
            Number.isFinite(lastUsedAt) &&
            Date.now() - lastUsedAt < REFRESH_SESSION_TOUCH_INTERVAL_MS
        ) {
            return { token, record }
        }
        const touched = { ...record, lastUsedAt: new Date().toISOString() }
        await store.setRefreshSessions(
            sessions.map((session) =>
                session.id === touched.id ? touched : session
            )
        )
        return { token, record: touched }
    })
}

export async function revokeRefreshSession(
    store: AuthSessionStore,
    token: string
) {
    const parsed = parseToken(token)
    if (!parsed) return
    await withSessionMutation(store, async () => {
        const sessions = await store.getRefreshSessions()
        const record = sessions.find((candidate) => candidate.id === parsed.id)
        if (!record || !tokenMatches(token, record.tokenHash)) return
        await store.setRefreshSessions(
            sessions.filter((session) => session.id !== parsed.id)
        )
    })
}

export function revokeAllRefreshSessions(store: AuthSessionStore) {
    return withSessionMutation(store, () => store.setRefreshSessions([]))
}
