import express = require('express')
import ApiStatusCodes from '../../api/ApiStatusCodes'
import BaseApi from '../../api/BaseApi'
import DataStoreProvider from '../../datastore/DataStoreProvider'
import InjectionExtractor from '../../injection/InjectionExtractor'
import Authenticator from '../../user/Authenticator'
import { auditFromRequest } from '../../user/AuditLogger'
import {
    consumeRefreshSession,
    createRefreshSession,
    REFRESH_SESSION_LIFETIME_MS,
    revokeRefreshSession,
} from '../../user/AuthSessionManager'
import {
    CapRoverEventFactory,
    CapRoverEventType,
} from '../../user/events/ICapRoverEvent'
import CaptainConstants from '../../utils/CaptainConstants'
import {
    getRequestClientKey,
    getTrustedProtocol,
    RateLimiter,
} from '../../utils/RateLimiter'
import { isSameOriginRequest } from '../../injection/Injector'

const router = express.Router()

// Keep this per source instead of one global queue. A failed attempt from one
// client must not lock every administrator out of the control plane.
const loginRateLimiter = new RateLimiter(10, 60_000)
const ACCESS_COOKIE_LIFETIME_MS = 30 * 60 * 1000

function cookieOptions(req: express.Request, maxAge: number) {
    return {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: getTrustedProtocol(req) === 'https',
        path: '/',
        maxAge,
    }
}

function setSessionCookies(
    req: express.Request,
    res: express.Response,
    accessToken: string,
    refreshToken: string
) {
    res.cookie(
        CaptainConstants.headerCookieAuth,
        accessToken,
        cookieOptions(req, ACCESS_COOKIE_LIFETIME_MS)
    )
    res.cookie(
        CaptainConstants.headerCookieRefresh,
        refreshToken,
        cookieOptions(req, REFRESH_SESSION_LIFETIME_MS)
    )
}

function clearSessionCookies(req: express.Request, res: express.Response) {
    const options = cookieOptions(req, 0)
    res.clearCookie(CaptainConstants.headerCookieAuth, options)
    res.clearCookie(CaptainConstants.headerCookieRefresh, options)
}

