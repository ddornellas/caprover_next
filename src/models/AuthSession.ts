export interface RefreshSessionRecord {
    id: string
    tokenHash: string
    createdAt: string
    expiresAt: string
    lastUsedAt?: string
    userAgent?: string
    ip?: string
}
