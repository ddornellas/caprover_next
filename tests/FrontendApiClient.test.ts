import {
    CAPTAIN_STATUS_DEPLOY_STARTED,
    CaptainApiError,
    isSuccessStatus,
    readResponse,
    clientApiRequest,
} from '../frontend/lib/api-client'
import { createServerApiHeaders } from '../frontend/lib/caprover-api'

describe('frontend API adapter', () => {
    it('accepts the API v2 success statuses', () => {
        expect(isSuccessStatus(100)).toBe(true)
        expect(isSuccessStatus(CAPTAIN_STATUS_DEPLOY_STARTED)).toBe(true)
        expect(isSuccessStatus(1102)).toBe(false)
    })

    it('returns typed payloads for successful responses', async () => {
        const response = new Response(
            JSON.stringify({
                status: 100,
                description: 'ok',
                data: { value: 1 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
        )

        await expect(
            readResponse<{ value: number }>(response)
        ).resolves.toEqual({
            status: 100,
            description: 'ok',
            data: { value: 1 },
        })
    })

    it('turns API v2 failures into a structured error', async () => {
        const response = new Response(
            JSON.stringify({
                status: 1102,
                description: 'not authorized',
                data: {},
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
        )

        await expect(readResponse(response)).rejects.toEqual(
            expect.objectContaining({
                constructor: CaptainApiError,
                status: 1102,
                message: 'not authorized',
            })
        )
    })

    it('sends browser calls through the Next BFF route', async () => {
        const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify({
                    status: 100,
                    description: 'ok',
                    data: { ready: true },
                }),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                }
            )
        )

        await expect(
            clientApiRequest<{ ready: boolean }>('/user/system/info/')
        ).resolves.toEqual({
            status: 100,
            description: 'ok',
            data: { ready: true },
        })
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/caprover/user/system/info',
            expect.objectContaining({ credentials: 'include' })
        )

        fetchMock.mockRestore()
    })

    it('marks loopback server calls as HTTPS when SSL is forced', () => {
        const headers = createServerApiHeaders({
            'x-test-header': 'present',
        })

        expect(headers.get('x-test-header')).toBe('present')
        expect(headers.get('x-forwarded-proto')).toBe('https')
    })
})
