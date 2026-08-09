import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { v4 as uuid } from 'uuid'

import ApiStatusCodes from '../../api/ApiStatusCodes'
import { uploadCaptainDefinitionContent } from '../../handlers/users/apps/appdata/AppDataHandler'
import {
    AgentDeploymentRequest,
    AgentKeyMetadata,
    AgentKeyRecord,
    AgentRole,
    AGENT_ROLES,
} from '../../models/AgentAccess'
import { ICaptainDefinition } from '../../models/ICaptainDefinition'
import type ServiceManager from '../ServiceManager'
import Logger from '../../utils/Logger'

const AGENT_KEY_PREFIX = 'cr_agent_'
const MAX_KEY_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000
const DEPLOYMENT_REQUEST_TTL_MS = 30 * 60 * 1000

export interface AgentAccessStore {
    getAgentKeys(): Promise<AgentKeyRecord[]>
    setAgentKeys(agentKeys: AgentKeyRecord[]): Promise<void>
    getAgentDeploymentRequests(): Promise<AgentDeploymentRequest[]>
    setAgentDeploymentRequests(
        requests: AgentDeploymentRequest[]
    ): Promise<void>
}

export interface CreateAgentKeyInput {
    name: unknown
    role: unknown
    appNames: unknown
    expiresAt?: unknown
}

export interface CreateAgentDeploymentInput {
    appName: unknown
    captainDefinition: unknown
    gitHash?: unknown
}

function nowIso() {
    return new Date().toISOString()
}

function isAgentKeyActive(record: AgentKeyRecord) {
    return (
        !record.revokedAt &&
        (!record.expiresAt || Date.parse(record.expiresAt) > Date.now())
    )
}

function error(code: number, message: string): never {
    throw ApiStatusCodes.createError(code, message)
}

function normalizeRole(value: unknown): AgentRole {
    if (
        typeof value !== 'string' ||
        !AGENT_ROLES.includes(value as AgentRole)
    ) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'role must be read, deploy_approval, or deploy'
        )
    }

    return value as AgentRole
}

function normalizeAppNames(value: unknown) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'appNames must contain between one and one hundred app names'
        )
    }

    const appNames = Array.from(
        new Set(
            value
                .filter(
                    (appName): appName is string => typeof appName === 'string'
                )
                .map((appName) => appName.trim())
                .filter(Boolean)
        )
    )

    if (!appNames.length || appNames.length !== value.length) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'appNames must contain unique, non-empty strings'
        )
    }

    return appNames
}

function normalizeExpiry(value: unknown) {
    if (value === undefined || value === null || value === '') {
        return undefined
    }

    if (typeof value !== 'string') {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'expiresAt must be an ISO date'
        )
    }

    const expiresAt = new Date(value)
    const now = Date.now()

    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'expiresAt must be in the future'
        )
    }

    if (expiresAt.getTime() > now + MAX_KEY_LIFETIME_MS) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'expiresAt cannot be more than one year in the future'
        )
    }

    return expiresAt.toISOString()
}

export function toAgentKeyMetadata(record: AgentKeyRecord): AgentKeyMetadata {
    const { tokenHash: _tokenHash, ...metadata } = record
    return metadata
}

export function hashAgentApiKey(apiKey: string) {
    return createHash('sha256').update(apiKey).digest('hex')
}

function hashesMatch(left: string, right: string) {
    const leftBuffer = Buffer.from(left, 'hex')
    const rightBuffer = Buffer.from(right, 'hex')

    return (
        leftBuffer.length === rightBuffer.length &&
        timingSafeEqual(leftBuffer, rightBuffer)
    )
}

export function extractAgentApiKey(authorizationHeader: unknown) {
    if (typeof authorizationHeader !== 'string') return undefined

    const match = authorizationHeader.match(/^Bearer\s+(.+)$/i)
    const apiKey = match?.[1]?.trim()

    return apiKey || undefined
}

export async function createAgentKey(
    store: AgentAccessStore,
    input: CreateAgentKeyInput
) {
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (!name || name.length > 80) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'name must be between one and eighty characters'
        )
    }

    const role = normalizeRole(input.role)
    const appNames = normalizeAppNames(input.appNames)
    const expiresAt = normalizeExpiry(input.expiresAt)
    const createdAt = nowIso()
    const id = `agent_${uuid()}`
    const secret = randomBytes(32).toString('base64url')
    const apiKey = `${AGENT_KEY_PREFIX}${id}_${secret}`
    const record: AgentKeyRecord = {
        id,
        name,
        role,
        appNames,
        tokenHash: hashAgentApiKey(apiKey),
        createdAt,
        expiresAt,
    }

    const keys = await store.getAgentKeys()
    await store.setAgentKeys([...keys, record])

    return {
        apiKey,
        metadata: toAgentKeyMetadata(record),
    }
}

