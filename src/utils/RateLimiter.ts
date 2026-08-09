import type { Request } from 'express'
import { isIP } from 'net'

export interface RateLimitResult {
    allowed: boolean
    remaining: number
    retryAfterSeconds: number
}

interface Bucket {
    startedAt: number
    count: number
}

type RequestWithSocket = Pick<Request, 'get'> & {
    socket?: { remoteAddress?: string | undefined }
}

const trustedProxyAddresses = new Set(
    (process.env.CAPROVER_TRUSTED_PROXY_IPS || '127.0.0.1,::1,::ffff:127.0.0.1')
        .split(',')
        .map((value) => normalizeIp(value.trim()))
        .filter(Boolean)
)
const trustPrivateProxyAddresses =
    process.env.CAPROVER_TRUST_PRIVATE_PROXIES !== 'false'

function normalizeIp(value: string | undefined) {
    const normalized = `${value || ''}`.trim().toLowerCase()
    if (normalized.startsWith('::ffff:')) {
        const mapped = normalized.slice('::ffff:'.length)
        if (isIP(mapped) === 4) return mapped
    }
    return normalized
}

export function isTrustedProxyAddress(address: string | undefined) {
    const normalized = normalizeIp(address)
    if (!normalized) return false
    if (trustedProxyAddresses.has(normalized)) return true
    if (!trustPrivateProxyAddresses) return false

    if (isIP(normalized) === 4) {
        const parts = normalized.split('.').map(Number)
        const [first, second] = parts
        return (
            first === 10 ||
            first === 127 ||
            (first === 172 && second >= 16 && second <= 31) ||
            (first === 192 && second === 168)
        )
    }

    return (
        normalized === '::1' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        normalized.startsWith('fe8') ||
        normalized.startsWith('fe9') ||
        normalized.startsWith('fea') ||
        normalized.startsWith('feb')
    )
}

function getSocketAddress(req: RequestWithSocket) {
    return normalizeIp(req.socket?.remoteAddress)
}

/**
 * Forwarded headers are only authoritative when the immediate peer is one of
 * the configured reverse proxies. Direct clients must not be able to choose
 * their audit/rate-limit identity or TLS/host metadata.
 */
export function getTrustedHeader(
    req: RequestWithSocket,
    header: string
): string | undefined {
    if (!isTrustedProxyAddress(getSocketAddress(req))) return undefined
    return req.get(header) || undefined
}

export function getTrustedProtocol(
    req: RequestWithSocket & { secure?: boolean }
) {
    return (
        getTrustedHeader(req, 'X-Forwarded-Proto')?.split(',')[0].trim() ||
        (req.secure ? 'https' : 'http')
    )
}

export function getTrustedHost(req: RequestWithSocket) {
    return (
        getTrustedHeader(req, 'X-Forwarded-Host')?.split(',')[0].trim() ||
        req.get('Host') ||
        ''
    )
}

/**
 * Small in-process limiter for the single-node control plane.
 *
 * This is deliberately bounded and fail-closed for a single process. It is
 * not intended to replace a reverse-proxy/WAF limiter in a multi-replica
 * deployment, but it prevents accidental global lockouts and cheap bursts.
 */
export class RateLimiter {
    private readonly buckets = new Map<string, Bucket>()

    constructor(
        private readonly maxAttempts: number,
        private readonly windowMs: number,
        private readonly maxBuckets = 10_000
    ) {}

    consume(key: string, now = Date.now()): RateLimitResult {
        const normalizedKey = key || 'unknown'
        const current = this.buckets.get(normalizedKey)

        if (!current || now - current.startedAt >= this.windowMs) {
            this.buckets.set(normalizedKey, { startedAt: now, count: 1 })
            this.evictIfNeeded(now)
            return {
                allowed: true,
                remaining: Math.max(0, this.maxAttempts - 1),
                retryAfterSeconds: 0,
            }
        }

        current.count += 1
        const retryAfterSeconds = Math.max(
            1,
            Math.ceil((this.windowMs - (now - current.startedAt)) / 1000)
        )
        const allowed = current.count <= this.maxAttempts

        return {
            allowed,
            remaining: Math.max(0, this.maxAttempts - current.count),
            retryAfterSeconds: allowed ? 0 : retryAfterSeconds,
        }
    }

    reset(key: string) {
        this.buckets.delete(key)
    }

    private evictIfNeeded(now: number) {
        if (this.buckets.size <= this.maxBuckets) return

        for (const [key, bucket] of this.buckets) {
            if (now - bucket.startedAt >= this.windowMs) {
                this.buckets.delete(key)
            }
        }

        while (this.buckets.size > this.maxBuckets) {
            const oldest = this.buckets.keys().next().value as
                string | undefined
            if (!oldest) break
            this.buckets.delete(oldest)
        }
    }
}

export function getRequestClientKey(req: RequestWithSocket) {
    const forwarded = getTrustedHeader(req, 'X-Real-IP')?.split(',')[0]?.trim()
    if (forwarded && isIP(forwarded)) return normalizeIp(forwarded)

    // nginx is the supported public entrypoint and writes X-Real-IP. Direct
    // requests fall back to the socket address. This value is only a limiter
    // key; authorization never relies on it.
    return getSocketAddress(req) || 'unknown'
}
