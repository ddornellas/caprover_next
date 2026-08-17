import type { ApiResponse } from './caprover-types'

export const CAPTAIN_STATUS_OK = 100
export const CAPTAIN_STATUS_DEPLOY_STARTED = 101
export const CAPTAIN_STATUS_PARTIALLY_OK = 102
export const CAPTAIN_STATUS_NOT_AUTHORIZED = 1102
export const CAPTAIN_STATUS_AUTH_TOKEN_INVALID = 1106
export const CAPTAIN_STATUS_OTP_REQUIRED = 1114
export const CAPTAIN_STATUS_NOT_INITIALIZED = 1001

export const isSuccessStatus = (status: number) =>
    status === CAPTAIN_STATUS_OK ||
    status === CAPTAIN_STATUS_DEPLOY_STARTED ||
    status === CAPTAIN_STATUS_PARTIALLY_OK

export class CaptainApiError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly httpStatus?: number,
        public readonly data?: unknown
    ) {
        super(message)
        this.name = 'CaptainApiError'
    }
}

let refreshPromise: Promise<boolean> | undefined

function refreshBrowserSession() {
    if (!refreshPromise) {
        refreshPromise = fetch('/api/caprover/login/refresh/', {
            method: 'POST',
            credentials: 'include',
        })
            .then((response) => response.ok)
            .catch(() => false)
            .finally(() => {
                refreshPromise = undefined
            })
    }
    return refreshPromise
}

async function readResponse<T>(response: Response): Promise<ApiResponse<T>> {
    let payload: ApiResponse<T>

    try {
        payload = (await response.json()) as ApiResponse<T>
    } catch {
        throw new CaptainApiError(
            'CapRover returned an invalid response.',
            1000,
            response.status
        )
    }

    if (!response.ok || !isSuccessStatus(payload.status)) {
        throw new CaptainApiError(
            payload.description || 'CapRover request failed.',
            payload.status,
            response.status,
            payload.data
        )
    }

    return payload
}

export async function clientApiRequest<T>(
    path: string,
    init: RequestInit = {}
): Promise<ApiResponse<T>> {
    const headers = new Headers(init.headers)

    if (
        init.body &&
        !(typeof FormData !== 'undefined' && init.body instanceof FormData) &&
        !headers.has('content-type')
    ) {
        headers.set('content-type', 'application/json')
    }

    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    const [pathname, query] = normalizedPath.split('?')
    const normalizedPathname =
        pathname === '/' ? '/' : pathname.replace(/\/+$/, '')
    const bffPath = `${normalizedPathname}${query ? `?${query}` : ''}`
    const request = () =>
        fetch(`/api/caprover${bffPath}`, {
            ...init,
            credentials: 'include',
            headers,
        })
    let response = await request()

    if (
        bffPath !== '/login/refresh' &&
        response.headers.get('content-type')?.includes('application/json')
    ) {
        const probe = response.clone()
        const payload = (await probe.json().catch(() => undefined)) as
            ApiResponse<unknown> | undefined
        if (
            payload?.status === CAPTAIN_STATUS_AUTH_TOKEN_INVALID ||
            payload?.status === CAPTAIN_STATUS_NOT_AUTHORIZED
        ) {
            if (await refreshBrowserSession()) response = await request()
        }
    }

    return readResponse<T>(response)
}

export { readResponse }
