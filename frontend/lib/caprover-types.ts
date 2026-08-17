export interface ApiResponse<T = unknown> {
    status: number
    description: string
    data: T
}

export interface ProjectDefinition {
    id: string
    name: string
    description: string
    parentProjectId?: string
}

export interface AppEnvVar {
    key: string
    value: string
}

export interface AppVolume {
    containerPath: string
    volumeName?: string
    hostPath?: string
    mode?: string
}

export interface AppPort {
    containerPort: number
    hostPort: number
    protocol?: 'udp' | 'tcp'
    publishMode?: 'ingress' | 'host'
}

export interface AppVersion {
    version: number
    deployedImageName?: string
    timeStamp: string
    gitHash?: string
}

export type AppDomainType = 'internal' | 'external' | 'test' | 'custom'

export interface AppCustomDomain {
    publicDomain: string
    hasSsl: boolean
    domainType?: AppDomainType
}

export interface AppTag {
    tagName: string
}

export type AppStatus = 'published' | 'on_approval' | 'paused'

export interface AppDeployTokenConfig {
    enabled: boolean
    appDeployToken?: string
}

export interface AppRepoInfo {
    repo: string
    branch: string
    user: string
    sshKey?: string
    password: string
}

export interface AppPushWebhook {
    tokenVersion: string
    repoInfo: AppRepoInfo
    pushWebhookToken: string
}

export interface AppHttpAuth {
    user: string
    password?: string
    passwordHashed?: string
}

export interface AppDefinition {
    appName?: string
    projectId?: string
    description: string
    deployedVersion: number
    notExposeAsWebApp: boolean
    hasPersistentData: boolean
    hasDefaultSubDomainSsl: boolean
    containerHttpPort?: number
    captainDefinitionRelativeFilePath: string
    forceSsl: boolean
    websocketSupport: boolean
    nodeId?: string
    instanceCount: number
    preDeployFunction?: string
    serviceUpdateOverride?: string
    customNginxConfig?: string
    redirectDomain?: string
    networks: string[]
    customDomain: AppCustomDomain[]
    tags?: AppTag[]
    ports: AppPort[]
    volumes: AppVolume[]
    envVars: AppEnvVar[]
    versions: AppVersion[]
    appDeployTokenConfig?: AppDeployTokenConfig
    appPushWebhook?: AppPushWebhook
    httpAuth?: AppHttpAuth
    isLegacyAppName?: boolean
    isAppBuilding?: boolean
    status?: AppStatus
    isAgentPending?: boolean
    agentDeploymentRequestId?: string
    createdByAgent?: { id: string; name: string; at: string }
}

export interface AppsPayload {
    appDefinitions: AppDefinition[]
    rootDomain: string
    captainSubDomain: string
    defaultNginxConfig: string
}

export interface ProjectsPayload {
    projects: ProjectDefinition[]
}

export interface AppsWorkspaceData {
    systemInfo: SystemInfo
    apps: AppsPayload
    projects: ProjectDefinition[]
}

export interface SystemInfo {
    hasRootSsl: boolean
    forceSsl: boolean
    rootDomain: string
    captainSubDomain: string
    passwordConfigured?: boolean
    twoFactorEnabled?: boolean
    agentKeyCount?: number
    expiringAgentKeyCount?: number
}

export interface AuditEvent {
    id: string
    at: string
    action: string
    outcome: 'success' | 'failure' | 'denied'
    actor: string
    ip?: string
    resource?: string
    metadata?: Record<string, string | number | boolean | undefined>
}

export interface VersionInfo {
    canUpdate: boolean
    currentVersion: string
    latestVersion?: string
    changeLogMessage?: string
}

export interface LoadBalancerInfo {
    [key: string]: unknown
}

export interface NetDataInfo {
    [key: string]: unknown
}

export interface GoAccessInfo {
    [key: string]: unknown
}

export interface DockerNodeInfo {
    [key: string]: unknown
}

export interface DockerRegistryInfo {
    [key: string]: unknown
}
