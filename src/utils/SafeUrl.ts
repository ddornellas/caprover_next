import { promises as dns } from 'dns'
import * as http from 'http'
import * as https from 'https'

export interface SafeHttpResolution {
    url: string
    hostname: string
    addresses: readonly { address: string; family: 4 | 6 }[]
}

function isPrivateIpv4(address: string) {
    const parts = address.split('.').map(Number)
    if (
        parts.length !== 4 ||
        parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    ) {
        return true
    }

    const [a, b, c] = parts
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 192 && b === 0) ||
        (a === 192 && b === 31 && c === 196) ||
        (a === 192 && b === 52 && c === 193) ||
        (a === 192 && b === 88 && c === 99) ||
        (a === 198 && (b === 18 || b === 19)) ||
        (a === 198 && b === 51) ||
        (a === 203 && b === 0) ||
        a >= 224
    )
}

function isPrivateIpv6(address: string) {
    const normalized = address.toLowerCase()

    // IPv4-mapped IPv6 literals are a common way to bypass IPv4-only
    // allow/deny checks (for example ::ffff:7f00:1 for 127.0.0.1).
    if (normalized.startsWith('::ffff:')) {
        const mapped = normalized.slice('::ffff:'.length)
        if (mapped.includes('.')) return isPrivateIpv4(mapped)

        const mappedParts = mapped.split(':')
        if (
            mappedParts.length === 2 &&
            mappedParts.every((part) => /^[0-9a-f]{1,4}$/.test(part))
        ) {
            const high = Number.parseInt(mappedParts[0], 16)
            const low = Number.parseInt(mappedParts[1], 16)
            return isPrivateIpv4(
                `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
            )
        }
    }

    const firstGroup = Number.parseInt(normalized.split(':')[0] || '0', 16)
    return (
        normalized === '::' ||
        normalized === '::1' ||
        (Number.isFinite(firstGroup) && (firstGroup & 0xff00) === 0xff00) ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        normalized.startsWith('fe8') ||
        normalized.startsWith('fe9') ||
        normalized.startsWith('fea') ||
        normalized.startsWith('feb') ||
        normalized.startsWith('ff') ||
        normalized.startsWith('2001:db8:') ||
        normalized.startsWith('::ffff:10.') ||
        normalized.startsWith('::ffff:192.168.') ||
        normalized.startsWith('::ffff:127.')
    )
}

function isPrivateAddress(address: string) {
    return address.includes(':')
        ? isPrivateIpv6(address)
        : isPrivateIpv4(address)
}

export async function resolveSafeHttpUrl(
    value: string
): Promise<SafeHttpResolution> {
    if (
        typeof value !== 'string' ||
        value.length > 2048 ||
        /[\r\n\0]/.test(value)
    ) {
        throw new Error('URL is invalid')
    }

    let parsed: URL
    try {
        parsed = new URL(value)
    } catch {
        throw new Error('URL is invalid')
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Only HTTP and HTTPS URLs are supported')
    }
    if (parsed.username || parsed.password) {
        throw new Error('URLs with embedded credentials are not supported')
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (
        !hostname ||
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal') ||
        hostname === 'metadata.google.internal'
    ) {
        throw new Error('Private and local URLs are not supported')
    }

    const resolved = await dns.lookup(hostname, { all: true, verbatim: true })
    if (
        !resolved.length ||
        resolved.some((entry) => isPrivateAddress(entry.address))
    ) {
        throw new Error(
            'URLs resolving to private or local addresses are not supported'
        )
    }

    const addresses = resolved.map((entry) => ({
        address: entry.address,
        family: entry.family === 6 ? (6 as const) : (4 as const),
    }))

    return {
        url: parsed.toString().replace(/\/$/, ''),
        hostname,
        addresses,
    }
}

export async function assertSafeHttpUrl(value: string) {
    return (await resolveSafeHttpUrl(value)).url
}

/**
 * Creates agents whose DNS lookup is pinned to the addresses checked by
 * resolveSafeHttpUrl. A second resolver call at connection time would leave
 * a DNS-rebinding window between validation and the actual HTTP request.
 */
export function createPinnedHttpAgents(resolution: SafeHttpResolution) {
    const lookup = (
        _hostname: string,
        options: { all?: boolean; family?: number } | number,
        callback: (
            error: Error | null,
            address?: string | readonly { address: string; family: number }[],
            family?: number
        ) => void
    ) => {
        const requestedFamily =
            typeof options === 'number' ? options : options.family || 0
        const matching = resolution.addresses.filter(
            (entry) => !requestedFamily || entry.family === requestedFamily
        )

        if (!matching.length) {
            callback(new Error('No validated address matches the request'))
            return
        }

        if (typeof options !== 'number' && options.all) {
            callback(null, matching)
            return
        }

        callback(null, matching[0].address, matching[0].family)
    }

    return {
        httpAgent: new http.Agent({
            keepAlive: false,
            lookup: lookup as any,
        }),
        httpsAgent: new https.Agent({
            keepAlive: false,
            lookup: lookup as any,
        }),
    }
}
