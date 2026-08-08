import type { NextRequest } from 'next/server'

import { createProxyRequestInit } from '@/lib/proxy-request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
    params: Promise<{ path: string[] }>
}

function backendOrigin() {
    return (
        process.env.CAPROVER_API_ORIGIN ||
        `http://127.0.0.1:${process.env.PORT || '3000'}`
    ).replace(/\/$/, '')
}

async function proxy(request: NextRequest, context: RouteContext) {
    const { path } = await context.params
    const encodedPath = (path || [])
        .map((segment) => encodeURIComponent(segment))
        .join('/')
    const incomingUrl = new URL(request.url)
    const targetUrl = new URL(
        `${backendOrigin()}/api/v2/${encodedPath}${incomingUrl.pathname.endsWith('/') ? '/' : ''}`
    )
    targetUrl.search = incomingUrl.search

    const headers = new Headers(request.headers)
    headers.delete('host')
    headers.delete('content-length')
    headers.delete('content-encoding')
    headers.delete('connection')
    headers.delete('accept-encoding')
    if (!headers.has('x-forwarded-host')) {
        const host = request.headers.get('host')
        if (host) headers.set('x-forwarded-host', host)
    }
    if (!headers.has('x-forwarded-proto')) {
        const originProtocol = request.headers.get('origin')?.split(':', 1)[0]
        const forwardedProtocol =
            originProtocol || new URL(request.url).protocol.replace(':', '')
        headers.set('x-forwarded-proto', forwardedProtocol)
    }

    try {
        const response = await fetch(
            targetUrl,
            createProxyRequestInit(request, headers)
        )

        const responseHeaders = new Headers(response.headers)
        responseHeaders.delete('content-length')
        responseHeaders.delete('content-encoding')

        const getSetCookie = (
            response.headers as Headers & {
                getSetCookie?: () => string[]
            }
        ).getSetCookie
        if (getSetCookie) {
            responseHeaders.delete('set-cookie')
            for (const cookie of getSetCookie.call(response.headers)) {
                responseHeaders.append('set-cookie', cookie)
            }
        }

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        })
    } catch {
        return Response.json(
            {
                status: 1000,
                description: 'CapRover backend is unavailable.',
                data: {},
            },
            { status: 503 }
        )
    }
}

export const GET = proxy
export const HEAD = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
export const OPTIONS = proxy
