import { createProxyRequestInit } from '../frontend/lib/proxy-request'
import { getProxyProtocol } from '../frontend/lib/proxy-origin'

describe('Next CapRover proxy', () => {
    it('preserves the browser HTTPS origin across the internal HTTP hop', () => {
        const request = new Request(
            'http://captain.dorlab.uk/api/caprover/apps',
            {
                headers: {
                    host: 'captain.dorlab.uk',
                    origin: 'https://captain.dorlab.uk',
                    'x-forwarded-proto': 'http',
                },
            },
        )

        expect(
            getProxyProtocol(request, new URL(request.url))
        ).toBe('https')
    })

    it('uses the edge forwarded protocol for non-browser clients', () => {
        const request = new Request(
            'http://captain.dorlab.uk/api/caprover/apps',
            {
                headers: {
                    host: 'captain.dorlab.uk',
                    'x-forwarded-proto': 'https',
                },
            },
        )

        expect(
            getProxyProtocol(request, new URL(request.url))
        ).toBe('https')
    })

    it('forwards request bodies as streams', () => {
        const body = new ReadableStream<Uint8Array>()
        const init = createProxyRequestInit(
            { method: 'POST', body },
            new Headers({ 'content-type': 'application/octet-stream' })
        )

        expect(init.body).toBe(body)
        expect(init.duplex).toBe('half')
    })

    it('does not attach a body to GET requests', () => {
        const init = createProxyRequestInit(
            { method: 'GET', body: null },
            new Headers()
        )

        expect(init.body).toBeUndefined()
        expect(init.duplex).toBeUndefined()
    })
})
