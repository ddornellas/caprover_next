import DataStore from '../../../../datastore/DataStore'
import { ICaptainDefinition } from '../../../../models/ICaptainDefinition'
import ServiceManager from '../../../../user/ServiceManager'
import CaptainConstants from '../../../../utils/CaptainConstants'
import Logger from '../../../../utils/Logger'
import { REDACTED, restoreRedactedSecrets } from '../../../../utils/Redact'
import { isSafeArchivePath } from '../../../../utils/SafeTar'

import ApiStatusCodes from '../../../../api/ApiStatusCodes'
import {
    AppDeployTokenConfig,
    IAppEnvVar,
    IAppPort,
    IAppTag,
    IAppVolume,
    IHttpAuth,
    RepoInfo,
} from '../../../../models/AppDefinition'
import { BaseHandlerResult } from '../../../BaseHandlerResult'

export interface RegisterAppDefinitionParams {
    appName: string
    projectId: string
    hasPersistentData: boolean
    isDetachedBuild: boolean
}

export async function registerAppDefinition(
    params: RegisterAppDefinitionParams,
    dataStore: DataStore,
    serviceManager: ServiceManager
): Promise<BaseHandlerResult> {
    const { appName, projectId, hasPersistentData, isDetachedBuild } = params
    let appCreated = false

    Logger.d(`Registering app started: ${appName}`)

    try {
        // Validate project if projectId is provided
        if (projectId) {
            await dataStore.getProjectsDataStore().getProject(projectId)
            // if project is not found, it will throw an error
        }

        // Register the app definition
        await dataStore
            .getAppsDataStore()
            .registerAppDefinition(appName, projectId, hasPersistentData)

        appCreated = true

        // Create captain definition content
        const captainDefinitionContent: ICaptainDefinition = {
            schemaVersion: 2,
            imageName: CaptainConstants.configs.appPlaceholderImageName,
        }

        // Schedule deployment (unless detached build)
        const promiseToIgnore = serviceManager
            .scheduleDeployNewVersion(appName, {
                captainDefinitionContentSource: {
                    captainDefinitionContent: JSON.stringify(
                        captainDefinitionContent
                    ),
                    gitHash: '',
                },
            })
            .catch(function (error) {
                Logger.e(error)
            })

        if (!isDetachedBuild) {
            await promiseToIgnore
        }

        Logger.d(`AppName is saved: ${appName}`)

        return {
            message: 'App Definition Saved',
        }
    } catch (error: any) {
        // Cleanup if app was created but something failed
        if (appCreated) {
            try {
                await dataStore.getAppsDataStore().deleteAppDefinition(appName)
            } catch (cleanupError) {
                Logger.e(
                    `Failed to cleanup app definition after error: ${cleanupError}`
                )
            }
        }

        // Re-throw the error
        throw error
    }
}

export interface GetAllAppDefinitionsResult extends BaseHandlerResult {
    data: {
        appDefinitions: any[]
        rootDomain: string
        captainSubDomain: string
        defaultNginxConfig: any
    }
}

export interface GetAllAppDefinitionsOptions {
    redactSecrets?: boolean
}

