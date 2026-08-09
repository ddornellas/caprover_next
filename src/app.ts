import express = require('express')
import path = require('path')
import favicon = require('serve-favicon')
import loggerMorgan = require('morgan')
import cookieParser = require('cookie-parser')
import bodyParser = require('body-parser')
import httpProxyImport = require('http-proxy')

import * as http from 'http'
import ApiStatusCodes from './api/ApiStatusCodes'
import BaseApi from './api/BaseApi'
import DockerApi from './docker/DockerApi'
import InjectionExtractor from './injection/InjectionExtractor'
import * as Injector from './injection/Injector'
import DownloadRouter from './routes/download/DownloadRouter'
import LoginRouter from './routes/login/LoginRouter'
import ThemePublicRouter from './routes/public/ThemePublicRouter'
import UserRouter from './routes/user/UserRouter'
import AgentRouter from './routes/agent/AgentRouter'
import CaptainManager from './user/system/CaptainManager'
import CaptainConstants from './utils/CaptainConstants'
import Logger from './utils/Logger'
import { getTrustedHost, getTrustedProtocol } from './utils/RateLimiter'
import Utils from './utils/Utils'

// import { NextFunction, Request, Response } from 'express'

const httpProxy = httpProxyImport.createProxyServer({})

const debugCorsOrigins = new Set(
    (
        process.env.CAPROVER_DEBUG_ORIGINS ||
        'http://localhost:3000,http://127.0.0.1:3000,http://captain.localhost:3000'
    )
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
)

const app = express()
app.disable('x-powered-by')

function getCanonicalControlHost(req: express.Request) {
    const incomingHost = getTrustedHost(req)
    const canonicalHost = `${CaptainConstants.configs.captainSubDomain}.${CaptainManager.get().getRootDomain()}`
    return incomingHost === canonicalHost ? incomingHost : canonicalHost
}

app.set('views', path.join(__dirname, '../views'))
app.set('view engine', 'ejs')

app.use(favicon(path.join(__dirname, '../public', 'favicon.ico')))
app.use(
    loggerMorgan(
        function (tokens, req, res) {
            const requestUrl = tokens.url(req, res) || '-'
            const safeUrl = requestUrl.replace(
                /(token|password|secret|auth|key)=([^&\s]+)/gi,
                '$1=[REDACTED]'
            )
            return `${tokens.method(req, res)} ${safeUrl} ${tokens.status(req, res) || '-'} ${tokens['response-time'](req, res) || '-'} ms`
        },
        {
            skip: function (req) {
                return (
                    req.originalUrl === CaptainConstants.healthCheckEndPoint ||
                    req.originalUrl.startsWith(
                        CaptainConstants.netDataRelativePath + '/'
                    )
                )
            },
        }
    )
)
app.use(
    bodyParser.json({
        limit: '2mb',
    })
)
app.use(
    bodyParser.urlencoded({
        extended: false,
        limit: '2mb',
    })
)
app.use(cookieParser())

if (CaptainConstants.isDebug) {
    app.use('/', function (req, res, next) {
        const origin = req.get('Origin')
        if (origin && debugCorsOrigins.has(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin)
            res.setHeader('Vary', 'Origin')
            res.setHeader('Access-Control-Allow-Credentials', 'true')
            res.setHeader(
                'Access-Control-Allow-Headers',
                `${CaptainConstants.headerNamespace},${CaptainConstants.headerAuth},Content-Type`
            )
            res.setHeader(
                'Access-Control-Allow-Methods',
                'GET,POST,PUT,PATCH,DELETE,OPTIONS'
            )
            res.setHeader('Access-Control-Max-Age', '600')
        }

        if (req.method === 'OPTIONS') {
            if (origin && debugCorsOrigins.has(origin)) {
                res.sendStatus(204)
            } else {
                res.sendStatus(403)
            }
        } else {
            next()
        }
    })

    app.use('/force-exit', function (req, res, next) {
        res.send('Okay... I will exit in a second...')

        setTimeout(function () {
            process.exit(0)
        }, 500)
    })
}

app.use(Injector.injectGlobal())

app.use(function (req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), usb=()'
    )
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'; font-src 'self' data:"
    )

    if (req.path.startsWith('/api/') || req.path.startsWith('/net-data')) {
        res.setHeader('Cache-Control', 'no-store')
    }

    const requestIsSsl = getTrustedProtocol(req) === 'https'
    if (res.locals.forceSsl && requestIsSsl) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000')
    }

    next()
})

app.use(function (req, res, next) {
    if (InjectionExtractor.extractGlobalsFromInjected(res).forceSsl) {
        const isRequestSsl = getTrustedProtocol(req) === 'https'

        if (!isRequestSsl) {
            const redirectHost = getCanonicalControlHost(req)
            const newUrl = `https://${redirectHost}:${CaptainConstants.configs.nginxPortNumber443}${req.originalUrl}`
            res.redirect(302, newUrl)
            return
        }
    }

    next()
})

