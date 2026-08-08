#!/usr/bin/env node

console.log('Captain Starting ...')

// Check if Captain is running as an installer or not.
import * as http from 'http'
import path = require('path')
import app, { initializeCaptainWithDelay } from './app'
import { checkDockerVersion } from './docker/DockerApi'
import { AnyError } from './models/OtherTypes'
import CaptainConstants from './utils/CaptainConstants'
import * as CaptainInstaller from './utils/CaptainInstaller'
import EnvVars from './utils/EnvVars'
import debugModule = require('debug')

const debug = debugModule('caprover:server')

interface NextApp {
    prepare: () => Promise<void>
    getRequestHandler: () => (
        req: http.IncomingMessage,
        res: http.ServerResponse
    ) => void | Promise<void>
    getUpgradeHandler: () => (
        req: http.IncomingMessage,
        socket: import('stream').Duplex,
        head: Buffer
    ) => void | Promise<void>
}

const next = require('next') as unknown as (options: {
    dev: boolean
    dir: string
}) => NextApp

function startServer() {
    if (CaptainConstants.isDebug) {
        console.log('***DEBUG BUILD***')
    }

    if (!EnvVars.IS_CAPTAIN_INSTANCE) {
        console.log('Installing Captain Service ...')
        CaptainInstaller.install()
        return
    }

    void checkDockerVersion()

    const frontendDirectory = path.join(__dirname, '../frontend')
    const nextApp = next({
        dev: CaptainConstants.isDebug,
        dir: frontendDirectory,
    })

    nextApp
        .prepare()
        .then(function () {
            initializeCaptainWithDelay()

            /**
             * Get port from environment and store in Express.
             */
            const port = CaptainConstants.serviceContainerPort3000
            app.set('port', port)

            /**
             * Create one HTTP server. Operational/API requests keep using the
             * existing Express app, while web requests are rendered by Next.
             */
            const server = http.createServer(function (req, res) {
                if (isBackendRequest(req)) {
                    app(req, res)
                    return
                }

                nextApp.getRequestHandler()(req, res)
            })

            if (CaptainConstants.isDebug) {
                server.on('upgrade', nextApp.getUpgradeHandler())
            }

            server.listen(port)
            server.on('error', onError)
            server.on('listening', onListening)

            function onError(error: AnyError) {
                if (error.syscall !== 'listen') {
                    throw error
                }

                const bind =
                    typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port

                switch (error.code) {
                    case 'EACCES':
                        console.error(bind + ' requires elevated privileges')
                        process.exit(1)
                        break
                    case 'EADDRINUSE':
                        console.error(bind + ' is already in use')
                        process.exit(1)
                        break
                    default:
                        throw error
                }
            }

            function onListening() {
                const addr = server.address()
                const bind =
                    typeof addr === 'string'
                        ? 'pipe ' + addr
                        : 'port ' + addr?.port
                debug('Listening on ' + bind)
            }
        })
        .catch(function (error: AnyError) {
            console.error('Unable to start Next.js', error)
            process.exit(1)
        })
}

function isBackendRequest(req: http.IncomingMessage) {
    const requestUrl = new URL(
        req.url || '/',
        `http://${req.headers.host || 'localhost'}`
    )
    const pathname = requestUrl.pathname

    // Browser requests use this Next.js BFF route. It forwards to the
    // legacy-compatible Express API v2 without making the public API change.
    if (pathname === '/api/caprover' || pathname.startsWith('/api/caprover/')) {
        return false
    }

    return (
        pathname === '/api' ||
        pathname.startsWith('/api/') ||
        pathname === CaptainConstants.healthCheckEndPoint ||
        pathname === '/force-exit' ||
        pathname === CaptainConstants.netDataRelativePath ||
        pathname.startsWith(CaptainConstants.netDataRelativePath + '/')
    )
}

startServer()
