import type { NextRequest } from 'next/server'
import { isIP } from 'node:net'

import { createProxyRequestInit } from '@/lib/proxy-request'
import { getProxyProtocol } from '@/lib/proxy-origin'

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
    // Never trust forwarded headers supplied by a browser. They influence
    // cookie security, redirect targets and CSRF origin checks in Express.
    headers.delete('x-forwarded-host')
    headers.delete('x-forwarded-proto')
    headers.delete('x-forwarded-for')
    headers.delete('x-real-ip')
    // The supported nginx entrypoint overwrites X-Real-IP/X-Forwarded-For
    // before this request reaches Next. Forward only a validated address and
    // never the browser's arbitrary forwarding chain to Express.
    const edgeClientIp =
        request.headers.get('x-real-ip') ||
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    if (edgeClientIp && isIP(edgeClientIp)) {
        headers.set('x-real-ip', edgeClientIp)
    }
    headers.set(
        'x-forwarded-host',
        request.headers.get('host') || incomingUrl.host
    )
    headers.set('x-forwarded-proto', getProxyProtocol(request, incomingUrl))

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
