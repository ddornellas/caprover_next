import { createProxyRequestInit } from '../frontend/lib/proxy-request'

describe('Next CapRover proxy', () => {
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
