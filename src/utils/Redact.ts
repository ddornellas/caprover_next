const REDACTED = '[REDACTED]'
const SENSITIVE_KEY = /(password|token|secret|api.?key|ssh.?key|hook)/i

export function redactText(value: string) {
    return `${value || ''}`
        .replace(
            /(token|password|secret|api[_-]?key|authorization|ssh[_-]?key)=([^&\s]+)/gi,
            '$1=[REDACTED]'
        )
        .replace(
            /(["']?(?:token|password|secret|api[_-]?key|authorization|ssh[_-]?key)["']?\s*:\s*)(?:"[^"]*"|'[^']*'|[^,}\s]+)/gi,
            '$1[REDACTED]'
        )
        .replace(/(https?:\/\/[^\s/:@]+):([^\s/@]+)@/gi, '$1:[REDACTED]@')
        .replace(
            /-----BEGIN (?:OPENSSH|RSA|EC|DSA) PRIVATE KEY-----[\s\S]*?-----END (?:OPENSSH|RSA|EC|DSA) PRIVATE KEY-----/g,
            '[PRIVATE_KEY_REDACTED]'
        )
}

export function redactSensitive<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((item) => redactSensitive(item)) as T
    }
    if (!value || typeof value !== 'object') return value

    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(
        value as Record<string, unknown>
    )) {
        result[key] = SENSITIVE_KEY.test(key)
            ? entry
                ? REDACTED
                : entry
            : redactSensitive(entry)
    }
    return result as T
}

export function restoreRedactedSecrets<T>(current: T, requested: T): T {
    if (Array.isArray(requested)) return requested as T
    if (!requested || typeof requested !== 'object') return requested

    const currentObject = (current || {}) as Record<string, unknown>
    const requestedObject = requested as Record<string, unknown>
    const result: Record<string, unknown> = { ...requestedObject }

    for (const [key, value] of Object.entries(requestedObject)) {
        if (SENSITIVE_KEY.test(key) && value === REDACTED) {
            result[key] = currentObject[key]
        } else if (value && typeof value === 'object') {
            result[key] = restoreRedactedSecrets(currentObject[key], value)
        }
    }
    return result as T
}

export { REDACTED }
