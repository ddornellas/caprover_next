export type AuditOutcome = 'success' | 'failure' | 'denied'

export interface AuditEventRecord {
    id: string
    at: string
    action: string
    outcome: AuditOutcome
    actor: string
    ip?: string
    resource?: string
    metadata?: Record<string, string | number | boolean | undefined>
}
