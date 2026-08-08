'use client'

import {
    CheckCircle2,
    Clipboard,
    LoaderCircle,
    Play,
    RefreshCw,
    Rocket,
    RotateCcw,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { clientApiRequest, CaptainApiError } from '@/lib/api-client'
import type {
    AppDefinition,
    AppRepoInfo,
    AppVersion,
} from '@/lib/caprover-types'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface AppDeployWorkspaceProps {
    app: AppDefinition
}

interface BuildLogs {
    firstLineNumber?: number
    lines?: string[]
}

interface BuildStatus {
    isAppBuilding?: boolean
    isBuildFailed?: boolean
    logs?: BuildLogs
}

type DeploySource = 'image' | 'dockerfile' | 'definition' | 'tarball'

function getErrorMessage(error: unknown) {
    if (error instanceof CaptainApiError) return error.message
    if (error instanceof Error) return error.message
    return 'The operation could not be completed.'
}

function appDataPath(appName: string, suffix = '') {
    return `/user/apps/appData/${encodeURIComponent(appName)}${suffix}`
}

function emptyRepoInfo(): AppRepoInfo {
    return {
        repo: '',
        branch: '',
        user: '',
        password: '',
        sshKey: '',
    }
}

function formatBuildLogs(status: BuildStatus | undefined) {
    return (status?.logs?.lines || [])
        .map((line) => line.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').trim())
        .join('\n')
}

export function AppDeployWorkspace({ app }: AppDeployWorkspaceProps) {
    const appName = app.appName || ''
    const [source, setSource] = useState<DeploySource>('image')
    const [definitionInput, setDefinitionInput] = useState('')
    const [file, setFile] = useState<File | undefined>()
    const [repo, setRepo] = useState<AppRepoInfo>(() =>
        app.appPushWebhook?.repoInfo
            ? { ...emptyRepoInfo(), ...app.appPushWebhook.repoInfo }
            : emptyRepoInfo()
    )
    const [status, setStatus] = useState<BuildStatus>({
        isAppBuilding: app.isAppBuilding,
    })
    const [working, setWorking] = useState(false)
    const [notice, setNotice] = useState<string>()
    const [error, setError] = useState<string>()

    const buildLogs = useMemo(() => formatBuildLogs(status), [status])
    const webhookToken = app.appPushWebhook?.pushWebhookToken || ''
    const webhookUrl = webhookToken
        ? `${typeof window === 'undefined' ? '' : window.location.origin}/api/v2/user/apps/webhooks/triggerbuild?namespace=captain&token=${encodeURIComponent(webhookToken)}`
        : ''

    async function fetchBuildStatus() {
        if (!appName) return

        try {
            const response = await clientApiRequest<BuildStatus>(
                appDataPath(appName, '/')
            )
            setStatus(response.data)
            setError(undefined)
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        }
    }

    useEffect(() => {
        void fetchBuildStatus()
        const interval = window.setInterval(() => {
            void fetchBuildStatus()
        }, 2000)

        return () => window.clearInterval(interval)
    }, [appName])

    function startOperation() {
        setWorking(true)
        setError(undefined)
        setNotice(undefined)
    }

    async function deployDefinition(
        definition: Record<string, unknown>,
        gitHash = ''
    ) {
        startOperation()

        try {
            await clientApiRequest(appDataPath(appName, '/?detached=true'), {
                method: 'POST',
                body: JSON.stringify({
                    captainDefinitionContent: JSON.stringify(definition),
                    gitHash,
                }),
            })
            setNotice('Deploy started. Build logs are updated automatically.')
            await fetchBuildStatus()
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setWorking(false)
        }
    }

    async function deployFromSource(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()

        if (source === 'tarball') {
            if (!file) {
                setError('Choose a .tar file first.')
                return
            }

            startOperation()
            try {
                const formData = new FormData()
                formData.set('sourceFile', file)
                await clientApiRequest(
                    appDataPath(appName, '/?detached=true'),
                    {
                        method: 'POST',
                        body: formData,
                    }
                )
                setNotice(
                    'Tarball upload started. Build logs are updated automatically.'
                )
                setFile(undefined)
                await fetchBuildStatus()
            } catch (operationError) {
                setError(getErrorMessage(operationError))
            } finally {
                setWorking(false)
            }
            return
        }

        const value = definitionInput.trim()
        if (!value) {
            setError('Enter a value before deploying.')
            return
        }

        try {
            const definition =
                source === 'image'
                    ? { schemaVersion: 2, imageName: value }
                    : source === 'dockerfile'
                      ? {
                            schemaVersion: 2,
                            dockerfileLines: value.split('\n'),
                        }
                      : (JSON.parse(value) as Record<string, unknown>)

            await deployDefinition(definition)
        } catch (operationError) {
            setError(
                operationError instanceof SyntaxError
                    ? 'Captain definition must be valid JSON.'
                    : getErrorMessage(operationError)
            )
            setWorking(false)
        }
    }

    async function saveRepo(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        startOperation()

        try {
            await clientApiRequest('/user/apps/appDefinitions/update/', {
                method: 'PATCH',
                body: JSON.stringify({
                    appName,
                    appPushWebhook: { repoInfo: repo },
                }),
            })
            setNotice(
                'Repository saved. Reload the page to receive the webhook URL.'
            )
            window.setTimeout(() => window.location.reload(), 700)
        } catch (operationError) {
            setError(getErrorMessage(operationError))
            setWorking(false)
        }
    }

    async function forceBuild() {
        if (!webhookToken) {
            setError('Save a repository before forcing a build.')
            return
        }

        startOperation()
        try {
            await clientApiRequest(
                `/user/apps/webhooks/triggerbuild?namespace=captain&token=${encodeURIComponent(webhookToken)}`,
                { method: 'POST' }
            )
            setNotice('Webhook build triggered.')
            await fetchBuildStatus()
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setWorking(false)
        }
    }

    async function toggleAppToken() {
        startOperation()
        try {
            await clientApiRequest('/user/apps/appDefinitions/update/', {
                method: 'PATCH',
                body: JSON.stringify({
                    appName,
                    appDeployTokenConfig: {
                        enabled: !app.appDeployTokenConfig?.enabled,
                        appDeployToken:
                            app.appDeployTokenConfig?.appDeployToken || '',
                    },
                }),
            })
            setNotice('App token setting saved.')
            window.setTimeout(() => window.location.reload(), 700)
        } catch (operationError) {
            setError(getErrorMessage(operationError))
            setWorking(false)
        }
    }

    async function rollback(version: AppVersion) {
        if (!version.deployedImageName) {
            setError('This version has no deployable image recorded.')
            return
        }

        if (
            !window.confirm(
                `Rollback ${appName} to version ${version.version}?`
            )
        ) {
            return
        }

        await deployDefinition(
            {
                schemaVersion: 2,
                dockerfileLines: [`FROM ${version.deployedImageName}`],
            },
            version.gitHash || ''
        )
    }

    function copyWebhook() {
        if (!webhookUrl) return
        void navigator.clipboard?.writeText(webhookUrl)
        setNotice('Webhook URL copied.')
    }

    const versions = [...(app.versions || [])].sort(
        (left, right) => right.version - left.version
    )

    return (
        <div className="space-y-6">
            {notice && (
                <Alert>
                    <AlertTitle>Done</AlertTitle>
                    <AlertDescription>{notice}</AlertDescription>
                </Alert>
            )}
            {error && (
                <Alert variant="destructive">
                    <AlertTitle>Operation failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <BuildStatusCard
                status={status}
                logs={buildLogs}
                onRefresh={() => void fetchBuildStatus()}
            />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Rocket className="h-5 w-5 text-primary" />
                        Deploy a new version
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form className="space-y-5" onSubmit={deployFromSource}>
                        <div className="space-y-2">
                            <Label htmlFor="deploy-source">Source</Label>
                            <Select
                                id="deploy-source"
                                value={source}
                                onChange={(event) =>
                                    setSource(
                                        event.target.value as DeploySource
                                    )
                                }
                            >
                                <option value="image">Image name</option>
                                <option value="dockerfile">Dockerfile</option>
                                <option value="definition">
                                    Captain definition JSON
                                </option>
                                <option value="tarball">Project tarball</option>
                            </Select>
                        </div>
                        {source === 'tarball' ? (
                            <div className="space-y-2">
                                <Label htmlFor="deploy-tarball">
                                    TAR archive
                                </Label>
                                <Input
                                    id="deploy-tarball"
                                    type="file"
                                    accept=".tar,application/x-tar"
                                    onChange={(event) =>
                                        setFile(event.target.files?.[0])
                                    }
                                />
                                <p className="text-xs text-muted-foreground">
                                    The archive must contain a
                                    captain-definition file.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Label htmlFor="deploy-definition">
                                    {source === 'image'
                                        ? 'Image name'
                                        : source === 'dockerfile'
                                          ? 'Dockerfile contents'
                                          : 'Captain definition'}
                                </Label>
                                <Textarea
                                    id="deploy-definition"
                                    rows={source === 'image' ? 2 : 10}
                                    value={definitionInput}
                                    onChange={(event) =>
                                        setDefinitionInput(event.target.value)
                                    }
                                    placeholder={
                                        source === 'image'
                                            ? 'nginxdemos/hello:latest'
                                            : source === 'dockerfile'
                                              ? 'FROM node:24-alpine\nCMD ["node", "server.js"]'
                                              : '{"schemaVersion":2,"imageName":"nginxdemos/hello:latest"}'
                                    }
                                />
                            </div>
                        )}
                        <div className="flex justify-end">
                            <Button type="submit" disabled={working}>
                                {working ? (
                                    <LoaderCircle className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Play className="h-4 w-4" />
                                )}
                                Deploy now
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>App token</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Use an app-specific token for CI/CD without sharing
                            the CapRover password.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge>
                                {app.appDeployTokenConfig?.enabled
                                    ? 'Enabled'
                                    : 'Disabled'}
                            </Badge>
                            <Button
                                variant="outline"
                                size="sm"
                                type="button"
                                disabled={working}
                                onClick={() => void toggleAppToken()}
                            >
                                {app.appDeployTokenConfig?.enabled
                                    ? 'Disable token'
                                    : 'Enable token'}
                            </Button>
                        </div>
                        {app.appDeployTokenConfig?.enabled &&
                            app.appDeployTokenConfig.appDeployToken && (
                                <Input
                                    readOnly
                                    value={
                                        app.appDeployTokenConfig.appDeployToken
                                    }
                                    onFocus={(event) =>
                                        event.currentTarget.select()
                                    }
                                />
                            )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Repository webhook</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form className="space-y-4" onSubmit={saveRepo}>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <RepoField
                                    label="Repository"
                                    value={repo.repo}
                                    onChange={(value) =>
                                        setRepo({ ...repo, repo: value })
                                    }
                                    placeholder="owner/repository"
                                />
                                <RepoField
                                    label="Branch"
                                    value={repo.branch}
                                    onChange={(value) =>
                                        setRepo({ ...repo, branch: value })
                                    }
                                    placeholder="main"
                                />
                                <RepoField
                                    label="Username"
                                    value={repo.user}
                                    onChange={(value) =>
                                        setRepo({ ...repo, user: value })
                                    }
                                />
                                <RepoField
                                    label="Password / access token"
                                    value={repo.password}
                                    onChange={(value) =>
                                        setRepo({ ...repo, password: value })
                                    }
                                    type="password"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="repo-ssh-key">
                                    SSH private key (optional)
                                </Label>
                                <Textarea
                                    id="repo-ssh-key"
                                    rows={4}
                                    value={repo.sshKey || ''}
                                    onChange={(event) =>
                                        setRepo({
                                            ...repo,
                                            sshKey: event.target.value,
                                        })
                                    }
                                />
                            </div>
                            <div className="flex flex-wrap justify-end gap-2">
                                {webhookUrl && (
                                    <Button
                                        variant="outline"
                                        type="button"
                                        onClick={copyWebhook}
                                    >
                                        <Clipboard className="h-4 w-4" />
                                        Copy webhook
                                    </Button>
                                )}
                                <Button
                                    variant="outline"
                                    type="button"
                                    disabled={working || !webhookToken}
                                    onClick={() => void forceBuild()}
                                >
                                    <RefreshCw className="h-4 w-4" />
                                    Force build
                                </Button>
                                <Button type="submit" disabled={working}>
                                    Save repository
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Deployment history</CardTitle>
                </CardHeader>
                <CardContent>
                    {versions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No deployment history is available yet.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {versions.map((version) => (
                                <div
                                    key={version.version}
                                    className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">
                                                v{version.version}
                                            </span>
                                            {version.version ===
                                                app.deployedVersion && (
                                                <Badge>Current</Badge>
                                            )}
                                        </div>
                                        <p className="mt-1 truncate text-sm text-muted-foreground">
                                            {version.deployedImageName ||
                                                'Image unavailable'}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {version.timeStamp
                                                ? new Date(
                                                      version.timeStamp
                                                  ).toLocaleString()
                                                : 'Unknown time'}
                                            {version.gitHash
                                                ? ` · ${version.gitHash}`
                                                : ''}
                                        </p>
                                    </div>
                                    {version.version !== app.deployedVersion &&
                                        version.deployedImageName && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                type="button"
                                                disabled={working}
                                                onClick={() =>
                                                    void rollback(version)
                                                }
                                            >
                                                <RotateCcw className="h-4 w-4" />
                                                Roll back
                                            </Button>
                                        )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

export function AppLogsWorkspace({ appName }: { appName: string }) {
    const [logs, setLogs] = useState('')
    const [encoding, setEncoding] = useState('ascii')
    const [working, setWorking] = useState(false)
    const [error, setError] = useState<string>()

    async function loadLogs() {
        setWorking(true)
        setError(undefined)
        try {
            const response = await clientApiRequest<{ logs?: string }>(
                appDataPath(
                    appName,
                    `/logs?encoding=${encodeURIComponent(encoding)}`
                )
            )
            setLogs(response.data.logs || '')
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setWorking(false)
        }
    }

    useEffect(() => {
        void loadLogs()
        const interval = window.setInterval(() => void loadLogs(), 5000)
        return () => window.clearInterval(interval)
    }, [appName, encoding])

    return (
        <div className="space-y-6">
            {error && (
                <Alert variant="destructive">
                    <AlertTitle>Unable to load runtime logs</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            <Card>
                <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle>Runtime logs</CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Logs from the running service, refreshed every five
                            seconds.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Select
                            value={encoding}
                            onChange={(event) =>
                                setEncoding(event.target.value)
                            }
                            aria-label="Log encoding"
                            className="w-auto"
                        >
                            <option value="ascii">ASCII</option>
                            <option value="utf8">UTF-8</option>
                        </Select>
                        <Button
                            variant="outline"
                            size="icon"
                            type="button"
                            disabled={working}
                            onClick={() => void loadLogs()}
                            aria-label="Refresh runtime logs"
                        >
                            <RefreshCw
                                className={`h-4 w-4 ${working ? 'animate-spin' : ''}`}
                            />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <pre className="max-h-[32rem] min-h-64 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                        {logs || 'No runtime logs returned.'}
                    </pre>
                </CardContent>
            </Card>
        </div>
    )
}

function BuildStatusCard({
    status,
    logs,
    onRefresh,
}: {
    status: BuildStatus
    logs: string
    onRefresh: () => void
}) {
    const building = !!status.isAppBuilding
    const failed = !!status.isBuildFailed

    return (
        <Card>
            <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        {building ? (
                            <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
                        ) : failed ? (
                            <RefreshCw className="h-5 w-5 text-destructive" />
                        ) : (
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        )}
                        Build status
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {building
                            ? 'The image is being built. This view refreshes automatically.'
                            : failed
                              ? 'The last build failed. Review the output before trying again.'
                              : 'No build is currently running.'}
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={onRefresh}
                >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                </Button>
            </CardHeader>
            <CardContent>
                <pre className="max-h-80 min-h-28 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                    {logs ||
                        'Build output will appear here after a deploy starts.'}
                </pre>
            </CardContent>
        </Card>
    )
}

function RepoField({
    label,
    value,
    onChange,
    placeholder,
    type = 'text',
}: {
    label: string
    value: string
    onChange: (value: string) => void
    placeholder?: string
    type?: string
}) {
    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            <Input
                type={type}
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
            />
        </div>
    )
}
