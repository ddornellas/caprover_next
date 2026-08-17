import { ICaptainDefinition } from './ICaptainDefinition'

export const AGENT_ROLES = ['read', 'deploy_approval', 'deploy'] as const
export type AgentRole = (typeof AGENT_ROLES)[number]

export interface AgentPolicy {
    allowAppCreation?: boolean
    allowDockerfileDeploys?: boolean
    allowedImagePrefixes?: string[]
}

export const AGENT_DEPLOYMENT_STATUSES = [
    'pending',
    'running',
    'succeeded',
    'failed',
    'rejected',
    'expired',
] as const
export type AgentDeploymentStatus = (typeof AGENT_DEPLOYMENT_STATUSES)[number]

export interface AgentKeyRecord {
    id: string
    name: string
    role: AgentRole
    appNames: string[]
    tokenHash: string
    createdAt: string
    expiresAt?: string
    revokedAt?: string
    pausedAt?: string
    lastUsedAt?: string
    rotatedAt?: string
    owner?: string
    purpose?: string
    provider?: string
    policy?: AgentPolicy
}

export type AgentKeyMetadata = Omit<AgentKeyRecord, 'tokenHash'>

export interface AgentDeploymentRequest {
    id: string
    agentKeyId: string
    agentKeyName: string
    role: AgentRole
    appName: string
    isNewApp: boolean
    description?: string
    captainDefinition: ICaptainDefinition
    gitHash?: string
    /** SHA-256 of the caller supplied idempotency key; never expose the raw key. */
    idempotencyKeyHash?: string
    /** Legacy persisted field retained only for migration of older stores. */
    idempotencyKey?: string
    status: AgentDeploymentStatus
    createdAt: string
    expiresAt: string
    updatedAt: string
    approvedAt?: string
    approvedBy?: string
    rejectedAt?: string
    rejectedBy?: string
    rejectionReason?: string
    startedAt?: string
    completedAt?: string
    error?: string
    previousVersion?: number
    deployedVersion?: number
    verification?: 'passed' | 'failed'
    rolledBackAt?: string
}
