import express = require('express')

import ApiStatusCodes from '../../../api/ApiStatusCodes'
import BaseApi from '../../../api/BaseApi'
import InjectionExtractor from '../../../injection/InjectionExtractor'
import {
    createAgentKey,
    getAgentDeploymentRequest,
    getAgentDeploymentStatusForResponse,
    rejectAgentDeployment,
    revokeAgentKey,
    runAgentDeployment,
    startAgentDeployment,
    toAgentKeyMetadata,
} from '../../../user/agents/AgentAccessManager'
import Logger from '../../../utils/Logger'

const router = express.Router()

function getUser(res: express.Response) {
    return InjectionExtractor.extractUserFromInjected(res).user
}

router.get('/keys/', function (req, res, next) {
    const user = getUser(res)
    return user.dataStore
        .getAgentKeys()
        .then(function (keys) {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Agent keys retrieved'
            )
            baseApi.data = { keys: keys.map(toAgentKeyMetadata) }
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.post('/keys/', function (req, res, next) {
    const user = getUser(res)
    const input = req.body || {}

    return Promise.resolve()
        .then(function () {
            const requestedAppNames = input.appNames
            if (!Array.isArray(requestedAppNames)) {
                throw ApiStatusCodes.createError(
                    ApiStatusCodes.ILLEGAL_PARAMETER,
                    'appNames is required'
                )
            }

            return user.dataStore
                .getAppsDataStore()
                .getAppDefinitions()
                .then(function (apps) {
                    const missingApp = requestedAppNames.find(
                        (appName: unknown) =>
                            typeof appName !== 'string' ||
                            !Object.prototype.hasOwnProperty.call(apps, appName)
                    )
                    if (missingApp !== undefined) {
                        throw ApiStatusCodes.createError(
                            ApiStatusCodes.ILLEGAL_PARAMETER,
                            `Cannot scope key to unknown app: ${missingApp}`
                        )
                    }
                })
        })
        .then(function () {
            return createAgentKey(user.dataStore, input)
        })
        .then(function (created) {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Agent key created. Store the returned apiKey now; it will not be shown again.'
            )
            baseApi.data = created
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.post('/keys/:keyId/revoke/', function (req, res, next) {
    const user = getUser(res)
    return revokeAgentKey(user.dataStore, req.params.keyId)
        .then(function (record) {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Agent key revoked'
            )
            baseApi.data = { key: toAgentKeyMetadata(record) }
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/deployments/', function (req, res, next) {
    const user = getUser(res)
    return user.dataStore
        .getAgentDeploymentRequests()
        .then(async function (requests) {
            const status = `${req.query.status || ''}`.trim()
            const filtered = status
                ? requests.filter((request) => request.status === status)
                : requests
            const active = await Promise.all(
                filtered.map((request) =>
                    getAgentDeploymentRequest(user.dataStore, request.id)
                )
            )
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Agent deployment requests retrieved'
            )
            baseApi.data = {
                deployments: active.map(getAgentDeploymentStatusForResponse),
            }
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.post('/deployments/:requestId/approve/', function (req, res, next) {
    const user = getUser(res)
    const actorPromise = user.dataStore
        .getUserEmailAddress()
        .then((email) => email || 'root-session')

    return actorPromise
        .then((actor) =>
            startAgentDeployment(user.dataStore, req.params.requestId, actor)
        )
        .then((request) => {
            void runAgentDeployment(
                user.dataStore,
                user.serviceManager,
                request.id
            ).catch((error) =>
                Logger.e(
                    error as Error,
                    `Agent deployment failed: ${request.id}`
                )
            )
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK_DEPLOY_STARTED,
                'Deployment approved and started'
            )
            baseApi.data = {
                deployment: getAgentDeploymentStatusForResponse(request),
            }
            res.status(202).send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.post('/deployments/:requestId/reject/', function (req, res, next) {
    const user = getUser(res)
    const reason = `${req.body?.reason || ''}`

    return user.dataStore
        .getUserEmailAddress()
        .then((email) => email || 'root-session')
        .then((actor) =>
            rejectAgentDeployment(
                user.dataStore,
                req.params.requestId,
                actor,
                reason
            )
        )
        .then((request) => {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Deployment rejected'
            )
            baseApi.data = {
                deployment: getAgentDeploymentStatusForResponse(request),
            }
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

export default router
