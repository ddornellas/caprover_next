import {
    getRequestClientKey,
    getTrustedHeader,
    getTrustedProtocol,
    RateLimiter,
} from '../src/utils/RateLimiter'

test('rate limiter isolates clients and expires buckets', () => {
    const limiter = new RateLimiter(2, 1000)

    expect(limiter.consume('a', 0).allowed).toBe(true)
    expect(limiter.consume('a', 1).allowed).toBe(true)
    expect(limiter.consume('a', 2).allowed).toBe(false)
    expect(limiter.consume('b', 2).allowed).toBe(true)
    expect(limiter.consume('a', 1001).allowed).toBe(true)
})

test('direct clients cannot spoof forwarded identity headers', () => {
    const request = {
        get: (header: string) =>
            header === 'X-Real-IP' ? '203.0.113.99' : undefined,
        socket: { remoteAddress: '198.51.100.10' },
    }

    expect(getRequestClientKey(request as any)).toBe('198.51.100.10')
    expect(getTrustedHeader(request as any, 'X-Real-IP')).toBeUndefined()
})

test('loopback reverse proxies may provide a validated client address', () => {
    const request = {
        get: (header: string) =>
            header === 'X-Real-IP' ? '203.0.113.99' : undefined,
        socket: { remoteAddress: '127.0.0.1' },
    }

    expect(getRequestClientKey(request as any)).toBe('203.0.113.99')
})

test('direct clients cannot spoof the forwarded protocol', () => {
    const request = {
        secure: false,
        get: (header: string) =>
            header === 'X-Forwarded-Proto' ? 'https' : undefined,
        socket: { remoteAddress: '198.51.100.10' },
    }

    expect(getTrustedProtocol(request as any)).toBe('http')
})
