import express = require('express')
import axios, { AxiosRequestConfig } from 'axios'
import ApiStatusCodes from '../../../api/ApiStatusCodes'
import BaseApi from '../../../api/BaseApi'
import InjectionExtractor from '../../../injection/InjectionExtractor'
import type { IOneClickTemplate } from '../../../models/IOneClickAppModels'
import { EventLogger } from '../../../user/events/EventLogger'
import {
    CapRoverEventFactory,
    CapRoverEventType,
} from '../../../user/events/ICapRoverEvent'
import OneClickAppDeployManager from '../../../user/oneclick/OneClickAppDeployManager'
import { OneClickDeploymentJobRegistry } from '../../../user/oneclick/OneClickDeploymentJobRegistry'
import { auditFromRequest } from '../../../user/AuditLogger'
import CaptainConstants from '../../../utils/CaptainConstants'
import Logger from '../../../utils/Logger'
import {
    assertSafeHttpUrl,
    createPinnedHttpAgents,
    resolveSafeHttpUrl,
} from '../../../utils/SafeUrl'

const router = express.Router()
const DEFAULT_ONE_CLICK_BASE_URL = 'https://oneclickapps.caprover.com'

const VERSION = `v4`

const HEADERS = {} as any
HEADERS[CaptainConstants.headerCapRoverVersion] =
    CaptainConstants.configs.version

const SAFE_HTTP_OPTIONS = {
    timeout: 15_000,
    maxRedirects: 0,
    maxContentLength: 2 * 1024 * 1024,
    maxBodyLength: 2 * 1024 * 1024,
}

async function safeAxiosRequest<T = unknown>(
    config: AxiosRequestConfig & { url: string }
) {
    const resolution = await resolveSafeHttpUrl(config.url)
    const agents = createPinnedHttpAgents(resolution)

    try {
        return await axios<T>({
            ...config,
            url: resolution.url,
            httpAgent: agents.httpAgent,
            httpsAgent: agents.httpsAgent,
            maxRedirects: 0,
        })
    } finally {
        agents.httpAgent.destroy()
        agents.httpsAgent.destroy()
    }
}

function validateOneClickDeploymentInput(
    template: unknown,
    values: unknown
): asserts template is IOneClickTemplate {
    if (!template || typeof template !== 'object' || Array.isArray(template)) {
        throw ApiStatusCodes.createError(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'Template must be an object'
        )
    }

    const templateObject = template as Record<string, any>
    if (
        !templateObject.caproverOneClickApp ||
        !Array.isArray(templateObject.caproverOneClickApp.variables) ||
        !templateObject.services ||
        typeof templateObject.services !== 'object' ||
        Array.isArray(templateObject.services)
    ) {
        throw ApiStatusCodes.createError(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'Template has an invalid one-click structure'
        )
    }

    if (!Array.isArray(values) || values.length > 100) {
        throw ApiStatusCodes.createError(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'values must be an array with at most 100 entries'
        )
    }

    if (
        values.some(
            (value) =>
                !value ||
                typeof value !== 'object' ||
                typeof value.key !== 'string' ||
                typeof value.value !== 'string' ||
                value.key.length > 200 ||
                value.value.length > 10_000
        )
    ) {
        throw ApiStatusCodes.createError(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'Each deployment value must contain bounded key and value strings'
        )
    }
}

function validateRepositoryUrl(url: string) {
    // Keep the official repository convenient, but apply the same DNS/IP
    // checks to it so a compromised DNS response cannot turn it into SSRF.
    return assertSafeHttpUrl(url)
}

interface IOneClickAppIdentifier {
    baseUrl: string
    isOfficial: boolean
    name: string
    displayName: string
    description: string
    logoUrl: string
    tags: string[]
}

export function normalizeOneClickTags(value: unknown): string[] {
    const rawTags = Array.isArray(value) ? value : value ? [value] : []

    return Array.from(
        new Set(
            rawTags
                .filter((tag): tag is string => typeof tag === 'string')
                .flatMap((tag) => tag.split(','))
                .map((tag) => tag.trim())
                .filter(Boolean)
                .map((tag) => tag.slice(0, 40))
        )
    ).slice(0, 12)
}

