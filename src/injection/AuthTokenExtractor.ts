import type { Request } from 'express'
import type Authenticator from '../user/Authenticator'
import CaptainConstants from '../utils/CaptainConstants'

export function decodeAuthTokenFromRequest(
    request: Pick<Request, 'header'> & {
        cookies?: Record<string, string | undefined>
    },
    authenticator: Pick<
        Authenticator,
        'decodeAuthToken' | 'decodeAuthTokenFromCookies'
    >
) {
    const authHeader = request.header(CaptainConstants.headerAuth)

    if (authHeader) {
        return authenticator.decodeAuthToken(authHeader)
    }

    return authenticator.decodeAuthTokenFromCookies(
        request.cookies?.[CaptainConstants.headerCookieAuth] || ''
    )
}
