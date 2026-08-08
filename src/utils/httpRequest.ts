export interface SimpleHttpResponse {
    statusCode: number
}

type HttpCallback = (
    error: Error | undefined,
    response?: SimpleHttpResponse,
    body?: string
) => void

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

    fetch(url, { signal: controller.signal })
        .then(async (response) => {
            const body = await response.text()
            callback(undefined, { statusCode: response.status }, body)
        })
        .catch((error: unknown) => {
            callback(error instanceof Error ? error : new Error(`${error}`))
        })
        .finally(() => clearTimeout(timeout))
}
