import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { v4 as uuid } from 'uuid'

import ApiStatusCodes from '../../api/ApiStatusCodes'
import { registerAppDefinition } from '../../handlers/users/apps/appdefinition/AppDefinitionHandler'
import { uploadCaptainDefinitionContent } from '../../handlers/users/apps/appdata/AppDataHandler'
import {
    AgentDeploymentRequest,
    AgentKeyMetadata,
    AgentKeyRecord,
    AgentRole,
    AgentPolicy,
    AGENT_ROLES,
} from '../../models/AgentAccess'
import { ICaptainDefinition } from '../../models/ICaptainDefinition'
import type ServiceManager from '../ServiceManager'
import type DataStore from '../../datastore/DataStore'
import { recordAuditEvent } from '../AuditLogger'
import Logger from '../../utils/Logger'
import { redactText } from '../../utils/Redact'
import { getAgentDeploymentDiagnostics } from './AgentDiagnostics'

const AGENT_KEY_PREFIX = 'cr_agent_'
const MAX_KEY_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000
const DEPLOYMENT_REQUEST_TTL_MS = 30 * 60 * 1000
const MAX_DEPLOYMENT_REQUESTS = 500
const MAX_DEPLOYMENT_REQUEST_AGE_MS = 30 * 24 * 60 * 60 * 1000
const AGENT_LAST_USED_WRITE_INTERVAL_MS = 60_000
const storeMutationQueues = new WeakMap<object, Promise<void>>()

async function withStoreMutation<T>(
    store: AgentAccessStore,
    operation: () => Promise<T>
): Promise<T> {
    const storeObject = store as object
    const previous = storeMutationQueues.get(storeObject) || Promise.resolve()
    const current = previous.then(operation)
    storeMutationQueues.set(
        storeObject,
        current.then(
            () => undefined,
            () => undefined
        )
    )
    return current
}

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
    owner?: unknown
    purpose?: unknown
    provider?: unknown
    policy?: unknown
}

export interface CreateAgentDeploymentInput {
    appName: unknown
    captainDefinition: unknown
    gitHash?: unknown
    createApp?: unknown
    description?: unknown
}

function normalizeIdempotencyKey(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined
    if (
        typeof value !== 'string' ||
        value.length > 128 ||
        /[\r\n]/.test(value)
    ) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'Idempotency-Key must be a short single-line string'
        )
    }
    return value.trim() || undefined
}

function hashIdempotencyKey(value: string | undefined) {
    return value ? createHash('sha256').update(value).digest('hex') : undefined
}

function migrateIdempotencyKeys(requests: AgentDeploymentRequest[]) {
    return requests.map((request) => {
        if (!request.idempotencyKey || request.idempotencyKeyHash) {
            return request
        }

        return {
            ...request,
            idempotencyKeyHash: hashIdempotencyKey(request.idempotencyKey),
            idempotencyKey: undefined,
        }
    })
}

function pruneDeploymentRequests(requests: AgentDeploymentRequest[]) {
    const cutoff = Date.now() - MAX_DEPLOYMENT_REQUEST_AGE_MS
    const retained = requests.filter((request) => {
        const timestamp = Date.parse(request.updatedAt || request.createdAt)
        return Number.isFinite(timestamp) && timestamp >= cutoff
    })

    return retained.length <= MAX_DEPLOYMENT_REQUESTS
        ? retained
        : retained
              .slice()
              .sort(
                  (left, right) =>
                      Date.parse(left.updatedAt || left.createdAt) -
                      Date.parse(right.updatedAt || right.createdAt)
              )
              .slice(-MAX_DEPLOYMENT_REQUESTS)
}

function nowIso() {
    return new Date().toISOString()
}

function isAgentKeyActive(record: AgentKeyRecord) {
    return (
        !record.revokedAt &&
        !record.pausedAt &&
        (!record.expiresAt || Date.parse(record.expiresAt) > Date.now())
    )
}

function normalizeOptionalLabel(value: unknown, field: string, max: number) {
    if (value === undefined || value === null || value === '') return undefined
    if (typeof value !== 'string') {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            `${field} must be a string`
        )
    }
    const normalized = value.trim()
    if (!normalized || normalized.length > max || /[\r\n]/.test(normalized)) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            `${field} must be a short single-line string`
        )
    }
    return normalized
}