router.post('/repositories/insert', function (req, res, next) {
    const dataStore =
        InjectionExtractor.extractUserFromInjected(res).user.dataStore
    let apiBaseUrl = `${req.body.repositoryUrl || ''}`
    if (apiBaseUrl.endsWith('/')) {
        apiBaseUrl = apiBaseUrl.substring(0, apiBaseUrl.length - 1)
    }

    return Promise.resolve() //
        .then(function () {
            return validateRepositoryUrl(apiBaseUrl)
        })
        .then(function (safeApiBaseUrl) {
            apiBaseUrl = safeApiBaseUrl
            return dataStore.getAllOneClickBaseUrls()
        })
        .then(function (urls) {
            if (urls.indexOf(apiBaseUrl) >= 0)
                throw ApiStatusCodes.createError(
                    ApiStatusCodes.ILLEGAL_PARAMETER,
                    `Repository URL already exists: ${apiBaseUrl}`
                )

            return safeAxiosRequest<{ oneClickApps: any[] }>({
                method: 'get',
                url: apiBaseUrl + `/${VERSION}/list`,
                ...SAFE_HTTP_OPTIONS,
            })
                .then(function (axiosResponse) {
                    return axiosResponse.data.oneClickApps as any[]
                })
                .then(function (apps: any[]) {
                    if (!apps || !apps.length)
                        throw new Error(
                            `No apps were retrieved from ${apiBaseUrl}`
                        )
                })
                .catch((err) => {
                    Logger.e(err)
                    throw ApiStatusCodes.createError(
                        ApiStatusCodes.STATUS_ERROR_GENERIC,
                        `Could not fetch app lists from ${apiBaseUrl}`
                    )
                })
        })
        .then(function () {
            return dataStore.insertOneClickBaseUrl(apiBaseUrl)
        })
        .then(function () {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                `One Click apps repository URL is saved: ${apiBaseUrl}`
            )
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.post('/repositories/delete', function (req, res, next) {
    const dataStore =
        InjectionExtractor.extractUserFromInjected(res).user.dataStore
    let apiBaseUrl = `${req.body.repositoryUrl || ''}`
    if (apiBaseUrl.endsWith('/')) {
        apiBaseUrl = apiBaseUrl.substring(0, apiBaseUrl.length - 1)
    }

    return Promise.resolve() //
        .then(function () {
            return dataStore.getAllOneClickBaseUrls()
        })
        .then(function (urls) {
            if (urls.indexOf(apiBaseUrl) < 0)
                throw ApiStatusCodes.createError(
                    ApiStatusCodes.ILLEGAL_PARAMETER,
                    `Repository URL does not exist ${apiBaseUrl}`
                )
        })
        .then(function () {
            return dataStore.deleteOneClickBaseUrl(apiBaseUrl)
        })
        .then(function () {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                `One Click apps repository URL is deleted ${apiBaseUrl}`
            )
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/repositories/', function (req, res, next) {
    const dataStore =
        InjectionExtractor.extractUserFromInjected(res).user.dataStore

    return Promise.resolve() //
        .then(function () {
            return dataStore.getAllOneClickBaseUrls()
        })
        .then(function (urls) {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'One click repositories are retrieved '
            )
            baseApi.data = {}
            baseApi.data.urls = urls
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/template/list', function (req, res, next) {
    const dataStore =
        InjectionExtractor.extractUserFromInjected(res).user.dataStore
    const eventLogger =
        InjectionExtractor.extractUserFromInjected(res).user.userManager
            .eventLogger

    return Promise.resolve() //
        .then(function () {
            return dataStore.getAllOneClickBaseUrls()
        })
        .then(function (urls) {
            urls.push(DEFAULT_ONE_CLICK_BASE_URL)
            const promises = [] as Promise<IOneClickAppIdentifier[]>[]

            eventLogger.trackEvent(
                CapRoverEventFactory.create(
                    CapRoverEventType.OneClickAppListFetched,
                    {
                        numberOfRepos: urls.length,
                    }
                )
            )

            urls.forEach((apiBaseUrl) => {
                const p = validateRepositoryUrl(apiBaseUrl)
                    .then((safeApiBaseUrl) =>
                        safeAxiosRequest<{ oneClickApps: any[] }>({
                            method: 'get',
                            url: safeApiBaseUrl + `/${VERSION}/list`,
                            headers: HEADERS,
                            ...SAFE_HTTP_OPTIONS,
                        })
                    )
                    .then(function (axiosResponse) {
                        return axiosResponse.data.oneClickApps as any[]
                    })
                    .then(function (apps: any[]) {
                        return apps.map((element) => {
                            const ret: IOneClickAppIdentifier = {
                                baseUrl: apiBaseUrl,
                                name: element.name,
                                displayName: `${element.displayName}`,
                                isOfficial:
                                    (element.isOfficial + '').toLowerCase() ===
                                    'true',
                                description: `${element.description}`,
                                logoUrl:
                                    element.logoUrl &&
                                    (element.logoUrl.startsWith('http://') ||
                                        element.logoUrl.startsWith('https://'))
                                        ? element.logoUrl
                                        : `${apiBaseUrl}/${VERSION}/logos/${element.logoUrl}`,
                                tags: normalizeOneClickTags(
                                    element.tags ||
                                        element.categories ||
                                        element.category
                                ),
                            }
                            return ret
                        })
                    })
                    .catch((err) => {
                        Logger.e(err)
                        return [] as IOneClickAppIdentifier[]
                    })

                promises.push(p)
            })

            return Promise.all(promises)
        })
        .then(function (arrayOfArrays) {
            const allApps = [] as IOneClickAppIdentifier[]
            arrayOfArrays.map((appsFromBase) => {
                return allApps.push(...appsFromBase)
            })
            return allApps
        })
        .then(function (allApps) {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'All one click apps are retrieved'
            )
            baseApi.data = {}
            baseApi.data.oneClickApps = allApps
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/template/app', function (req, res, next) {
    const baseDomain = req.query.baseDomain as string
    const appName = req.query.appName as string
    const dataStore =
        InjectionExtractor.extractUserFromInjected(res).user.dataStore
    const eventLogger =
        InjectionExtractor.extractUserFromInjected(res).user.userManager
            .eventLogger

    return Promise.resolve() //
        .then(function () {
            return dataStore.getAllOneClickBaseUrls()
        })
        .then(function (urls) {
            urls.push(DEFAULT_ONE_CLICK_BASE_URL)
            if (urls.indexOf(baseDomain) < 0)
                throw ApiStatusCodes.createError(
                    ApiStatusCodes.ILLEGAL_PARAMETER,
                    'Unknown base URL '
                )

            return validateRepositoryUrl(baseDomain).then((safeBaseDomain) => {
                const appUrl = `${safeBaseDomain}/${VERSION}/apps/${encodeURIComponent(appName)}`
                Logger.d(`retrieving app at: ${appUrl}`)

                // Only log the official repo events
                if (baseDomain === DEFAULT_ONE_CLICK_BASE_URL) {
                    eventLogger.trackEvent(
                        CapRoverEventFactory.create(
                            CapRoverEventType.OneClickAppDetailsFetched,
                            {
                                appName,
                            }
                        )
                    )
                }

                return safeAxiosRequest({
                    method: 'get',
                    url: appUrl,
                    headers: HEADERS,
                    ...SAFE_HTTP_OPTIONS,
                }).then(function (responseObject) {
                    return responseObject.data
                })
            })
        })
        .then(function (appTemplate) {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'App template is retrieved'
            )
            baseApi.data = {}
            baseApi.data.appTemplate = appTemplate
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.post('/deploy', function (req, res, next) {
    const dataStore =
        InjectionExtractor.extractUserFromInjected(res).user.dataStore
    const serviceManager =
        InjectionExtractor.extractUserFromInjected(res).user.serviceManager
    const eventLogger =
        InjectionExtractor.extractUserFromInjected(res).user.userManager
            .eventLogger

    const template = req.body.template
    const values = req.body.values
    const templateName = req.body.templateName
    const deploymentJobRegistry = OneClickDeploymentJobRegistry.getInstance()

    return Promise.resolve() //
        .then(function () {
            validateOneClickDeploymentInput(template, values)

            return deploymentJobRegistry.initialize(dataStore).then(() => {
                const jobId = deploymentJobRegistry.createJob()

                reportAnalyticsOnAppDeploy(templateName, template, eventLogger)

                new OneClickAppDeployManager(
                    dataStore,
                    serviceManager,
                    (deploymentState) => {
                        deploymentJobRegistry.updateJobProgress(
                            jobId,
                            deploymentState
                        )
                        Logger.dev(
                            `Deployment state updated for jobId: ${jobId} (step ${deploymentState.currentStep})`
                        )
                    }
                ).startDeployProcess(template, values)

                void auditFromRequest(
                    dataStore,
                    req,
                    'oneclick.deploy',
                    'success',
                    'root-session',
                    jobId,
                    { templateName: `${templateName || 'unknown'}` }
                )

                const baseApi = new BaseApi(
                    ApiStatusCodes.STATUS_OK,
                    'One-click deployment started'
                )
                baseApi.data = { jobId }
                res.send(baseApi)
            })
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/deploy/progress', function (req, res, next) {
    const jobId = req.query.jobId as string
    const dataStore =
        InjectionExtractor.extractUserFromInjected(res).user.dataStore
    const deploymentJobRegistry = OneClickDeploymentJobRegistry.getInstance()

    return Promise.resolve() //
        .then(function () {
            // Validate input
            if (!jobId) {
                throw ApiStatusCodes.createError(
                    ApiStatusCodes.ILLEGAL_PARAMETER,
                    'Job ID is required'
                )
            }

            if (!/^deploy_[0-9a-f-]{36}$/.test(jobId)) {
                throw ApiStatusCodes.createError(
                    ApiStatusCodes.ILLEGAL_PARAMETER,
                    'Job ID is invalid'
                )
            }

            return deploymentJobRegistry.initialize(dataStore)
        })
        .then(function () {
            // Check if job exists
            if (!deploymentJobRegistry.jobExists(jobId)) {
                throw ApiStatusCodes.createError(
                    ApiStatusCodes.ILLEGAL_PARAMETER,
                    'Job ID not found'
                )
            }

            Logger.d(`Getting deployment progress for jobId: ${jobId}`)

            // Get the current job state from deployment manager
            const jobState = deploymentJobRegistry.getJobState(jobId)

            if (!jobState) {
                throw ApiStatusCodes.createError(
                    ApiStatusCodes.STATUS_ERROR_GENERIC,
                    'Unable to retrieve job state'
                )
            }

            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Deployment progress retrieved'
            )
            baseApi.data = jobState
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

export default router

// This function analyzes the provided template to identify any unused fields in Docker service definitions.
// It then logs an analytics event with the unused fields and the template name (if it's an official or known template).
// This helps track which fields users are using and may inform future improvements to the one-click app templates.
export function reportAnalyticsOnAppDeploy(
    templateName: any,
    template: any,
    eventLogger: EventLogger
) {
    const unusedDockerServiceFieldNames: string[] = []
    if (
        templateName === 'TEMPLATE_ONE_CLICK' ||
        templateName === 'DOCKER_COMPOSE'
    ) {
        if (template?.services) {
            const services = Array.isArray(template.services)
                ? template.services
                : Object.values(template.services)
            services.forEach((service: any) => {
                if (service && typeof service === 'object') {
                    Object.keys(service).forEach((key) => {
                        if (
                            !'image,environment,ports,volumes,depends_on,hostname,command,cap_add'
                                .split(',')
                                .includes(key)
                        ) {
                            // log the unused keys so that we can track what to add next
                            if (!unusedDockerServiceFieldNames.includes(key)) {
                                unusedDockerServiceFieldNames.push(key)
                            }
                        }
                    })
                }
            })
        }
    }

    // we do not want to log private repos names
    const templateNameToReport =
        templateName === 'TEMPLATE_ONE_CLICK' ||
        templateName === 'DOCKER_COMPOSE' ||
        (typeof templateName === 'string' &&
            templateName.startsWith('OFFICIAL_'))
            ? templateName
            : 'UNKNOWN'

    eventLogger.trackEvent(
        CapRoverEventFactory.create(
            CapRoverEventType.OneClickAppDeployStarted,
            {
                unusedFields: unusedDockerServiceFieldNames,
                templateName: templateNameToReport,
            }
        )
    )
}