app.use(express.static(path.join(__dirname, '../dist-frontend')))

app.use(express.static(path.join(__dirname, 'public')))

app.use(CaptainConstants.healthCheckEndPoint, function (req, res, next) {
    res.send(CaptainManager.get().getHealthCheckUuid())
})

//  ************  Beginning of reverse proxy 3rd party services  ****************************************

app.use(CaptainConstants.netDataRelativePath, function (req, res, next) {
    if (
        req.originalUrl.indexOf(CaptainConstants.netDataRelativePath + '/') !==
        0
    ) {
        const isRequestSsl = getTrustedProtocol(req) === 'https'

        const newUrl =
            (isRequestSsl ? 'https://' : 'http://') +
            getCanonicalControlHost(req) +
            ':' +
            (isRequestSsl
                ? CaptainConstants.configs.nginxPortNumber443
                : CaptainConstants.configs.nginxPortNumber80) +
            CaptainConstants.netDataRelativePath +
            '/'
        res.redirect(302, newUrl)
        return
    }

    next()
})

app.use(
    CaptainConstants.netDataRelativePath,
    Injector.injectUserUsingCookieDataOnly()
)

app.use(CaptainConstants.netDataRelativePath, function (req, res, next) {
    if (!InjectionExtractor.extractUserFromInjected(res)) {
        Logger.e('User not logged in for NetData')
        res.sendStatus(500)
    } else {
        next()
    }
})

httpProxy.on('error', function (err, req, resOriginal: http.ServerResponse) {
    if (err) {
        Logger.e(err)
    }

    resOriginal.writeHead(500, {
        'Content-Type': 'text/plain',
    })

    if (
        (err + '').indexOf('getaddrinfo ENOTFOUND captain-netdata-container') >=
        0
    ) {
        resOriginal.end(
            'NetData is not running. Are you sure you have started it?'
        )
    } else {
        resOriginal.end('NetData proxy failed.')
    }
})

app.use(CaptainConstants.netDataRelativePath, function (req, res, next) {
    if (Utils.isNotGetRequest(req)) {
        res.writeHead(401, {
            'Content-Type': 'text/plain',
        })
        res.send('Demo mode is for viewing only')
        return
    }

    httpProxy.web(req, res, {
        target: `http://${CaptainConstants.netDataContainerName}:19999`,
    })
})

//  ************  End of reverse proxy 3rd party services  ****************************************

//  *********************  Beginning of API End Points  *******************************************

const API_PREFIX = '/api/'

app.use(API_PREFIX + ':apiVersionFromRequest/', function (req, res, next) {
    if (req.params.apiVersionFromRequest !== CaptainConstants.apiVersion) {
        res.send(
            new BaseApi(
                ApiStatusCodes.STATUS_ERROR_GENERIC,
                `This captain instance only accepts API ${CaptainConstants.apiVersion}`
            )
        )
        return
    }

    if (!InjectionExtractor.extractGlobalsFromInjected(res).initialized) {
        const response = new BaseApi(
            ApiStatusCodes.STATUS_ERROR_CAPTAIN_NOT_INITIALIZED,
            'Captain is not ready yet...'
        )
        res.send(response)
        return
    }

    if (DockerApi.get().dockerNeedsUpdate) {
        const response = new BaseApi(
            ApiStatusCodes.STATUS_ERROR_GENERIC,
            'Docker version is too old. Please update Docker to use CapRover.'
        )
        res.send(response)
        return
    }

    next()
})

// unsecured end points:
app.use(API_PREFIX + CaptainConstants.apiVersion + '/login/', LoginRouter)
app.use(
    API_PREFIX + CaptainConstants.apiVersion + '/downloads/',
    DownloadRouter
)
app.use(API_PREFIX + CaptainConstants.apiVersion + '/theme/', ThemePublicRouter)
app.use(API_PREFIX + CaptainConstants.apiVersion + '/agent/', AgentRouter)

// secured end points
app.use(API_PREFIX + CaptainConstants.apiVersion + '/user/', UserRouter)

//  *********************  End of API End Points  *******************************************

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    res.locals.err = new Error('Not Found')
    res.locals.err.errorStatus = 404
    next(res.locals.err)
})

// error handler
app.use(function (err, req, res, next) {
    Promise.reject(err).catch(ApiStatusCodes.createCatcher(res))
} as express.ErrorRequestHandler)

export default app

export function initializeCaptainWithDelay() {
    // Initializing with delay helps with debugging. Usually, docker didn't see the CAPTAIN service
    // if this was done without a delay
    setTimeout(function () {
        CaptainManager.get().initialize()
    }, 1500)
}