function normalizePolicy(value: unknown): AgentPolicy | undefined {
    if (value === undefined || value === null) return undefined
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'policy must be an object'
        )
    }
    const input = value as Record<string, unknown>
    const allowed = new Set([
        'allowAppCreation',
        'allowDockerfileDeploys',
        'allowedImagePrefixes',
    ])
    const unexpected = Object.keys(input).find((key) => !allowed.has(key))
    if (unexpected) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            `policy field is not allowed: ${unexpected}`
        )
    }
    for (const field of ['allowAppCreation', 'allowDockerfileDeploys']) {
        if (input[field] !== undefined && typeof input[field] !== 'boolean') {
            return error(
                ApiStatusCodes.ILLEGAL_PARAMETER,
                `${field} must be a boolean`
            )
        }
    }
    let allowedImagePrefixes: string[] | undefined
    if (input.allowedImagePrefixes !== undefined) {
        if (!Array.isArray(input.allowedImagePrefixes)) {
            return error(
                ApiStatusCodes.ILLEGAL_PARAMETER,
                'allowedImagePrefixes must be an array'
            )
        }
        allowedImagePrefixes = Array.from(
            new Set(
                input.allowedImagePrefixes.map((prefix) =>
                    typeof prefix === 'string' ? prefix.trim() : ''
                )
            )
        ).filter(Boolean)
        if (
            allowedImagePrefixes.length > 20 ||
            allowedImagePrefixes.some(
                (prefix) => prefix.length > 200 || /[\r\n]/.test(prefix)
            )
        ) {
            return error(
                ApiStatusCodes.ILLEGAL_PARAMETER,
                'allowedImagePrefixes contains an invalid prefix'
            )
        }
    }
    return {
        allowAppCreation: input.allowAppCreation as boolean | undefined,
        allowDockerfileDeploys: input.allowDockerfileDeploys as
            boolean | undefined,
        allowedImagePrefixes,
    }
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

function hashesMatch(left: string, right: unknown) {
    if (
        !/^[0-9a-f]{64}$/i.test(left) ||
        typeof right !== 'string' ||
        !/^[0-9a-f]{64}$/i.test(right)
    ) {
        return false
    }

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
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'Agent key payload must be an object'
        )
    }
    const allowedInputKeys = new Set([
        'name',
        'role',
        'appNames',
        'expiresAt',
        'owner',
        'purpose',
        'provider',
        'policy',
    ])
    const unexpectedInputKey = Object.keys(input).find(
        (key) => !allowedInputKeys.has(key)
    )
    if (unexpectedInputKey) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            `Agent key field is not allowed: ${unexpectedInputKey}`
        )
    }
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
    const owner = normalizeOptionalLabel(input.owner, 'owner', 120)
    const purpose = normalizeOptionalLabel(input.purpose, 'purpose', 240)
    const provider = normalizeOptionalLabel(input.provider, 'provider', 80)
    const policy = normalizePolicy(input.policy)
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
        owner,
        purpose,
        provider,
        policy,
    }

    return withStoreMutation(store, async () => {
        const keys = await store.getAgentKeys()
        await store.setAgentKeys([...keys, record])

        return {
            apiKey,
            metadata: toAgentKeyMetadata(record),
        }
    })
}

export async function authenticateAgentApiKey(
    store: AgentAccessStore,
    apiKey: string | undefined
) {
    if (!apiKey || apiKey.length > 512) return undefined

    return withStoreMutation(store, async () => {
        const requestedHash = hashAgentApiKey(apiKey)
        const keys = await store.getAgentKeys()
        const record = keys.find(
            (candidate) =>
                isAgentKeyActive(candidate) &&
                hashesMatch(requestedHash, candidate.tokenHash)
        )

        if (!record) return undefined

        const lastUsedAt = record.lastUsedAt
            ? Date.parse(record.lastUsedAt)
            : Number.NaN
        if (
            !Number.isFinite(lastUsedAt) ||
            Date.now() - lastUsedAt >= AGENT_LAST_USED_WRITE_INTERVAL_MS
        ) {
            record.lastUsedAt = nowIso()
            await store.setAgentKeys(keys)
        }
        return record
    })
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

function assertAgentPolicy(
    record: AgentKeyRecord,
    deployment: ReturnType<typeof normalizeDeploymentInput>
) {
    const policy = record.policy
    // Existing keys without a policy preserve their historical behavior.
    if (!policy) return
    if (deployment.createApp && policy.allowAppCreation !== true) {
        return error(
            ApiStatusCodes.STATUS_ERROR_NOT_AUTHORIZED,
            'This agent key cannot create apps'
        )
    }
    if (
        deployment.captainDefinition.dockerfileLines &&
        policy.allowDockerfileDeploys !== true
    ) {
        return error(
            ApiStatusCodes.STATUS_ERROR_NOT_AUTHORIZED,
            'This agent key cannot deploy Dockerfile instructions'
        )
    }
    const imageName = deployment.captainDefinition.imageName
    if (
        imageName &&
        policy.allowedImagePrefixes?.length &&
        !policy.allowedImagePrefixes.some((prefix) =>
            imageName.startsWith(prefix)
        )
    ) {
        return error(
            ApiStatusCodes.STATUS_ERROR_NOT_AUTHORIZED,
            'The requested image is outside this agent key policy'
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
            'appName must be a valid app name'
        )
    }

    const createApp =
        input.createApp === undefined ? false : input.createApp === true
    if (input.createApp !== undefined && typeof input.createApp !== 'boolean') {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'createApp must be a boolean'
        )
    }

    const description =
        input.description === undefined || input.description === null
            ? undefined
            : typeof input.description === 'string'
              ? input.description.trim()
              : error(
                    ApiStatusCodes.ILLEGAL_PARAMETER,
                    'description must be a string'
                )
    if (
        description &&
        (description.length > 500 || /[\r\n]/.test(description))
    ) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'description is too long or contains a line break'
        )
    }

    if (description && !createApp) {
        return error(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            'description can only be used when createApp is true'
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
        createApp,
        description: description || undefined,
        captainDefinition: sanitizeCaptainDefinition(input.captainDefinition),
        gitHash: gitHash || undefined,
    }
}