router.post('/', function (req, res, next) {
    const password = `${req.body.password || ''}`
    const otpToken = `${req.body.otpToken || ''}`

    const rateLimit = loginRateLimiter.consume(getRequestClientKey(req))
    if (!rateLimit.allowed) {
        res.setHeader('Retry-After', `${rateLimit.retryAfterSeconds}`)
        res.status(429).send(
            new BaseApi(
                ApiStatusCodes.STATUS_PASSWORD_BACK_OFF,
                'Too many login attempts. Please wait and try again.'
            )
        )
        return
    }

    if (!password) {
        const response = new BaseApi(
            ApiStatusCodes.STATUS_ERROR_GENERIC,
            'password is empty.'
        )
        res.send(response)
        return
    }

    // Keep accepting the historical range while allowing modern passphrases.
    if (password.length > 256) {
        const response = new BaseApi(
            ApiStatusCodes.STATUS_ERROR_GENERIC,
            'password is too long - maximum 256 characters.'
        )
        res.send(response)
        return
    }

    let authToken: string

    const namespace =
        InjectionExtractor.extractGlobalsFromInjected(res).namespace
    const userManagerForLoginOnly =
        InjectionExtractor.extractGlobalsFromInjected(
            res
        ).userManagerForLoginOnly
    const otpAuthenticatorForLoginOnly =
        userManagerForLoginOnly.otpAuthenticator
    const eventLoggerForLoginOnly = userManagerForLoginOnly.eventLogger
    const dataStoreForLogin = DataStoreProvider.getDataStore(namespace)

    let loadedHashedPassword = ''

    Promise.resolve() //
        .then(function () {
            return otpAuthenticatorForLoginOnly.is2FactorEnabled()
        })
        .then(function (isEnabled) {
            if (isEnabled && !otpToken) {
                throw ApiStatusCodes.createError(
                    ApiStatusCodes.STATUS_ERROR_OTP_REQUIRED,
                    'Enter OTP token as well'
                )
            }
        })
        .then(function () {
            return dataStoreForLogin.getHashedPassword()
        })
        .then(function (savedHashedPassword) {
            loadedHashedPassword = savedHashedPassword
            return Authenticator.getAuthenticator(namespace).getAuthToken(
                { otpToken, otpAuthenticator: otpAuthenticatorForLoginOnly },
                password,
                loadedHashedPassword
            )
        })
        .then(function (token) {
            authToken = token
            return Authenticator.getAuthenticator(
                namespace
            ).getAuthTokenForCookies(
                { otpToken, otpAuthenticator: otpAuthenticatorForLoginOnly },
                password,
                loadedHashedPassword
            )
        })
        .then(async function (cookieAuth) {
            loginRateLimiter.reset(getRequestClientKey(req))
            void auditFromRequest(
                dataStoreForLogin,
                req,
                'auth.login',
                'success',
                'root-session'
            )
            const refresh = await createRefreshSession(dataStoreForLogin, {
                userAgent: req.get('user-agent'),
                ip: getRequestClientKey(req),
            })
            setSessionCookies(req, res, cookieAuth, refresh.token)
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Login succeeded'
            )
            baseApi.data = { token: authToken }
            eventLoggerForLoginOnly.trackEvent(
                CapRoverEventFactory.create(CapRoverEventType.UserLoggedIn, {
                    ip: getRequestClientKey(req),
                })
            )
            res.send(baseApi)
        })
        .catch(function (error) {
            void auditFromRequest(
                dataStoreForLogin,
                req,
                'auth.login',
                error?.captainErrorType === ApiStatusCodes.STATUS_WRONG_PASSWORD
                    ? 'denied'
                    : 'failure',
                'anonymous'
            )
            ApiStatusCodes.createCatcher(res)(error)
        })
})

router.post('/refresh/', function (req, res) {
    if (!isSameOriginRequest(req)) {
        res.status(403).send(
            new BaseApi(
                ApiStatusCodes.STATUS_ERROR_NOT_AUTHORIZED,
                'Cross-origin session refresh rejected.'
            )
        )
        return
    }

    const namespace =
        InjectionExtractor.extractGlobalsFromInjected(res).namespace
    const dataStore = DataStoreProvider.getDataStore(namespace)
    const token = req.cookies?.[CaptainConstants.headerCookieRefresh] || ''

    consumeRefreshSession(dataStore, token, true)
        .then((session) => {
            if (!session) {
                res.status(401).send(
                    new BaseApi(
                        ApiStatusCodes.STATUS_AUTH_TOKEN_INVALID,
                        'Session expired. Sign in again.'
                    )
                )
                return
            }

            const accessToken =
                Authenticator.getAuthenticator(
                    namespace
                ).getFreshAuthTokenForCookies()
            setSessionCookies(req, res, accessToken, session.token)
            res.send(new BaseApi(ApiStatusCodes.STATUS_OK, 'Session refreshed'))
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.post('/logout/', function (req, res) {
    if (!isSameOriginRequest(req)) {
        res.status(403).send(
            new BaseApi(
                ApiStatusCodes.STATUS_ERROR_NOT_AUTHORIZED,
                'Cross-origin logout rejected.'
            )
        )
        return
    }
    const namespace =
        InjectionExtractor.extractGlobalsFromInjected(res).namespace
    const dataStore = DataStoreProvider.getDataStore(namespace)
    const refreshToken =
        req.cookies?.[CaptainConstants.headerCookieRefresh] || ''

    revokeRefreshSession(dataStore, refreshToken)
        .catch(() => undefined)
        .finally(() => {
            clearSessionCookies(req, res)
            res.send(new BaseApi(ApiStatusCodes.STATUS_OK, 'Logout succeeded'))
        })
})

export default router