export async function getAllAppDefinitions(
    dataStore: DataStore,
    serviceManager: ServiceManager,
    options: GetAllAppDefinitionsOptions = {}
): Promise<GetAllAppDefinitionsResult> {
    Logger.d('Getting all app definitions started')

    try {
        const apps = await dataStore.getAppsDataStore().getAppDefinitions()
        const appsArray: any[] = []

        Object.keys(apps).forEach(function (key) {
            const app = JSON.parse(JSON.stringify(apps[key]))
            app.appName = key
            app.isAppBuilding = serviceManager.isAppBuilding(key)
            app.status =
                Number(app.instanceCount) === 0 ? 'paused' : 'published'
            app.isLegacyAppName = !!app.isLegacyAppName
            app.appPushWebhook = app.appPushWebhook || undefined
            if (app.appPushWebhook?.repoInfo) {
                // Git passwords and private keys are credentials, not app
                // metadata. Keep the response shape but never return them to
                // browser/CLI callers. PATCH preserves these values when the
                // redaction marker is submitted back.
                app.appPushWebhook.repoInfo.password = app.appPushWebhook
                    .repoInfo.password
                    ? '[REDACTED]'
                    : ''
                app.appPushWebhook.repoInfo.sshKey = app.appPushWebhook.repoInfo
                    .sshKey
                    ? '[REDACTED]'
                    : ''
            }
            if (options.redactSecrets) {
                if (app.appDeployTokenConfig) {
                    app.appDeployTokenConfig = {
                        ...app.appDeployTokenConfig,
                        appDeployToken: app.appDeployTokenConfig.appDeployToken
                            ? REDACTED
                            : undefined,
                    }
                }
                if (app.appPushWebhook) {
                    app.appPushWebhook.pushWebhookToken = app.appPushWebhook
                        .pushWebhookToken
                        ? REDACTED
                        : ''
                }
            }
            appsArray.push(app)
        })

        const existingAppNames = new Set(Object.keys(apps))
        const pendingAgentRequests =
            typeof dataStore.getAgentDeploymentRequests === 'function'
                ? await dataStore.getAgentDeploymentRequests()
                : []
        pendingAgentRequests
            .filter(
                (request) =>
                    request.isNewApp &&
                    request.status === 'pending' &&
                    Date.parse(request.expiresAt) > Date.now() &&
                    !existingAppNames.has(request.appName)
            )
            .forEach((request) => {
                appsArray.push({
                    appName: request.appName,
                    projectId: '',
                    description:
                        request.description ||
                        'Waiting for human approval before deployment.',
                    deployedVersion: 0,
                    notExposeAsWebApp: true,
                    hasPersistentData: false,
                    hasDefaultSubDomainSsl: false,
                    captainDefinitionRelativeFilePath: 'captain-definition',
                    forceSsl: false,
                    websocketSupport: false,
                    instanceCount: 0,
                    networks: [],
                    customDomain: [],
                    ports: [],
                    volumes: [],
                    envVars: [],
                    versions: [],
                    tags: [{ tagName: 'agent' }],
                    status: 'on_approval',
                    isAgentPending: true,
                    agentDeploymentRequestId: request.id,
                    createdByAgent: {
                        id: request.agentKeyId,
                        name: request.agentKeyName,
                        at: request.createdAt,
                    },
                    isAppBuilding: false,
                })
            })

        const defaultNginxConfig = await dataStore.getDefaultAppNginxConfig()

        Logger.d(`App definitions retrieved: ${appsArray.length} apps`)

        return {
            message: 'App definitions are retrieved.',
            data: {
                appDefinitions: appsArray,
                rootDomain: dataStore.getRootDomain(),
                captainSubDomain: CaptainConstants.configs.captainSubDomain,
                defaultNginxConfig: defaultNginxConfig,
            },
        }
    } catch (error: any) {
        Logger.e(`Failed to get app definitions: ${error}`)
        throw error
    }
}

export interface UpdateAppDefinitionParams {
    appName: string
    projectId?: string
    description?: string
    instanceCount?: number | string
    captainDefinitionRelativeFilePath?: string
    envVars?: IAppEnvVar[]
    volumes?: IAppVolume[]
    tags?: IAppTag[]
    nodeId?: string
    notExposeAsWebApp?: boolean
    containerHttpPort?: number | string
    httpAuth?: any
    forceSsl?: boolean
    ports?: IAppPort[]
    repoInfo?: RepoInfo | any
    customNginxConfig?: string
    redirectDomain?: string
    preDeployFunction?: string
    serviceUpdateOverride?: string
    websocketSupport?: boolean
    appDeployTokenConfig?: AppDeployTokenConfig
}

/**
 * Partially update an app definition by merging provided fields with existing values.
 * Only fields explicitly included in the request body are updated;
 * omitted fields retain their current values.
 *
 * This is safer than the full update (POST /update/) for operations like
 * scaling instance count, where you don't want to accidentally reset
 * env vars or other settings.
 */