export async function createAgentDeploymentRequest(
    store: AgentAccessStore,
    record: AgentKeyRecord,
    input: CreateAgentDeploymentInput,
    idempotencyKey?: string
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
        'createApp',
        'description',
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
    assertAgentPolicy(record, normalized)
    const normalizedIdempotencyKey = normalizeIdempotencyKey(idempotencyKey)
    const idempotencyKeyHash = hashIdempotencyKey(normalizedIdempotencyKey)

    return withStoreMutation(store, async () => {
        const requests = pruneDeploymentRequests(
            migrateIdempotencyKeys(await store.getAgentDeploymentRequests())
        )

        if (idempotencyKeyHash) {
            const existing = requests.find(
                (request) =>
                    request.agentKeyId === record.id &&
                    (request.idempotencyKeyHash === idempotencyKeyHash ||
                        request.idempotencyKey === normalizedIdempotencyKey) &&
                    Date.parse(request.expiresAt) > Date.now()
            )
            if (existing) {
                await store.setAgentDeploymentRequests(requests)
                return existing
            }
        }

        if (normalized.createApp) {
            const alreadyPending = requests.some(
                (request) =>
                    request.isNewApp &&
                    request.appName === normalized.appName &&
                    request.status === 'pending' &&
                    Date.parse(request.expiresAt) > Date.now()
            )
            if (alreadyPending) {
                return error(
                    ApiStatusCodes.STATUS_ERROR_ALREADY_EXIST,
                    `An approval request already exists for app: ${normalized.appName}`
                )
            }
        }

        const createdAt = nowIso()
        const request: AgentDeploymentRequest = {
            id: `agent_deploy_${uuid()}`,
            agentKeyId: record.id,
            agentKeyName: record.name,
            role: record.role,
            appName: normalized.appName,
            isNewApp: normalized.createApp,
            description: normalized.description,
            captainDefinition: normalized.captainDefinition,
            gitHash: normalized.gitHash,
            idempotencyKeyHash,
            status: 'pending',
            createdAt,
            expiresAt: new Date(
                Date.now() + DEPLOYMENT_REQUEST_TTL_MS
            ).toISOString(),
            updatedAt: createdAt,
        }

        await store.setAgentDeploymentRequests([...requests, request])
        return request
    })
}