export async function authenticateAgentApiKey(
    store: AgentAccessStore,
    apiKey: string | undefined
) {
    if (!apiKey || apiKey.length > 512) return undefined

    const requestedHash = hashAgentApiKey(apiKey)
    const keys = await store.getAgentKeys()
    const record = keys.find(
        (candidate) =>
            isAgentKeyActive(candidate) &&
            hashesMatch(requestedHash, candidate.tokenHash)
    )

    if (!record) return undefined

    record.lastUsedAt = nowIso()
    await store.setAgentKeys(keys)
    return record
}

export function assertAgentAppScope(record: AgentKeyRecord, appName: string) {
    if (!record.appNames.includes(appName)) {
        return error(
            ApiStatusCodes.STATUS_ERROR_NOT_AUTHORIZED,
            `Agent key is not allowed to access app: ${appName}`
        )
    }
}

export function assertAgentCanDeploy(record: AgentKeyRecord) {
    if (record.role === 'read') {
        return error(
            ApiStatusCodes.STATUS_ERROR_NOT_AUTHORIZED,
            'This agent key is read-only'
        )
    }
}

export function sanitizeCaptainDefinition(value: unknown): ICaptainDefinition {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'captainDefinition must be an object'
        )
    }

    const input = value as Record<string, unknown>
    const allowedKeys = new Set([
        'schemaVersion',
        'imageName',
        'dockerfileLines',
    ])
    const unexpectedKey = Object.keys(input).find(
        (key) => !allowedKeys.has(key)
    )
    if (unexpectedKey) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            `captainDefinition field is not allowed: ${unexpectedKey}`
        )
    }

    if (input.schemaVersion !== 2) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'captainDefinition.schemaVersion must be 2'
        )
    }

    const imageName = input.imageName
    const dockerfileLines = input.dockerfileLines
    const hasImageName = typeof imageName === 'string' && !!imageName.trim()
    const hasDockerfileLines = Array.isArray(dockerfileLines)

    if (hasImageName === hasDockerfileLines) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'Provide exactly one of imageName or dockerfileLines'
        )
    }

    if (hasImageName) {
        if (
            (imageName as string).length > 512 ||
            /[\r\n]/.test(imageName as string)
        ) {
            return error(
                ApiStatusCodes.ILLEGAL_PARAMETER,
                'imageName is too long or contains a line break'
            )
        }

        return { schemaVersion: 2, imageName: (imageName as string).trim() }
    }

    const lines = dockerfileLines as unknown[]
    if (!lines.length || lines.length > 256) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'dockerfileLines must contain between one and 256 lines'
        )
    }

    if (
        lines.some(
            (line) =>
                typeof line !== 'string' ||
                line.length > 2000 ||
                /[\r\n]/.test(line)
        )
    ) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'dockerfileLines contains an invalid line'
        )
    }

    if (lines.join('\n').length > 100_000) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'dockerfileLines is too large'
        )
    }

    return { schemaVersion: 2, dockerfileLines: lines as string[] }
}

function normalizeDeploymentInput(input: CreateAgentDeploymentInput) {
    const appName =
        typeof input.appName === 'string' ? input.appName.trim() : ''
    if (!appName || appName.length > 50) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'appName must be a valid existing app name'
        )
    }

    const gitHash =
        input.gitHash === undefined || input.gitHash === null
            ? undefined
            : typeof input.gitHash === 'string'
              ? input.gitHash.trim()
              : error(
                    ApiStatusCodes.ILLEGAL_PARAMETER,
                    'gitHash must be a string'
                )

    if (gitHash && (gitHash.length > 200 || /[\r\n]/.test(gitHash))) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'gitHash is too long or contains a line break'
        )
    }

    return {
        appName,
        captainDefinition: sanitizeCaptainDefinition(input.captainDefinition),
        gitHash: gitHash || undefined,
    }
}

export async function createAgentDeploymentRequest(
    store: AgentAccessStore,
    record: AgentKeyRecord,
    input: CreateAgentDeploymentInput
) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'Deployment payload must be an object'
        )
    }

    const allowedInputKeys = new Set([
        'appName',
        'captainDefinition',
        'gitHash',
    ])
    const unexpectedInputKey = Object.keys(input).find(
        (key) => !allowedInputKeys.has(key)
    )
    if (unexpectedInputKey) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            `Deployment field is not allowed: ${unexpectedInputKey}`
        )
    }

    if (!isAgentKeyActive(record)) {
        return error(
            ApiStatusCodes.STATUS_ERROR_NOT_AUTHORIZED,
            'This agent key is no longer active'
        )
    }

    assertAgentCanDeploy(record)
    const normalized = normalizeDeploymentInput(input)
    assertAgentAppScope(record, normalized.appName)

    const createdAt = nowIso()
    const request: AgentDeploymentRequest = {
        id: `agent_deploy_${uuid()}`,
        agentKeyId: record.id,
        agentKeyName: record.name,
        role: record.role,
        appName: normalized.appName,
        captainDefinition: normalized.captainDefinition,
        gitHash: normalized.gitHash,
        status: 'pending',
        createdAt,
        expiresAt: new Date(
            Date.now() + DEPLOYMENT_REQUEST_TTL_MS
        ).toISOString(),
        updatedAt: createdAt,
    }

    const requests = await store.getAgentDeploymentRequests()
    await store.setAgentDeploymentRequests([...requests, request])
    return request
}

