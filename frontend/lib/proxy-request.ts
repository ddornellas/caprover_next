export function createProxyRequestInit(
    request: Pick<Request, 'method' | 'body'>,
    headers: Headers
): RequestInit & { duplex?: 'half' } {
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
    const requestInit: RequestInit & { duplex?: 'half' } = {
        method: request.method,
        headers,
        body: hasBody ? request.body || undefined : undefined,
        redirect: 'manual',
        cache: 'no-store',
    }

    // Node's fetch requires this opt-in when a request body is streamed.
    if (requestInit.body) requestInit.duplex = 'half'

    return requestInit
}