export function previewAgentDeployment(
    record: AgentKeyRecord,
    input: CreateAgentDeploymentInput,
    appExists: boolean
) {
    const allowedInputKeys = new Set([
        'appName',
        'captainDefinition',
        'gitHash',
        'createApp',
        'description',
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
    assertAgentCanDeploy(record)
    const deployment = normalizeDeploymentInput(input)
    assertAgentAppScope(record, deployment.appName)
    assertAgentPolicy(record, deployment)
    if (deployment.createApp === appExists) {
        return error(
            deployment.createApp
                ? ApiStatusCodes.STATUS_ERROR_ALREADY_EXIST
                : ApiStatusCodes.NOT_FOUND,
            deployment.createApp
                ? `App already exists: ${deployment.appName}`
                : `App does not exist: ${deployment.appName}`
        )
    }
    return {
        appName: deployment.appName,
        operation: deployment.createApp ? 'create_and_deploy' : 'deploy',
        source: deployment.captainDefinition.imageName
            ? {
                  type: 'image',
                  imageName: deployment.captainDefinition.imageName,
              }
            : {
                  type: 'dockerfile',
                  lineCount:
                      deployment.captainDefinition.dockerfileLines?.length || 0,
              },
        requiresHumanApproval: record.role === 'deploy_approval',
        risks: [
            ...(deployment.createApp ? ['creates_app'] : ['replaces_version']),
            ...(deployment.captainDefinition.dockerfileLines
                ? ['builds_untrusted_instructions']
                : []),
        ],
        protectedActions: { deleteApps: false, ssh: false, secrets: false },
    }
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
        isNewApp: request.isNewApp,
        description: request.description,
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
        diagnostics: request.diagnostics,
        previousVersion: request.previousVersion,
        deployedVersion: request.deployedVersion,
        verification: request.verification,
        rolledBackAt: request.rolledBackAt,
    }
}

async function updateDeploymentRequest(
    store: AgentAccessStore,
    requestId: string,
    updater: (request: AgentDeploymentRequest) => void
) {
    return withStoreMutation(store, async () => {
        const requests = pruneDeploymentRequests(
            await store.getAgentDeploymentRequests()
        )
        const request = requests.find((candidate) => candidate.id === requestId)
        if (!request) {
            return error(
                ApiStatusCodes.NOT_FOUND,
                'Deployment request not found'
            )
        }

        updater(request)
        request.updatedAt = nowIso()
        await store.setAgentDeploymentRequests(requests)
        return request
    })
}

export async function getAgentDeploymentRequest(
    store: AgentAccessStore,
    requestId: string
) {
    return withStoreMutation(store, async () => {
        const requests = pruneDeploymentRequests(
            await store.getAgentDeploymentRequests()
        )
        const request = requests.find((candidate) => candidate.id === requestId)
        if (!request) {
            return error(
                ApiStatusCodes.NOT_FOUND,
                'Deployment request not found'
            )
        }

        if (
            request.status === 'pending' &&
            Date.parse(request.expiresAt) <= Date.now()
        ) {
            request.status = 'expired'
            request.updatedAt = nowIso()
            await store.setAgentDeploymentRequests(requests)
        } else if (
            request.status === 'running' &&
            Date.parse(request.expiresAt) <= Date.now()
        ) {
            request.status = 'failed'
            request.completedAt = nowIso()
            request.updatedAt = nowIso()
            request.error =
                'Deployment was interrupted or exceeded its execution window before completion.'
            request.verification = 'failed'
            request.diagnostics = [request.error]
            await store.setAgentDeploymentRequests(requests)
        }

        return request
    })
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
        if (current.status !== 'pending') {
            return error(
                ApiStatusCodes.ILLEGAL_OPERATION,
                `Deployment request is already ${current.status}`
            )
        }
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
    store: DataStore & AgentAccessStore,
    serviceManager: ServiceManager,
    requestId: string
) {
    const request = await getAgentDeploymentRequest(store, requestId)
    if (request.status !== 'running') return request

    let previousVersion: number | undefined
    let appCreatedByRequest = false
    try {
        if (!request.isNewApp) {
            const app = await store
                .getAppsDataStore()
                .getAppDefinition(request.appName)
            previousVersion = app.deployedVersion || 0
            await updateDeploymentRequest(store, requestId, (current) => {
                current.previousVersion = previousVersion
            })
        }
        if (request.isNewApp) {
            const apps = await store.getAppsDataStore().getAppDefinitions()
            if (Object.prototype.hasOwnProperty.call(apps, request.appName)) {
                throw ApiStatusCodes.createError(
                    ApiStatusCodes.STATUS_ERROR_ALREADY_EXIST,
                    `App already exists: ${request.appName}`
                )
            }

            await registerAppDefinition(
                {
                    appName: request.appName,
                    projectId: '',
                    hasPersistentData: false,
                    isDetachedBuild: true,
                },
                store,
                serviceManager
            )
            appCreatedByRequest = true
            await store
                .getAppsDataStore()
                .markAppCreatedByAgent(
                    request.appName,
                    request.agentKeyId,
                    request.agentKeyName,
                    request.description
                )
        }

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

        const deployedApp = await store
            .getAppsDataStore()
            .getAppDefinition(request.appName)
        const completed = await updateDeploymentRequest(
            store,
            requestId,
            (current) => {
                current.status = 'succeeded'
                current.completedAt = nowIso()
                current.verification = 'passed'
                current.deployedVersion = deployedApp.deployedVersion || 0
            }
        )
        void recordAuditEvent(store, {
            action: 'agent.deployment.run',
            outcome: 'success',
            actor: `agent:${request.agentKeyId}`,
            resource: request.id,
            metadata: { appName: request.appName },
        })
        return completed
    } catch (deploymentError) {
        Logger.e(
            deploymentError as Error,
            `Agent deployment failed: ${requestId}`
        )
        const message = redactText(
            `${deploymentError || 'Deployment failed'}`
        ).slice(0, 2000)
        let diagnostics: string[] | undefined
        try {
            diagnostics = getAgentDeploymentDiagnostics(
                serviceManager,
                request.appName,
                message
            )
        } catch (diagnosticsError) {
            Logger.e(
                diagnosticsError as Error,
                `Could not collect agent deployment diagnostics: ${requestId}`
            )
        }

        let rolledBackAt: string | undefined
        try {
            if (request.isNewApp && appCreatedByRequest) {
                await store
                    .getAppsDataStore()
                    .pauseFailedAgentApp(request.appName)
                await serviceManager.ensureServiceInitedAndUpdated(
                    request.appName
                )
                rolledBackAt = nowIso()
            } else if (previousVersion && previousVersion > 0) {
                const current = await store
                    .getAppsDataStore()
                    .getAppDefinition(request.appName)
                const attemptedVersion = (current.versions || []).find(
                    (version) => version.version === current.deployedVersion
                )
                const ownsAttemptedVersion =
                    current.deployedVersion === previousVersion + 1 &&
                    ((request.gitHash &&
                        attemptedVersion?.gitHash === request.gitHash) ||
                        (request.captainDefinition.imageName &&
                            attemptedVersion?.deployedImageName ===
                                request.captainDefinition.imageName))
                if (ownsAttemptedVersion) {
                    await store
                        .getAppsDataStore()
                        .rollbackAgentDeployment(
                            request.appName,
                            previousVersion
                        )
                    await serviceManager.ensureServiceInitedAndUpdated(
                        request.appName
                    )
                    rolledBackAt = nowIso()
                }
            }
        } catch (rollbackError) {
            Logger.e(
                rollbackError as Error,
                `Agent deployment rollback failed: ${requestId}`
            )
        }

        const failed = await updateDeploymentRequest(
            store,
            requestId,
            (current) => {
                current.status = 'failed'
                current.completedAt = nowIso()
                current.error = message
                current.diagnostics = diagnostics
                current.verification = 'failed'
                current.rolledBackAt = rolledBackAt
            }
        )
        void recordAuditEvent(store, {
            action: 'agent.deployment.run',
            outcome: 'failure',
            actor: `agent:${request.agentKeyId}`,
            resource: request.id,
            metadata: { appName: request.appName },
        })
        return failed
    }
}

export async function revokeAgentKey(store: AgentAccessStore, keyId: string) {
    return withStoreMutation(store, async () => {
        const keys = await store.getAgentKeys()
        const record = keys.find((key) => key.id === keyId)
        if (!record) {
            return error(ApiStatusCodes.NOT_FOUND, 'Agent key not found')
        }

        record.revokedAt = nowIso()
        await store.setAgentKeys(keys)
        return record
    })
}

async function updateAgentKey(
    store: AgentAccessStore,
    keyId: string,
    updater: (record: AgentKeyRecord) => void
) {
    return withStoreMutation(store, async () => {
        const keys = await store.getAgentKeys()
        const record = keys.find((key) => key.id === keyId)
        if (!record)
            return error(ApiStatusCodes.NOT_FOUND, 'Agent key not found')
        if (record.revokedAt) {
            return error(
                ApiStatusCodes.ILLEGAL_OPERATION,
                'Agent key is revoked'
            )
        }
        updater(record)
        await store.setAgentKeys(keys)
        return record
    })
}

export function pauseAgentKey(store: AgentAccessStore, keyId: string) {
    return updateAgentKey(store, keyId, (record) => {
        record.pausedAt = nowIso()
    })
}

export function resumeAgentKey(store: AgentAccessStore, keyId: string) {
    return updateAgentKey(store, keyId, (record) => {
        record.pausedAt = undefined
    })
}

export async function rotateAgentKey(store: AgentAccessStore, keyId: string) {
    let apiKey = ''
    const record = await updateAgentKey(store, keyId, (current) => {
        apiKey = `${AGENT_KEY_PREFIX}${current.id}_${randomBytes(32).toString('base64url')}`
        current.tokenHash = hashAgentApiKey(apiKey)
        current.rotatedAt = nowIso()
    })
    return { apiKey, metadata: toAgentKeyMetadata(record) }
}

export function getAgentLifecycleStatus(record: AgentKeyRecord) {
    if (record.revokedAt) return 'revoked'
    if (record.pausedAt) return 'paused'
    if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) {
        return 'expired'
    }
    return 'active'
}