export function getAgentDeploymentStatusForResponse(
    request: AgentDeploymentRequest
) {
    return {
        id: request.id,
        agentKeyId: request.agentKeyId,
        agentKeyName: request.agentKeyName,
        role: request.role,
        appName: request.appName,
        captainDefinition: request.captainDefinition,
        gitHash: request.gitHash,
        status: request.status,
        createdAt: request.createdAt,
        expiresAt: request.expiresAt,
        updatedAt: request.updatedAt,
        approvedAt: request.approvedAt,
        approvedBy: request.approvedBy,
        rejectedAt: request.rejectedAt,
        rejectedBy: request.rejectedBy,
        rejectionReason: request.rejectionReason,
        startedAt: request.startedAt,
        completedAt: request.completedAt,
        error: request.error,
    }
}

async function updateDeploymentRequest(
    store: AgentAccessStore,
    requestId: string,
    updater: (request: AgentDeploymentRequest) => void
) {
    const requests = await store.getAgentDeploymentRequests()
    const request = requests.find((candidate) => candidate.id === requestId)
    if (!request) {
        return error(ApiStatusCodes.NOT_FOUND, 'Deployment request not found')
    }

    updater(request)
    request.updatedAt = nowIso()
    await store.setAgentDeploymentRequests(requests)
    return request
}

export async function getAgentDeploymentRequest(
    store: AgentAccessStore,
    requestId: string
) {
    const requests = await store.getAgentDeploymentRequests()
    const request = requests.find((candidate) => candidate.id === requestId)
    if (!request) {
        return error(ApiStatusCodes.NOT_FOUND, 'Deployment request not found')
    }

    if (
        request.status === 'pending' &&
        Date.parse(request.expiresAt) <= Date.now()
    ) {
        request.status = 'expired'
        request.updatedAt = nowIso()
        await store.setAgentDeploymentRequests(requests)
    }

    return request
}

export async function startAgentDeployment(
    store: AgentAccessStore,
    requestId: string,
    actor: string
) {
    const request = await getAgentDeploymentRequest(store, requestId)
    if (request.status !== 'pending') {
        return error(
            ApiStatusCodes.ILLEGAL_OPERATION,
            `Deployment request is already ${request.status}`
        )
    }

    const key = (await store.getAgentKeys()).find(
        (candidate) => candidate.id === request.agentKeyId
    )
    if (!key || !isAgentKeyActive(key)) {
        return error(
            ApiStatusCodes.STATUS_ERROR_NOT_AUTHORIZED,
            'The agent key for this deployment is no longer active'
        )
    }

    return updateDeploymentRequest(store, requestId, (current) => {
        current.status = 'running'
        current.startedAt = nowIso()
        current.approvedAt = current.approvedAt || nowIso()
        current.approvedBy = current.approvedBy || actor
    })
}

export async function rejectAgentDeployment(
    store: AgentAccessStore,
    requestId: string,
    actor: string,
    reason: string
) {
    const cleanReason = reason.trim().slice(0, 500)
    return updateDeploymentRequest(store, requestId, (request) => {
        if (request.status !== 'pending') {
            return error(
                ApiStatusCodes.ILLEGAL_OPERATION,
                `Deployment request is already ${request.status}`
            )
        }

        request.status = 'rejected'
        request.rejectedAt = nowIso()
        request.rejectedBy = actor
        request.rejectionReason = cleanReason || 'Rejected by human approver'
    })
}

export async function runAgentDeployment(
    store: AgentAccessStore,
    serviceManager: ServiceManager,
    requestId: string
) {
    const request = await getAgentDeploymentRequest(store, requestId)
    if (request.status !== 'running') return request

    try {
        await uploadCaptainDefinitionContent(
            {
                appName: request.appName,
                isDetachedBuild: false,
                captainDefinitionContent: JSON.stringify(
                    request.captainDefinition
                ),
                gitHash: request.gitHash,
            },
            serviceManager
        )

        return updateDeploymentRequest(store, requestId, (current) => {
            current.status = 'succeeded'
            current.completedAt = nowIso()
        })
    } catch (deploymentError) {
        Logger.e(
            deploymentError as Error,
            `Agent deployment failed: ${requestId}`
        )
        const message = `${deploymentError || 'Deployment failed'}`.slice(
            0,
            2000
        )

        return updateDeploymentRequest(store, requestId, (current) => {
            current.status = 'failed'
            current.completedAt = nowIso()
            current.error = message
        })
    }
}

export async function revokeAgentKey(store: AgentAccessStore, keyId: string) {
    const keys = await store.getAgentKeys()
    const record = keys.find((key) => key.id === keyId)
    if (!record) {
        return error(ApiStatusCodes.NOT_FOUND, 'Agent key not found')
    }

    record.revokedAt = nowIso()
    await store.setAgentKeys(keys)
    return record
}