export async function patchAppDefinition(
    appName: string,
    patch: Record<string, unknown>,
    dataStore: DataStore,
    serviceManager: ServiceManager
): Promise<BaseHandlerResult> {
    if (!appName) {
        throw ApiStatusCodes.createError(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'appName is required'
        )
    }

    // Fetch existing app definition to use as base
    const existingApp = await dataStore
        .getAppsDataStore()
        .getAppDefinition(appName)

    // Build base from existing app definition
    const base: UpdateAppDefinitionParams = {
        appName,
        projectId: existingApp.projectId,
        description: existingApp.description,
        instanceCount: existingApp.instanceCount,
        captainDefinitionRelativeFilePath:
            existingApp.captainDefinitionRelativeFilePath,
        envVars: existingApp.envVars,
        volumes: existingApp.volumes,
        tags: existingApp.tags,
        nodeId: existingApp.nodeId,
        notExposeAsWebApp: existingApp.notExposeAsWebApp,
        containerHttpPort: existingApp.containerHttpPort,
        httpAuth: (existingApp as any).httpAuth,
        forceSsl: existingApp.forceSsl,
        ports: existingApp.ports,
        repoInfo: existingApp.appPushWebhook?.repoInfo,
        customNginxConfig: existingApp.customNginxConfig,
        redirectDomain: existingApp.redirectDomain,
        preDeployFunction: existingApp.preDeployFunction,
        serviceUpdateOverride: existingApp.serviceUpdateOverride,
        websocketSupport: existingApp.websocketSupport,
        appDeployTokenConfig: existingApp.appDeployTokenConfig,
    }

    // Extract only defined patch fields, mapping to UpdateAppDefinitionParams keys
    const overrides: Partial<UpdateAppDefinitionParams> = {}
    for (const key of Object.keys(patch)) {
        // appName identifies the resource being patched; it is immutable and
        // must never replace the selector used by the route.
        if (key === 'appName') {
            continue
        } else if (key === 'appPushWebhook') {
            const requestedRepoInfo = (patch.appPushWebhook as any)?.repoInfo
            if (requestedRepoInfo) {
                const currentRepoInfo = base.repoInfo || {}
                overrides.repoInfo = {
                    ...requestedRepoInfo,
                    password:
                        requestedRepoInfo.password === '[REDACTED]' ||
                        !requestedRepoInfo.password
                            ? currentRepoInfo.password
                            : requestedRepoInfo.password,
                    sshKey:
                        requestedRepoInfo.sshKey === '[REDACTED]' ||
                        !requestedRepoInfo.sshKey
                            ? currentRepoInfo.sshKey
                            : requestedRepoInfo.sshKey,
                }
            } else {
                overrides.repoInfo = undefined
            }
        } else if (key === 'httpAuth') {
            const requestedAuth = patch.httpAuth as
                Record<string, unknown> | null | undefined
            overrides.httpAuth = requestedAuth
                ? { ...(base.httpAuth || {}), ...requestedAuth }
                : undefined
        } else if (key === 'appDeployTokenConfig') {
            const requestedTokenConfig = patch.appDeployTokenConfig as
                AppDeployTokenConfig | undefined
            const currentTokenConfig = base.appDeployTokenConfig || {
                enabled: false,
            }
            overrides.appDeployTokenConfig = requestedTokenConfig
                ? {
                      ...requestedTokenConfig,
                      appDeployToken:
                          requestedTokenConfig.appDeployToken ===
                              '[REDACTED]' ||
                          !requestedTokenConfig.appDeployToken
                              ? currentTokenConfig.appDeployToken
                              : requestedTokenConfig.appDeployToken,
                  }
                : undefined
        } else if (key in base) {
            ;(overrides as any)[key] = patch[key]
        }
    }

    const merged: UpdateAppDefinitionParams = { ...base, ...overrides }

    return updateAppDefinition(merged, serviceManager)
}

