import express = require('express')
import fs from 'fs/promises'
import path from 'path'
import validator from 'validator'
import ApiStatusCodes from '../../../api/ApiStatusCodes'
import BaseApi from '../../../api/BaseApi'
import DockerApi from '../../../docker/DockerApi'
import DockerUtils from '../../../docker/DockerUtils'
import InjectionExtractor from '../../../injection/InjectionExtractor'
import { IAppDef } from '../../../models/AppDefinition'
import { AutomatedCleanupConfigsCleaner } from '../../../models/AutomatedCleanupConfigs'
import CaptainManager from '../../../user/system/CaptainManager'
import VersionManager from '../../../user/system/VersionManager'
import { auditFromRequest } from '../../../user/AuditLogger'
import CaptainConstants from '../../../utils/CaptainConstants'
import Logger from '../../../utils/Logger'
import { redactSensitive, restoreRedactedSecrets } from '../../../utils/Redact'
import Utils from '../../../utils/Utils'
import ThemesRouter from './ThemesRouter'
import SystemRouteSelfHostRegistry from './selfhostregistry/SystemRouteSelfHostRegistry'

const router = express.Router()

router.use('/selfhostregistry/', SystemRouteSelfHostRegistry)
router.use('/themes/', ThemesRouter)

router.post('/createbackup/', function (req, res, next) {
    const backupManager = CaptainManager.get().getBackupManager()
    const dataStore =
        InjectionExtractor.extractUserFromInjected(res).user.dataStore

    Promise.resolve()
        .then(function () {
            return backupManager.createBackup(CaptainManager.get())
        })
        .then(function (backupInfo) {
            void auditFromRequest(
                dataStore,
                req,
                'backup.create',
                'success',
                'root-session'
            )
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Backup created.'
            )
            baseApi.data = backupInfo
            res.send(baseApi)
        })
        .catch(function (error) {
            void auditFromRequest(
                dataStore,
                req,
                'backup.create',
                'failure',
                'root-session'
            )
            ApiStatusCodes.createCatcher(res)(error)
        })
})

