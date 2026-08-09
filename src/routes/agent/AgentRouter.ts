import express = require('express')

import ApiStatusCodes from '../../api/ApiStatusCodes'
import BaseApi from '../../api/BaseApi'
import { UserManagerProvider } from '../../user/UserManagerProvider'
import {
    assertAgentAppScope,
    authenticateAgentApiKey,
    createAgentDeploymentRequest,
    extractAgentApiKey,
    getAgentDeploymentRequest,
    getAgentDeploymentStatusForResponse,
    runAgentDeployment,
    startAgentDeployment,
} from '../../user/agents/AgentAccessManager'
import CaptainConstants from '../../utils/CaptainConstants'
import Logger from '../../utils/Logger'
import { auditFromRequest } from '../../user/AuditLogger'
import { getRequestClientKey, RateLimiter } from '../../utils/RateLimiter'
import { AgentKeyRecord } from '../../models/AgentAccess'
import type { AppStatus } from '../../models/AppDefinition'

const router = express.Router()
const agentRateLimiter = new RateLimiter(120, 60_000)

function getAgentKey(res: express.Response) {
    return res.locals.agentKey as AgentKeyRecord
}

function getUserManager() {
    return UserManagerProvider.get(CaptainConstants.rootNameSpace)
}

function sendAgentError(
    res: express.Response,
    statusCode: number,
    message: string
) {
    res.status(statusCode).send(
        new BaseApi(ApiStatusCodes.STATUS_ERROR_NOT_AUTHORIZED, message)
    )
}

function getAppStatus(app: { status?: AppStatus; instanceCount?: number }) {
    return (
        app.status || (Number(app.instanceCount) === 0 ? 'paused' : 'published')
    )
}

