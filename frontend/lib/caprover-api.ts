import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import {
    CAPTAIN_STATUS_AUTH_TOKEN_INVALID,
    CAPTAIN_STATUS_NOT_AUTHORIZED,
    CAPTAIN_STATUS_NOT_INITIALIZED,
    CAPTAIN_STATUS_OK,
    CaptainApiError,
    readResponse,
} from './api-client'
import type {
    ApiResponse,
    AppsPayload,
    AppsWorkspaceData,
    ProjectsPayload,
    SystemInfo,
} from './caprover-types'

export type AuthState =
    | { kind: 'authenticated'; message: string }
    | { kind: 'unauthenticated'; message: string }
    | { kind: 'unavailable'; message: string }
    | { kind: 'error'; message: string }

export interface SystemInfoResult {
    state: AuthState
    data?: SystemInfo
}

function getBackendOrigin() {
    return (
        process.env.CAPROVER_API_ORIGIN ||
        `http://127.0.0.1:${process.env.PORT || '3000'}`
    ).replace(/\/$/, '')
}

async function serverApiRequest<T>(
    path: string,
    init: RequestInit = {}
): Promise<ApiResponse<T>> {
    const headers = new Headers(init.headers)
    const requestCookies = await cookies()
    const cookieHeader = requestCookies.toString()

    if (cookieHeader) {
        headers.set('cookie', cookieHeader)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    try {
        const response = await fetch(`${getBackendOrigin()}/api/v2${path}`, {
            ...init,
            cache: 'no-store',
            headers,
            signal: init.signal || controller.signal,
        })

        return await readResponse<T>(response)
    } finally {
        clearTimeout(timeout)
    }
}

function getErrorState(error: unknown): AuthState {
    if (error instanceof CaptainApiError) {
        if (
            error.status === CAPTAIN_STATUS_NOT_AUTHORIZED ||
            error.status === CAPTAIN_STATUS_AUTH_TOKEN_INVALID
        ) {
            return {
                kind: 'unauthenticated',
                message: error.message,
            }
        }

        if (error.status === CAPTAIN_STATUS_NOT_INITIALIZED) {
            return {
                kind: 'unavailable',
                message: error.message,
            }
        }

        return { kind: 'error', message: error.message }
    }

    if (error instanceof Error && error.name === 'AbortError') {
        return {
            kind: 'unavailable',
            message: 'CapRover did not respond within the expected time.',
        }
    }

    return {
        kind: 'unavailable',
        message: 'CapRover is not responding yet.',
    }
}

export async function getSystemInfo(): Promise<SystemInfoResult> {
    try {
        const response =
            await serverApiRequest<SystemInfo>('/user/system/info/')

        if (response.status !== CAPTAIN_STATUS_OK) {
            return {
                state: {
                    kind: 'error',
                    message: response.description,
                },
            }
        }

        return {
            state: { kind: 'authenticated', message: 'CapRover is ready.' },
            data: response.data,
        }
    } catch (error) {
        return { state: getErrorState(error) }
    }
}

export async function requireSystemInfo() {
    const result = await getSystemInfo()

    if (result.state.kind === 'unauthenticated') {
        redirect('/login')
    }

    if (!result.data) {
        throw new Error(result.state.message)
    }

    return result.data
}

export async function getAppsWorkspace(): Promise<{
    state: AuthState
    data?: AppsWorkspaceData
}> {
    const systemInfo = await getSystemInfo()

    if (systemInfo.state.kind !== 'authenticated' || !systemInfo.data) {
        return { state: systemInfo.state }
    }

    try {
        const [appsResponse, projectsResponse] = await Promise.all([
            serverApiRequest<AppsPayload>('/user/apps/appDefinitions/'),
            serverApiRequest<ProjectsPayload>('/user/projects/'),
        ])

        return {
            state: systemInfo.state,
            data: {
                systemInfo: systemInfo.data,
                apps: appsResponse.data,
                projects: projectsResponse.data.projects || [],
            },
        }
    } catch (error) {
        return { state: getErrorState(error) }
    }
}

export async function getAppDefinition(appName: string): Promise<{
    state: AuthState
    data?: AppsWorkspaceData & {
        app: AppsWorkspaceData['apps']['appDefinitions'][number]
    }
}> {
    const workspace = await getAppsWorkspace()

    if (!workspace.data) {
        return { state: workspace.state }
    }

    const app = workspace.data.apps.appDefinitions.find(
        (item) => item.appName === appName
    )

    if (!app) {
        return {
            state: {
                kind: 'error' as const,
                message: `App ${appName} was not found.`,
            },
        }
    }

    return {
        state: workspace.state,
        data: {
            ...workspace.data,
            app,
        },
    }
}

export type { SystemInfo } from './caprover-types'
