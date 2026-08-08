import { decodeAuthTokenFromRequest } from '../src/injection/AuthTokenExtractor'
import { isSameOriginRequest } from '../src/injection/Injector'

describe('decodeAuthTokenFromRequest', () => {
    test('uses the API auth header when it is present', async () => {
        const authenticator = {
            decodeAuthToken: jest
                .fn()
                .mockResolvedValue({ namespace: 'captain' }),
            decodeAuthTokenFromCookies: jest.fn(),
        }
        const request = {
            header: jest.fn().mockReturnValue('header-token'),
            cookies: { captainCookieAuth: 'cookie-token' },
        }

        await expect(
            decodeAuthTokenFromRequest(request, authenticator as any)
        ).resolves.toEqual({ namespace: 'captain' })
        expect(authenticator.decodeAuthToken).toHaveBeenCalledWith(
            'header-token'
        )
        expect(authenticator.decodeAuthTokenFromCookies).not.toHaveBeenCalled()
    })

    test('falls back to the login cookie for server-rendered requests', async () => {
        const authenticator = {
            decodeAuthToken: jest.fn(),
            decodeAuthTokenFromCookies: jest
                .fn()
                .mockResolvedValue({ namespace: 'captain' }),
        }
        const request = {
            header: jest.fn().mockReturnValue(undefined),
            cookies: { captainCookieAuth: 'cookie-token' },
        }

        await expect(
            decodeAuthTokenFromRequest(request, authenticator as any)
        ).resolves.toEqual({ namespace: 'captain' })
        expect(authenticator.decodeAuthTokenFromCookies).toHaveBeenCalledWith(
            'cookie-token'
        )
        expect(authenticator.decodeAuthToken).not.toHaveBeenCalled()
    })
})

describe('isSameOriginRequest', () => {
    test('accepts requests without an Origin header from CLI clients', () => {
        const request = {
            get: jest.fn().mockReturnValue(undefined),
            secure: false,
        }

        expect(isSameOriginRequest(request as any)).toBe(true)
    })

    test('rejects a cookie-authenticated mutation from another origin', () => {
        const request = {
            secure: true,
            get: jest.fn((header: string) => {
                const headers: Record<string, string> = {
                    Origin: 'https://attacker.example',
                    Host: 'captain.example',
                    'X-Forwarded-Proto': 'https',
                }
                return headers[header]
            }),
        }

        expect(isSameOriginRequest(request as any)).toBe(false)
    })

    test('accepts the forwarded origin of the CapRover host', () => {
        const request = {
            secure: true,
            get: jest.fn((header: string) => {
                const headers: Record<string, string> = {
                    Origin: 'https://captain.example',
                    Host: 'captain.example',
                    'X-Forwarded-Proto': 'https',
                }
                return headers[header]
            }),
        }

        expect(isSameOriginRequest(request as any)).toBe(true)
    })
})