router.use(function (req, res, next) {
    const rateLimit = agentRateLimiter.consume(getRequestClientKey(req))
    if (!rateLimit.allowed) {
        res.setHeader('Retry-After', `${rateLimit.retryAfterSeconds}`)
        res.status(429).send(
            new BaseApi(
                ApiStatusCodes.STATUS_PASSWORD_BACK_OFF,
                'Too many agent requests. Please retry later.'
            )
        )
        return
    }
    const userManager = getUserManager()
    const apiKey = extractAgentApiKey(req.header('authorization'))

    return authenticateAgentApiKey(userManager.datastore, apiKey)
        .then(function (record) {
            if (!record) {
                sendAgentError(res, 401, 'A valid agent API key is required.')
                return
            }

            res.locals.agentKey = record
            res.locals.agentUserManager = userManager
            next()
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/', function (req, res) {
    const key = getAgentKey(res)
    const baseApi = new BaseApi(
        ApiStatusCodes.STATUS_OK,
        'Agent access is ready'
    )
    baseApi.data = {
        key: {
            id: key.id,
            name: key.name,
            role: key.role,
            appNames: key.appNames,
            expiresAt: key.expiresAt,
        },
        capabilities: {
            read: true,
            deploy: key.role !== 'read',
            requiresHumanApproval: key.role === 'deploy_approval',
            delete: false,
            ssh: false,
        },
    }
    res.send(baseApi)
})

router.get('/apps', function (req, res, next) {
    const key = getAgentKey(res)
    const userManager = res.locals.agentUserManager as ReturnType<
        typeof getUserManager
    >

    return userManager.datastore
        .getAppsDataStore()
        .getAppDefinitions()
        .then(function (apps) {
            const scopedApps = key.appNames
                .filter((appName) =>
                    Object.prototype.hasOwnProperty.call(apps, appName)
                )
                .map((appName) => {
                    const app = apps[appName]
                    const deployedVersion = app.deployedVersion || 0
                    const deployedVersionInfo = (app.versions || []).find(
                        (version) => version.version === deployedVersion
                    )

                    return {
                        appName,
                        projectId: app.projectId,
                        description: app.description,
                        deployedVersion,
                        deployedAt: deployedVersionInfo?.timeStamp,
                        status: getAppStatus(app),
                        isBuilding:
                            userManager.serviceManager.isAppBuilding(appName),
                        notExposeAsWebApp: !!app.notExposeAsWebApp,
                    }
                })

            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Scoped apps retrieved'
            )
            baseApi.data = { apps: scopedApps }
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/apps/:appName', function (req, res, next) {
    const key = getAgentKey(res)
    const userManager = res.locals.agentUserManager as ReturnType<
        typeof getUserManager
    >
    const appName = req.params.appName

    try {
        assertAgentAppScope(key, appName)
    } catch (error) {
        return ApiStatusCodes.createCatcher(res)(error)
    }

    return userManager.datastore
        .getAppsDataStore()
        .getAppDefinition(appName)
        .then(function (app) {
            const deployedVersion = app.deployedVersion || 0
            const deployedVersionInfo = (app.versions || []).find(
                (version) => version.version === deployedVersion
            )
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Scoped app retrieved'
            )
            baseApi.data = {
                app: {
                    appName,
                    projectId: app.projectId,
                    description: app.description,
                    deployedVersion,
                    deployedAt: deployedVersionInfo?.timeStamp,
                    status: getAppStatus(app),
                    isBuilding:
                        userManager.serviceManager.isAppBuilding(appName),
                    notExposeAsWebApp: !!app.notExposeAsWebApp,
                },
            }
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/apps/:appName/logs', function (req, res, next) {
    const key = getAgentKey(res)
    const userManager = res.locals.agentUserManager as ReturnType<
        typeof getUserManager
    >
    const appName = req.params.appName

    try {
        assertAgentAppScope(key, appName)
        const requestedEncoding = `${req.query.encoding || 'ascii'}`
        if (!['ascii', 'utf8'].includes(requestedEncoding)) {
            throw ApiStatusCodes.createError(
                ApiStatusCodes.ILLEGAL_PARAMETER,
                'encoding must be ascii or utf8'
            )
        }

        return userManager.serviceManager
            .getAppLogs(appName, requestedEncoding)
            .then(function (logs) {
                const baseApi = new BaseApi(
                    ApiStatusCodes.STATUS_OK,
                    'Scoped app logs retrieved'
                )
                baseApi.data = { appName, logs }
                res.send(baseApi)
            })
            .catch(ApiStatusCodes.createCatcher(res))
    } catch (error) {
        return ApiStatusCodes.createCatcher(res)(error)
    }
})

router.post('/deployments', function (req, res, next) {
    const key = getAgentKey(res)
    const userManager = res.locals.agentUserManager as ReturnType<
        typeof getUserManager
    >
    const appName = `${req.body?.appName || ''}`.trim()

    return Promise.resolve()
        .then(function () {
            assertAgentAppScope(key, appName)
            const requestedCreateApp = req.body?.createApp
            if (
                requestedCreateApp !== undefined &&
                typeof requestedCreateApp !== 'boolean'
            ) {
                throw ApiStatusCodes.createError(
                    ApiStatusCodes.ILLEGAL_PARAMETER,
                    'createApp must be a boolean'
                )
            }
            const createApp = requestedCreateApp === true
            return userManager.datastore
                .getAppsDataStore()
                .getAppDefinitions()
                .then(function (apps) {
                    const appExists = Object.prototype.hasOwnProperty.call(
                        apps,
                        appName
                    )
                    if (createApp && appExists) {
                        throw ApiStatusCodes.createError(
                            ApiStatusCodes.STATUS_ERROR_ALREADY_EXIST,
                            `App already exists: ${appName}`
                        )
                    }
                    if (!createApp && !appExists) {
                        throw ApiStatusCodes.createError(
                            ApiStatusCodes.NOT_FOUND,
                            `App does not exist: ${appName}. Set createApp to true to create it.`
                        )
                    }
                })
        })
        .then(function () {
            return createAgentDeploymentRequest(
                userManager.datastore,
                key,
                req.body,
                req.get('Idempotency-Key')
            )
        })
        .then(async function (request) {
            void auditFromRequest(
                userManager.datastore,
                req,
                'agent.deployment.request',
                'success',
                `agent:${key.id}`,
                request.id,
                { appName: request.appName, role: key.role }
            )
            if (key.role === 'deploy') {
                await startAgentDeployment(
                    userManager.datastore,
                    request.id,
                    `agent:${key.id}`
                )
                void runAgentDeployment(
                    userManager.datastore,
                    userManager.serviceManager,
                    request.id
                ).catch((error) =>
                    Logger.e(
                        error as Error,
                        `Agent deployment failed: ${request.id}`
                    )
                )
            }

            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK_DEPLOY_STARTED,
                key.role === 'deploy'
                    ? 'Deployment started'
                    : 'Deployment is waiting for human approval'
            )
            baseApi.data = {
                deployment: getAgentDeploymentStatusForResponse(
                    await getAgentDeploymentRequest(
                        userManager.datastore,
                        request.id
                    )
                ),
            }
            res.status(202).send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/deployments/:requestId', function (req, res, next) {
    const key = getAgentKey(res)
    const userManager = res.locals.agentUserManager as ReturnType<
        typeof getUserManager
    >

    return getAgentDeploymentRequest(
        userManager.datastore,
        req.params.requestId
    )
        .then(function (request) {
            if (request.agentKeyId !== key.id) {
                throw ApiStatusCodes.createError(
                    ApiStatusCodes.STATUS_ERROR_NOT_AUTHORIZED,
                    'Deployment request is outside this agent key scope'
                )
            }

            res.send(
                Object.assign(
                    new BaseApi(
                        ApiStatusCodes.STATUS_OK,
                        'Deployment status retrieved'
                    ),
                    {
                        data: {
                            deployment:
                                getAgentDeploymentStatusForResponse(request),
                        },
                    }
                )
            )
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

export default router