export async function updateAppDefinition(
    params: UpdateAppDefinitionParams,
    serviceManager: ServiceManager,
    currentRepoInfo?: RepoInfo,
    currentDeployTokenConfig?: AppDeployTokenConfig
): Promise<BaseHandlerResult> {
    const {
        appName,
        projectId,
        description,
        instanceCount,
        captainDefinitionRelativeFilePath,
        envVars,
        volumes,
        tags,
        nodeId,
        notExposeAsWebApp,
        containerHttpPort,
        httpAuth,
        forceSsl,
        ports,
        repoInfo: inputRepoInfo,
        customNginxConfig,
        redirectDomain,
        preDeployFunction,
        serviceUpdateOverride,
        websocketSupport,
        appDeployTokenConfig,
    } = params

    // Defaults & normalization
    const normalizedDescription = `${description || ''}`
    const instanceCountNum = Number(instanceCount ?? 0)
    const containerHttpPortNum = Number(containerHttpPort) || 80
    const normalizedEnvVars = envVars || []
    const normalizedVolumes = volumes || []
    const normalizedTags = tags || []
    const normalizedPorts = ports || []
    const normalizedNotExposeAsWebApp = !!notExposeAsWebApp
    const normalizedForceSsl = !!forceSsl
    const normalizedWebsocketSupport = !!websocketSupport
    const normalizedRedirectDomain = `${redirectDomain || ''}`
    const normalizedPreDeployFunction = `${preDeployFunction || ''}`
    const normalizedServiceUpdateOverride = `${serviceUpdateOverride || ''}`

    if (
        captainDefinitionRelativeFilePath &&
        !isSafeArchivePath(captainDefinitionRelativeFilePath)
    ) {
        throw ApiStatusCodes.createError(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'captainDefinitionRelativeFilePath must stay inside the uploaded source'
        )
    }

    let normalizedDeployTokenConfig: AppDeployTokenConfig | undefined
    if (!appDeployTokenConfig) {
        // Omitted server-owned secrets must never be interpreted as a request
        // to disable or erase them. Explicit `{ enabled: false }` remains the
        // supported way to disable an app token.
        normalizedDeployTokenConfig = currentDeployTokenConfig
            ? { ...currentDeployTokenConfig }
            : { enabled: false }
    } else {
        normalizedDeployTokenConfig = {
            enabled: !!appDeployTokenConfig.enabled,
            appDeployToken: `${
                appDeployTokenConfig.appDeployToken === '[REDACTED]' ||
                (!appDeployTokenConfig.appDeployToken &&
                    currentDeployTokenConfig?.enabled)
                    ? currentDeployTokenConfig?.appDeployToken
                    : appDeployTokenConfig.appDeployToken
                      ? appDeployTokenConfig.appDeployToken
                      : ''
            }`.trim(),
        }
    }

    const repoInfo: any = inputRepoInfo
        ? restoreRedactedSecrets(currentRepoInfo, inputRepoInfo)
        : currentRepoInfo
          ? { ...currentRepoInfo }
          : {}

    if (repoInfo.user) {
        repoInfo.user = repoInfo.user.trim()
    }
    if (repoInfo.repo) {
        repoInfo.repo = repoInfo.repo.trim()
    }
    if (repoInfo.branch) {
        repoInfo.branch = repoInfo.branch.trim()
    }

    if (
        (repoInfo.branch ||
            repoInfo.user ||
            repoInfo.repo ||
            repoInfo.password ||
            repoInfo.sshKey) &&
        (!repoInfo.branch ||
            !repoInfo.repo ||
            (!repoInfo.sshKey && !repoInfo.user && !repoInfo.password) ||
            (repoInfo.password && !repoInfo.user) ||
            (repoInfo.user && !repoInfo.password))
    ) {
        throw ApiStatusCodes.createError(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'Missing required Github/BitBucket/Gitlab field'
        )
    }

    if (
        repoInfo &&
        repoInfo.sshKey &&
        repoInfo.sshKey.indexOf('ENCRYPTED') > 0 &&
        !CaptainConstants.configs.disableEncryptedCheck
    ) {
        throw ApiStatusCodes.createError(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'You cannot use encrypted SSH keys'
        )
    }

    if (
        repoInfo &&
        repoInfo.sshKey &&
        repoInfo.sshKey.indexOf('END OPENSSH PRIVATE KEY-----') > 0
    ) {
        repoInfo.sshKey = repoInfo.sshKey.trim()
        repoInfo.sshKey = repoInfo.sshKey + '\n'
    }

    Logger.d(`Updating app started: ${appName}`)

    await serviceManager.updateAppDefinition(
        appName,
        `${projectId || ''}`,
        normalizedDescription,
        instanceCountNum,
        `${captainDefinitionRelativeFilePath || ''}`,
        normalizedEnvVars,
        normalizedVolumes,
        normalizedTags,
        `${nodeId || ''}`,
        normalizedNotExposeAsWebApp,
        containerHttpPortNum,
        httpAuth as IHttpAuth,
        normalizedForceSsl,
        normalizedPorts,
        repoInfo,
        `${customNginxConfig || ''}`,
        normalizedRedirectDomain,
        normalizedPreDeployFunction,
        normalizedServiceUpdateOverride,
        normalizedWebsocketSupport,
        normalizedDeployTokenConfig
    )

    Logger.d(`AppName is updated: ${appName}`)

    return {
        message: 'Updated App Definition Saved',
    }
}
