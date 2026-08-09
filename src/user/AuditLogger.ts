import { randomUUID } from 'crypto'
import type { Request } from 'express'
import type DataStore from '../datastore/DataStore'
import type { AuditEventRecord, AuditOutcome } from '../models/AuditEvent'
import { getRequestClientKey } from '../utils/RateLimiter'
import { redactSensitive } from '../utils/Redact'
import Logger from '../utils/Logger'

export function recordAuditEvent(
    dataStore: DataStore,
    input: Omit<AuditEventRecord, 'id' | 'at'>
) {
    const event: AuditEventRecord = {
        ...input,
        id: randomUUID(),
        at: new Date().toISOString(),
    }

    return dataStore.appendAuditEvent(event).catch((error) => {
        // Auditing must never break a deployment or authentication response.
        Logger.e(error, `Unable to persist audit event: ${event.action}`)
    })
}

export function auditFromRequest(
    dataStore: DataStore,
    req: Pick<Request, 'get' | 'socket'>,
    action: string,
    outcome: AuditOutcome,
    actor: string,
    resource?: string,
    metadata?: Record<string, string | number | boolean | undefined>
) {
    return recordAuditEvent(dataStore, {
        action,
        outcome,
        actor,
        ip: getRequestClientKey(req),
        resource,
        metadata: metadata ? redactSensitive(metadata) : undefined,
    })
}
