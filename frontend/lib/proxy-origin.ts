const validProxyProtocols = new Set(['http', 'https'])

/**
 * Next receives the request over the internal HTTP hop from nginx, so
 * request.url can be http even when the browser reached the control plane
 * over HTTPS. Preserve the browser/proxy protocol for Express' origin check.
 */
export function getProxyProtocol(
    request: Pick<Request, 'headers'>,
    incomingUrl: URL
) {
    const originProtocol = request.headers
        .get('origin')
        ?.split(':', 1)[0]
        ?.trim()
        .toLowerCase()

    if (originProtocol && validProxyProtocols.has(originProtocol)) {
        return originProtocol
    }

    const forwardedProtocol = request.headers
        .get('x-forwarded-proto')
        ?.split(',', 1)[0]
        ?.trim()
        .toLowerCase()

    if (forwardedProtocol && validProxyProtocols.has(forwardedProtocol)) {
        return forwardedProtocol
    }

    return incomingUrl.protocol.replace(':', '')
}
