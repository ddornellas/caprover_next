import { isSafeArchivePath, safeTarExtractOptions } from '../src/utils/SafeTar'
import { assertSafeHttpUrl, createPinnedHttpAgents } from '../src/utils/SafeUrl'
import {
    redactSensitive,
    redactText,
    restoreRedactedSecrets,
} from '../src/utils/Redact'

test('archive path validation rejects traversal', () => {
    expect(isSafeArchivePath('app/index.js')).toBe(true)
    expect(isSafeArchivePath('../outside.txt')).toBe(false)
    expect(isSafeArchivePath('/etc/passwd')).toBe(false)
    expect(isSafeArchivePath('nested/../../outside.txt')).toBe(false)
})

test('safe tar extraction rejects unsafe links and limits expansion', () => {
    const options = safeTarExtractOptions()

    expect(() => options.filter('../outside', { size: 1 })).toThrow()
    expect(() =>
        options.filter('link', {
            size: 0,
            type: 'SymbolicLink',
            linkpath: '../../outside',
        })
    ).toThrow()
})

test('safe URL validation rejects local and credential-bearing targets', async () => {
    await expect(
        assertSafeHttpUrl('http://127.0.0.1:2375/info')
    ).rejects.toThrow()
    await expect(assertSafeHttpUrl('http://localhost/admin')).rejects.toThrow()
    await expect(
        assertSafeHttpUrl('http://[::ffff:7f00:1]/admin')
    ).rejects.toThrow()
    await expect(
        assertSafeHttpUrl('https://user:password@example.com/repo')
    ).rejects.toThrow()
})

test('sensitive values can be redacted and preserved on update', () => {
    const current = {
        smtp: { password: 'keep-me' },
        slack: { hook: 'keep-hook' },
        enabled: true,
    }
    const safe = redactSensitive(current)
    expect(safe.smtp.password).toBe('[REDACTED]')
    expect(safe.slack.hook).toBe('[REDACTED]')
    expect(restoreRedactedSecrets(current, safe)).toEqual(current)
})

test('pinned HTTP agents never resolve outside the validated address set', () => {
    const agents = createPinnedHttpAgents({
        url: 'https://example.com/resource',
        hostname: 'example.com',
        addresses: [{ address: '93.184.216.34', family: 4 }],
    })
    const lookup = (agents.httpsAgent.options as any).lookup

    expect.assertions(2)
    lookup('example.com', {}, (error: Error | null, address: string) => {
        expect(error).toBeNull()
        expect(address).toBe('93.184.216.34')
    })

    agents.httpAgent.destroy()
    agents.httpsAgent.destroy()
})

test('text redaction removes credentials from persisted operation errors', () => {
    expect(
        redactText(
            'clone failed https://build-user:super-secret@example.com/repo?token=abc'
        )
    ).toBe(
        'clone failed https://build-user:[REDACTED]@example.com/repo?token=[REDACTED]'
    )
})
