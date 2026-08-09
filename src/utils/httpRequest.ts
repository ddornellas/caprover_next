export interface SimpleHttpResponse {
    statusCode: number
}

type HttpCallback = (
    error: Error | undefined,
    response?: SimpleHttpResponse,
    body?: string
) => void

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

async function readBoundedText(response: Response) {
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        throw new Error('HTTP response is too large')
    }

    if (!response.body) return ''

    const reader = response.body.getReader()
    const chunks: Buffer[] = []
    let totalBytes = 0

    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        totalBytes += value.byteLength
        if (totalBytes > MAX_RESPONSE_BYTES) {
            await reader.cancel()
            throw new Error('HTTP response is too large')
        }
        chunks.push(Buffer.from(value))
    }

    return Buffer.concat(chunks).toString('utf8')
}

/**
 * Small callback-compatible adapter for the handful of internal probes that
 * historically used the deprecated `request` package. Node 24 provides a
 * standards-based fetch implementation, so keep the old callback boundary
 * while removing the vulnerable dependency from the runtime.
 */
export function requestText(
    url: string,
    callback: HttpCallback,
    timeoutMs = 15000
) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    fetch(url, { signal: controller.signal, redirect: 'manual' })
        .then(async (response) => {
            const body = await readBoundedText(response)
            callback(undefined, { statusCode: response.status }, body)
        })
        .catch((error: unknown) => {
            callback(error instanceof Error ? error : new Error(`${error}`))
        })
        .finally(() => clearTimeout(timeout))
}