router.post('/changerootdomain/', function (req, res, next) {
    const requestedCustomDomain = Utils.removeHttpHttps(
        (req.body.rootDomain || '').toLowerCase()
    )

    if (
        !requestedCustomDomain ||
        requestedCustomDomain.length < 3 ||
        requestedCustomDomain.indexOf('/') >= 0 ||
        requestedCustomDomain.indexOf(':') >= 0 ||
        requestedCustomDomain.indexOf('%') >= 0 ||
        requestedCustomDomain.indexOf(' ') >= 0 ||
        requestedCustomDomain.indexOf('\\') >= 0
    ) {
        res.send(
            new BaseApi(ApiStatusCodes.STATUS_ERROR_GENERIC, 'Bad domain name.')
        )
        return
    }

    CaptainManager.get()
        .changeCaptainRootDomain(requestedCustomDomain, !!req.body.force)
        .then(function () {
            void auditFromRequest(
                InjectionExtractor.extractUserFromInjected(res).user.dataStore,
                req,
                'system.root_domain.change',
                'success',
                'root-session',
                requestedCustomDomain
            )
            res.send(
                new BaseApi(ApiStatusCodes.STATUS_OK, 'Root domain changed.')
            )
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.post('/enablessl/', function (req, res, next) {
    const emailAddress = req.body.emailAddress || ''

    if (
        !emailAddress ||
        emailAddress.length < 3 ||
        emailAddress.indexOf('/') >= 0 ||
        emailAddress.indexOf(':') >= 0 ||
        emailAddress.indexOf('%') >= 0 ||
        emailAddress.indexOf(' ') >= 0 ||
        emailAddress.indexOf('\\') >= 0 ||
        !validator.isEmail(emailAddress)
    ) {
        res.send(
            new BaseApi(
                ApiStatusCodes.STATUS_ERROR_GENERIC,
                'Bad email address.'
            )
        )
        return
    }

    CaptainManager.get()
        .enableSsl(emailAddress)
        .then(function () {
            // This is necessary as the CLI immediately tries to connect to https://captain.root.com
            // Without this delay it'll fail to connect
            Logger.d('Waiting for 7 seconds...')
            return Utils.getDelayedPromise(7000)
        })
        .then(function () {
            void auditFromRequest(
                InjectionExtractor.extractUserFromInjected(res).user.dataStore,
                req,
                'system.ssl.enable',
                'success',
                'root-session'
            )
            res.send(new BaseApi(ApiStatusCodes.STATUS_OK, 'Root SSL Enabled.'))
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.post('/forcessl/', function (req, res, next) {
    const isEnabled = !!req.body.isEnabled

    CaptainManager.get()
        .forceSsl(isEnabled)
        .then(function () {
            void auditFromRequest(
                InjectionExtractor.extractUserFromInjected(res).user.dataStore,
                req,
                'system.ssl.force',
                'success',
                'root-session',
                undefined,
                { enabled: isEnabled }
            )
            res.send(
                new BaseApi(
                    ApiStatusCodes.STATUS_OK,
                    `Non-SSL traffic is now ${
                        isEnabled ? 'rejected.' : 'allowed.'
                    }`
                )
            )
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/info/', function (req, res, next) {
    const dataStore =
        InjectionExtractor.extractUserFromInjected(res).user.dataStore

    return Promise.resolve()
        .then(function () {
            return dataStore.getHasRootSsl()
        })
        .then(async function (hasRootSsl) {
            const [hashedPassword, twoFactorEnabled, agentKeys] =
                await Promise.all([
                    dataStore.getHashedPassword(),
                    InjectionExtractor.extractUserFromInjected(
                        res
                    ).user.otpAuthenticator.is2FactorEnabled(),
                    dataStore.getAgentKeys(),
                ])
            return {
                hasRootSsl: hasRootSsl,
                forceSsl: CaptainManager.get().getForceSslValue(),
                rootDomain: dataStore.hasCustomDomain()
                    ? dataStore.getRootDomain()
                    : '',
                captainSubDomain: CaptainConstants.configs.captainSubDomain,
                passwordConfigured: !!hashedPassword,
                twoFactorEnabled,
                agentKeyCount: agentKeys.length,
                expiringAgentKeyCount: agentKeys.filter(
                    (key) =>
                        !key.revokedAt &&
                        !!key.expiresAt &&
                        Date.parse(key.expiresAt) > Date.now() &&
                        Date.parse(key.expiresAt) - Date.now() < 30 * 86400000
                ).length,
            }
        })
        .then(function (data) {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Captain info retrieved'
            )
            baseApi.data = data
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/audit/', function (req, res, next) {
    const dataStore =
        InjectionExtractor.extractUserFromInjected(res).user.dataStore
    const requestedLimit = Number(req.query.limit || 100)
    const limit = Number.isFinite(requestedLimit)
        ? Math.min(200, Math.max(1, requestedLimit))
        : 100

    return dataStore
        .getAuditEvents()
        .then(function (events) {
            const action = `${req.query.action || ''}`.trim()
            const filtered = action
                ? events.filter((event) => event.action === action)
                : events
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Audit events retrieved'
            )
            baseApi.data = { events: filtered.slice(-limit).reverse() }
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/loadbalancerinfo/', function (req, res, next) {
    return Promise.resolve()
        .then(function () {
            return CaptainManager.get().getLoadBalanceManager().getInfo()
        })
        .then(function (data) {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Load Balancer info retrieved'
            )
            baseApi.data = data
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/versionInfo/', function (req, res, next) {
    return Promise.resolve()
        .then(function () {
            return VersionManager.get().getCaptainImageTags()
        })
        .then(function (data) {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Version Info Retrieved'
            )
            baseApi.data = data
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.post('/versionInfo/', function (req, res, next) {
    const latestVersion = req.body.latestVersion
    const registryHelper =
        InjectionExtractor.extractUserFromInjected(
            res
        ).user.serviceManager.getRegistryHelper()

    return Promise.resolve()
        .then(function () {
            return VersionManager.get().updateCaptain(
                latestVersion,
                registryHelper
            )
        })
        .then(function () {
            void auditFromRequest(
                InjectionExtractor.extractUserFromInjected(res).user.dataStore,
                req,
                'system.update.start',
                'success',
                'root-session',
                `${latestVersion || ''}`
            )
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Captain update process has started...'
            )
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/diskcleanup/', function (req, res, next) {
    return Promise.resolve()
        .then(function () {
            return CaptainManager.get().getDiskCleanupManager().getConfigs()
        })
        .then(function (data) {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Disk cleanup configs retrieved'
            )
            baseApi.data = data
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.post('/diskcleanup/', function (req, res, next) {
    return Promise.resolve()
        .then(function () {
            const configs = AutomatedCleanupConfigsCleaner.sanitizeInput({
                mostRecentLimit: req.body.mostRecentLimit,
                cronSchedule: req.body.cronSchedule,
                timezone: req.body.timezone,
            })
            return CaptainManager.get()
                .getDiskCleanupManager()
                .setConfig(configs)
        })
        .then(function () {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Disk cleanup configs updated'
            )
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/netdata/', function (req, res, next) {
    const dataStore =
        InjectionExtractor.extractUserFromInjected(res).user.dataStore

    return Promise.resolve()
        .then(function () {
            return dataStore
                .getNetDataInfo()
                .then((data) => redactSensitive(data))
        })
        .then(function (data) {
            data.netDataUrl = `${
                CaptainConstants.configs.captainSubDomain
            }.${dataStore.getRootDomain()}${
                CaptainConstants.netDataRelativePath
            }`
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Netdata info retrieved'
            )
            baseApi.data = data
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.post('/netdata/', function (req, res, next) {
    const dataStore =
        InjectionExtractor.extractUserFromInjected(res).user.dataStore
    const requestedNetDataInfo = req.body?.netDataInfo
    if (
        !requestedNetDataInfo ||
        typeof requestedNetDataInfo !== 'object' ||
        Array.isArray(requestedNetDataInfo)
    ) {
        res.send(
            new BaseApi(
                ApiStatusCodes.ILLEGAL_PARAMETER,
                'netDataInfo must be an object'
            )
        )
        return
    }

    const netDataInfo = { ...(requestedNetDataInfo as Record<string, unknown>) }
    netDataInfo.netDataUrl = undefined // Frontend app returns this value, but we really don't wanna save this.
    // root address is subject to change.

    return Promise.resolve()
        .then(function () {
            return dataStore
                .getNetDataInfo()
                .then((current) =>
                    CaptainManager.get().updateNetDataInfo(
                        restoreRedactedSecrets(current, netDataInfo)
                    )
                )
        })
        .then(function () {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Netdata info is updated'
            )
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/goaccess/', function (req, res, next) {
    const dataStore =
        InjectionExtractor.extractUserFromInjected(res).user.dataStore

    return Promise.resolve()
        .then(function () {
            return dataStore.getGoAccessInfo()
        })
        .then(function (goAccessInfo) {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'GoAccess info retrieved'
            )
            baseApi.data = goAccessInfo
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.post('/goaccess/', function (req, res, next) {
    const goAccessInfo = req.body.goAccessInfo

    return Promise.resolve()
        .then(function () {
            return CaptainManager.get().updateGoAccessInfo(goAccessInfo)
        })
        .then(function () {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'GoAccess info is updated'
            )
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/goaccess/:appName/files', async function (req, res, next) {
    const dataStore =
        InjectionExtractor.extractUserFromInjected(res).user.dataStore

    const goAccessInfo = await dataStore.getGoAccessInfo()
    const loadBalanceManager = CaptainManager.get().getLoadBalanceManager()

    const appName = req.params.appName

    if (
        !appName ||
        appName !== path.basename(appName) ||
        appName.includes('..') ||
        appName.includes('\\')
    ) {
        const baseApi = new BaseApi(
            ApiStatusCodes.STATUS_ERROR_GENERIC,
            'Invalid appName'
        )
        baseApi.data = []
        res.send(baseApi)
        return
    }

    if (!goAccessInfo.isEnabled) {
        const baseApi = new BaseApi(
            ApiStatusCodes.STATUS_ERROR_GENERIC,
            'GoAccess not enabled'
        )
        baseApi.data = []
        res.send(baseApi)
        return
    }

    const directoryPath = path.join(
        CaptainConstants.nginxSharedLogsPathOnHost,
        appName
    )

    let appDefinition: IAppDef | undefined = undefined

    return Promise.resolve()
        .then(function () {
            // Ensure a valid appName parameter
            return dataStore.getAppsDataStore().getAppDefinition(appName)
        })
        .then(function (data) {
            appDefinition = data
            return fs.readdir(directoryPath).catch((e) => {
                Logger.d('No goaccess logs found')
                return []
            })
        })
        .then(function (files) {
            return Promise.all(
                files
                    // Make sure to only return the generated reports and not folders or the live report
                    // That will be added back later
                    .filter(
                        (f) => f.endsWith('.html') && !f.endsWith('Live.html')
                    )
                    .map((file) => {
                        return fs
                            .stat(path.join(directoryPath, file))
                            .then(function (fileStats) {
                                return {
                                    name: file,
                                    time: fileStats.mtime,
                                }
                            })
                    })
            )
        })
        .then(function (linkData) {
            const baseUrl = `/user/system/goaccess/`

            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'GoAccess info retrieved'
            )
            const linkList = linkData.map((d) => {
                const { domainName, fileName } =
                    loadBalanceManager.parseLogPath(d.name)
                return {
                    domainName,
                    name: fileName,
                    lastModifiedTime: d.time,
                    url: baseUrl + `${appName}/files/${d.name}`,
                }
            })

            // Add in the live report for all sites even if it might not exist yet since they're dynamic
            const allDomains = [
                `${appName}.${dataStore.getRootDomain()}`,
                ...appDefinition!.customDomain.map((d) => d.publicDomain),
            ]
            for (const domain of allDomains) {
                const name =
                    loadBalanceManager.getLogName(appName, domain) +
                    '--Live.html'
                linkList.push({
                    domainName: domain,
                    name,
                    lastModifiedTime: new Date(),
                    url: baseUrl + `${appName}/files/${name}`,
                })
            }

            linkList.sort(
                (a, b) =>
                    b.lastModifiedTime.getTime() - a.lastModifiedTime.getTime()
            )

            baseApi.data = linkList

            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/goaccess/:appName/files/:file', async function (req, res, next) {
    const { appName, file } = req.params
    if (
        !appName ||
        appName !== path.basename(appName) ||
        appName.includes('..') ||
        !file ||
        file !== path.basename(file) ||
        file.includes('\\') ||
        file.includes('\0') ||
        !file.endsWith('.html')
    ) {
        res.send(
            new BaseApi(ApiStatusCodes.ILLEGAL_PARAMETER, 'Invalid report path')
        )
        return
    }

    const { domainName, fileName } = CaptainManager.get()
        .getLoadBalanceManager()
        .parseLogPath(file)
    if (fileName.includes('Live')) {
        // Dynamically update the live reports by running the catchup script for the particular domain
        await DockerApi.get().createContainer({
            imageName: CaptainConstants.configs.goAccessImageName,
            command: ['./catchupLog.sh'],
            volumes: [
                {
                    hostPath: CaptainConstants.nginxSharedLogsPathOnHost,
                    containerPath: CaptainConstants.nginxSharedLogsPath,
                    mode: 'rw',
                },
            ],
            network: CaptainConstants.captainNetworkName,
            arrayOfEnvKeyAndValue: [
                {
                    key: 'FILE_PREFIX',
                    value: `${appName}--${domainName}`,
                },
                {
                    key: 'ANONYMIZE_IP',
                    value: CaptainConstants.configs.goAccessAnonymizeIP.toString(),
                },
            ],
            sticky: false,
            wait: true,
        })
    }

    const fileRelativePath = `${appName}/${file}`
    const absolutePath = path.join(
        CaptainConstants.nginxSharedLogsPathOnHost,
        appName,
        file
    )

    return Promise.resolve()
        .then(function () {
            return fs.readFile(absolutePath, 'utf8')
        })
        .then(function (fileContents) {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'GoAccess report retrieved'
            )
            baseApi.data = fileContents
            res.send(baseApi)
        })
        .catch(function (error) {
            Logger.e(error, 'Error getting GoAccess report ' + fileRelativePath)
            const baseApi = new BaseApi(
                ApiStatusCodes.NOT_FOUND,
                'Report not found'
            )
            res.send(baseApi)
        })
})

router.get('/nginxconfig/', function (req, res, next) {
    return Promise.resolve()
        .then(function () {
            return CaptainManager.get().getNginxConfig()
        })
        .then(function (data) {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Nginx config retrieved'
            )
            baseApi.data = data
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.post('/nginxconfig/', function (req, res, next) {
    const baseConfigCustomValue = req.body.baseConfig.customValue
    const captainConfigCustomValue = req.body.captainConfig.customValue

    return Promise.resolve()
        .then(function () {
            return CaptainManager.get().setNginxConfig(
                baseConfigCustomValue,
                captainConfigCustomValue
            )
        })
        .then(function () {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Nginx config is updated'
            )
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/nodes/', function (req, res, next) {
    return Promise.resolve()
        .then(function () {
            return CaptainManager.get().getNodesInfo()
        })
        .then(function (data) {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Node info retrieved'
            )
            baseApi.data = { nodes: data }
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.post('/nodes/', function (req, res, next) {
    const MANAGER = 'manager'
    const WORKER = 'worker'
    const registryHelper =
        InjectionExtractor.extractUserFromInjected(
            res
        ).user.serviceManager.getRegistryHelper()

    let isManager: boolean

    if (req.body.nodeType === MANAGER) {
        isManager = true
    } else if (req.body.nodeType === WORKER) {
        isManager = false
    } else {
        res.send(
            new BaseApi(
                ApiStatusCodes.STATUS_ERROR_GENERIC,
                'Node type should be either manager or worker'
            )
        )
        return
    }

    const privateKey = req.body.privateKey
    const remoteNodeIpAddress = `${req.body.remoteNodeIpAddress || ''}`.trim()
    const captainIpAddress = `${req.body.captainIpAddress || ''}`.trim()
    const rawSshPort = req.body.sshPort
    const sshPort =
        rawSshPort === undefined || rawSshPort === '' ? 22 : Number(rawSshPort)
    const sshUser =
        req.body.sshUser === undefined
            ? 'root'
            : typeof req.body.sshUser === 'string'
              ? req.body.sshUser.trim()
              : ''

    if (
        !captainIpAddress ||
        !remoteNodeIpAddress ||
        !privateKey ||
        !/^[a-z0-9_.:\[\]-]{1,253}$/i.test(captainIpAddress) ||
        !/^[a-z0-9_.:\[\]-]{1,253}$/i.test(remoteNodeIpAddress) ||
        !Number.isInteger(sshPort) ||
        sshPort < 1 ||
        sshPort > 65535 ||
        !/^[a-z_][a-z0-9_-]{0,31}$/i.test(sshUser) ||
        typeof privateKey !== 'string' ||
        privateKey.length > 100_000
    ) {
        res.send(
            new BaseApi(
                ApiStatusCodes.ILLEGAL_PARAMETER,
                'Private key, IPv4 addresses, SSH username and a valid SSH port are required'
            )
        )
        return
    }

    return Promise.resolve()
        .then(function () {
            return registryHelper.getDefaultPushRegistryId()
        })
        .then(function (defaultRegistry) {
            if (!defaultRegistry) {
                throw ApiStatusCodes.createError(
                    ApiStatusCodes.STATUS_ERROR_GENERIC,
                    'There is no default Docker Registry. You need a repository for your images before adding nodes. Read docs.'
                )
            }
        })
        .then(function () {
            return DockerUtils.joinDockerNode(
                DockerApi.get(),
                sshUser,
                sshPort,
                captainIpAddress,
                isManager,
                remoteNodeIpAddress,
                privateKey
            )
        })
        .then(function () {
            const msg = 'Docker node is successfully joined.'
            Logger.d(msg)
            res.send(new BaseApi(ApiStatusCodes.STATUS_OK, msg))
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

export default router
