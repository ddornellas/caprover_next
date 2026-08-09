import { auditFromRequest, recordAuditEvent } from '../src/user/AuditLogger'

test('audit metadata is redacted and direct proxy headers cannot spoof the IP', async () => {
    const store = {
        appendAuditEvent: jest.fn().mockResolvedValue(undefined),
    }
    const request = {
        get: (header: string) =>
            header === 'X-Real-IP' ? '203.0.113.99' : undefined,
        socket: { remoteAddress: '198.51.100.10' },
    }

    await auditFromRequest(
        store as any,
        request as any,
        'auth.login',
        'denied',
        'anonymous',
        undefined,
        { password: 'secret', attempt: 1 }
    )

    expect(store.appendAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
            ip: '198.51.100.10',
            metadata: { password: '[REDACTED]', attempt: 1 },
        })
    )
})

test('audit persistence failures do not break the request path', async () => {
    const store = {
        appendAuditEvent: jest.fn().mockRejectedValue(new Error('disk full')),
    }

    await expect(
        recordAuditEvent(store as any, {
            action: 'system.test',
            outcome: 'failure',
            actor: 'test',
        })
    ).resolves.toBeUndefined()
})
