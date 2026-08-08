'use client'

import {
    ExternalLink,
    Globe2,
    LoaderCircle,
    Plus,
    Save,
    Trash2,
} from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { useState } from 'react'

import {
    AppDeployWorkspace,
    AppLogsWorkspace,
} from '@/components/app-deploy-workspace'
import { clientApiRequest, CaptainApiError } from '@/lib/api-client'
import type {
    AppDefinition,
    AppEnvVar,
    AppPort,
    AppVolume,
    ProjectDefinition,
} from '@/lib/caprover-types'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface AppDetailsWorkspaceProps {
    app: AppDefinition
    projects: ProjectDefinition[]
    rootDomain: string
}

type Tab = 'overview' | 'configuration' | 'http' | 'deploy' | 'logs'

function getErrorMessage(error: unknown) {
    if (error instanceof CaptainApiError) return error.message
    if (error instanceof Error) return error.message
    return 'The operation could not be completed.'
}

function cloneApp(app: AppDefinition): AppDefinition {
    return JSON.parse(JSON.stringify(app)) as AppDefinition
}

export function AppDetailsWorkspace({
    app: initialApp,
    projects,
    rootDomain,
}: AppDetailsWorkspaceProps) {
    const [app, setApp] = useState(() => cloneApp(initialApp))
    const [tab, setTab] = useState<Tab>('overview')
    const [working, setWorking] = useState(false)
    const [notice, setNotice] = useState<string | undefined>()
    const [error, setError] = useState<string | undefined>()
    const [domain, setDomain] = useState('')
    const [newAppName, setNewAppName] = useState(initialApp.appName || '')

    const project = projects.find((item) => item.id === app.projectId)

    async function savePatch(
        patch: Record<string, unknown>,
        successMessage = 'App saved.'
    ) {
        setWorking(true)
        setError(undefined)
        setNotice(undefined)

        try {
            await clientApiRequest(`/user/apps/appDefinitions/update/`, {
                method: 'PATCH',
                body: JSON.stringify({ appName: app.appName, ...patch }),
            })
            setNotice(successMessage)
            window.location.reload()
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setWorking(false)
        }
    }

    async function runOperation(
        path: string,
        body: Record<string, unknown>,
        successMessage: string
    ) {
        setWorking(true)
        setError(undefined)
        setNotice(undefined)

        try {
            await clientApiRequest(path, {
                method: 'POST',
                body: JSON.stringify(body),
            })
            setNotice(successMessage)
            window.location.reload()
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setWorking(false)
        }
    }

    async function renameApp(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const oldAppName = app.appName || ''
        const nextAppName = newAppName.trim()

        if (!oldAppName || !nextAppName || oldAppName === nextAppName) return

        setWorking(true)
        setError(undefined)
        setNotice(undefined)

        try {
            await clientApiRequest('/user/apps/appDefinitions/rename/', {
                method: 'POST',
                body: JSON.stringify({ oldAppName, newAppName: nextAppName }),
            })
            window.location.assign(
                `/apps/details/${encodeURIComponent(nextAppName)}`
            )
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setWorking(false)
        }
    }

    function updateEnvVar(index: number, patch: Partial<AppEnvVar>) {
        setApp((current) => {
            const envVars = [...current.envVars]
            envVars[index] = { ...envVars[index], ...patch }
            return { ...current, envVars }
        })
    }

    function updatePort(index: number, patch: Partial<AppPort>) {
        setApp((current) => {
            const ports = [...current.ports]
            ports[index] = { ...ports[index], ...patch }
            return { ...current, ports }
        })
    }

    function updateVolume(index: number, patch: Partial<AppVolume>) {
        setApp((current) => {
            const volumes = [...current.volumes]
            volumes[index] = { ...volumes[index], ...patch }
            return { ...current, volumes }
        })
    }

    return (
        <div className="space-y-6">
            {notice && (
                <Alert>
                    <AlertTitle>Saved</AlertTitle>
                    <AlertDescription>{notice}</AlertDescription>
                </Alert>
            )}
            {error && (
                <Alert variant="destructive">
                    <AlertTitle>Operation failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Link
                            href="/apps"
                            className="text-sm text-muted-foreground hover:text-foreground"
                        >
                            Apps
                        </Link>
                        <span className="text-sm text-muted-foreground">/</span>
                        <span className="text-sm text-muted-foreground">
                            {app.appName}
                        </span>
                    </div>
                    <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                        {app.appName}
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                        {app.description || 'No description'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {project && <Badge>{project.name}</Badge>}
                        {app.hasPersistentData && (
                            <Badge>Persistent data</Badge>
                        )}
                        {app.isAppBuilding && (
                            <Badge className="border-amber-300 bg-amber-50 text-amber-700">
                                Building
                            </Badge>
                        )}
                    </div>
                </div>
                {!app.notExposeAsWebApp && app.appName && (
                    <a
                        href={`https://${app.appName}.${rootDomain}`}
                        className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Open app <ExternalLink className="h-4 w-4" />
                    </a>
                )}
            </div>

            <div className="flex flex-wrap gap-1 border-b">
                {(
                    [
                        ['overview', 'Overview'],
                        ['configuration', 'Configuration'],
                        ['http', 'HTTP & domains'],
                        ['deploy', 'Deploy'],
                        ['logs', 'Logs'],
                    ] as const
                ).map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${tab === value ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                        onClick={() => setTab(value)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'overview' && (
                <>
                    <RenameAppCard
                        appName={newAppName}
                        disabled={working}
                        onChange={setNewAppName}
                        onSubmit={renameApp}
                    />
                    <OverviewTab app={app} />
                </>
            )}

            {tab === 'configuration' && (
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Service configuration</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-5 md:grid-cols-2">
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="app-description">
                                    Description
                                </Label>
                                <Textarea
                                    id="app-description"
                                    value={app.description || ''}
                                    onChange={(event) =>
                                        setApp({
                                            ...app,
                                            description: event.target.value,
                                        })
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="project-id">Project</Label>
                                <Select
                                    id="project-id"
                                    value={app.projectId || ''}
                                    onChange={(event) =>
                                        setApp({
                                            ...app,
                                            projectId: event.target.value,
                                        })
                                    }
                                >
                                    <option value="">Root apps</option>
                                    {projects.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.name}
                                        </option>
                                    ))}
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="instance-count">
                                    Instances
                                </Label>
                                <Input
                                    id="instance-count"
                                    type="number"
                                    min={0}
                                    value={app.instanceCount}
                                    onChange={(event) =>
                                        setApp({
                                            ...app,
                                            instanceCount: Number(
                                                event.target.value
                                            ),
                                        })
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="container-port">
                                    Container HTTP port
                                </Label>
                                <Input
                                    id="container-port"
                                    type="number"
                                    min={1}
                                    max={65535}
                                    value={app.containerHttpPort || 80}
                                    onChange={(event) =>
                                        setApp({
                                            ...app,
                                            containerHttpPort: Number(
                                                event.target.value
                                            ),
                                        })
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="node-id">Node ID</Label>
                                <Input
                                    id="node-id"
                                    value={app.nodeId || ''}
                                    onChange={(event) =>
                                        setApp({
                                            ...app,
                                            nodeId: event.target.value,
                                        })
                                    }
                                />
                            </div>
                            <div className="grid gap-3 md:col-span-2 sm:grid-cols-2">
                                <ToggleField
                                    label="Expose as web app"
                                    checked={!app.notExposeAsWebApp}
                                    onChange={(checked) =>
                                        setApp({
                                            ...app,
                                            notExposeAsWebApp: !checked,
                                        })
                                    }
                                />
                                <ToggleField
                                    label="Websocket support"
                                    checked={app.websocketSupport}
                                    onChange={(checked) =>
                                        setApp({
                                            ...app,
                                            websocketSupport: checked,
                                        })
                                    }
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <EditableListCard
                        title="Environment variables"
                        description="Values are sent to the existing API and remain server-side after saving."
                        emptyLabel="No environment variables configured."
                        onAdd={() =>
                            setApp({
                                ...app,
                                envVars: [
                                    ...app.envVars,
                                    { key: '', value: '' },
                                ],
                            })
                        }
                    >
                        {app.envVars.map((item, index) => (
                            <div
                                key={`${index}-${item.key}`}
                                className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]"
                            >
                                <Input
                                    value={item.key}
                                    placeholder="KEY"
                                    onChange={(event) =>
                                        updateEnvVar(index, {
                                            key: event.target.value,
                                        })
                                    }
                                />
                                <Input
                                    value={item.value}
                                    placeholder="value"
                                    onChange={(event) =>
                                        updateEnvVar(index, {
                                            value: event.target.value,
                                        })
                                    }
                                />
                                <IconButton
                                    label="Remove variable"
                                    onClick={() =>
                                        setApp({
                                            ...app,
                                            envVars: app.envVars.filter(
                                                (_, itemIndex) =>
                                                    itemIndex !== index
                                            ),
                                        })
                                    }
                                />
                            </div>
                        ))}
                    </EditableListCard>

                    <EditableListCard
                        title="Port mapping"
                        description="Map host ports to ports exposed by the service."
                        emptyLabel="No custom port mappings configured."
                        onAdd={() =>
                            setApp({
                                ...app,
                                ports: [
                                    ...app.ports,
                                    {
                                        hostPort: 80,
                                        containerPort: 80,
                                        protocol: 'tcp',
                                        publishMode: 'ingress',
                                    },
                                ],
                            })
                        }
                    >
                        {app.ports.map((item, index) => (
                            <div
                                key={`${index}-${item.hostPort}`}
                                className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]"
                            >
                                <Input
                                    type="number"
                                    min={1}
                                    placeholder="Host port"
                                    value={item.hostPort}
                                    onChange={(event) =>
                                        updatePort(index, {
                                            hostPort: Number(
                                                event.target.value
                                            ),
                                        })
                                    }
                                />
                                <Input
                                    type="number"
                                    min={1}
                                    placeholder="Container port"
                                    value={item.containerPort}
                                    onChange={(event) =>
                                        updatePort(index, {
                                            containerPort: Number(
                                                event.target.value
                                            ),
                                        })
                                    }
                                />
                                <Select
                                    value={item.protocol || 'tcp'}
                                    onChange={(event) =>
                                        updatePort(index, {
                                            protocol: event.target.value as
                                                'tcp' | 'udp',
                                        })
                                    }
                                >
                                    <option value="tcp">TCP</option>
                                    <option value="udp">UDP</option>
                                </Select>
                                <Select
                                    value={item.publishMode || 'ingress'}
                                    onChange={(event) =>
                                        updatePort(index, {
                                            publishMode: event.target.value as
                                                'ingress' | 'host',
                                        })
                                    }
                                >
                                    <option value="ingress">Ingress</option>
                                    <option value="host">Host</option>
                                </Select>
                                <IconButton
                                    label="Remove port"
                                    onClick={() =>
                                        setApp({
                                            ...app,
                                            ports: app.ports.filter(
                                                (_, itemIndex) =>
                                                    itemIndex !== index
                                            ),
                                        })
                                    }
                                />
                            </div>
                        ))}
                    </EditableListCard>

                    <EditableListCard
                        title="Volumes"
                        description="Persistent volume changes can affect data. Review carefully before saving."
                        emptyLabel="No volumes configured."
                        onAdd={() =>
                            setApp({
                                ...app,
                                volumes: [
                                    ...app.volumes,
                                    {
                                        containerPath: '',
                                        volumeName: '',
                                        mode: 'rw',
                                    },
                                ],
                            })
                        }
                    >
                        {app.volumes.map((item, index) => (
                            <div
                                key={`${index}-${item.containerPath}`}
                                className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]"
                            >
                                <Input
                                    placeholder="Volume name"
                                    value={item.volumeName || ''}
                                    onChange={(event) =>
                                        updateVolume(index, {
                                            volumeName: event.target.value,
                                        })
                                    }
                                />
                                <Input
                                    placeholder="Container path"
                                    value={item.containerPath}
                                    onChange={(event) =>
                                        updateVolume(index, {
                                            containerPath: event.target.value,
                                        })
                                    }
                                />
                                <Select
                                    value={item.mode || 'rw'}
                                    onChange={(event) =>
                                        updateVolume(index, {
                                            mode: event.target.value,
                                        })
                                    }
                                >
                                    <option value="rw">Read/write</option>
                                    <option value="ro">Read only</option>
                                </Select>
                                <IconButton
                                    label="Remove volume"
                                    onClick={() =>
                                        setApp({
                                            ...app,
                                            volumes: app.volumes.filter(
                                                (_, itemIndex) =>
                                                    itemIndex !== index
                                            ),
                                        })
                                    }
                                />
                            </div>
                        ))}
                    </EditableListCard>

                    <Card>
                        <CardHeader>
                            <CardTitle>Advanced hooks</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="pre-deploy">
                                    Pre-deploy function
                                </Label>
                                <Textarea
                                    id="pre-deploy"
                                    value={app.preDeployFunction || ''}
                                    onChange={(event) =>
                                        setApp({
                                            ...app,
                                            preDeployFunction:
                                                event.target.value,
                                        })
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="service-update">
                                    Service update override
                                </Label>
                                <Textarea
                                    id="service-update"
                                    value={app.serviceUpdateOverride || ''}
                                    onChange={(event) =>
                                        setApp({
                                            ...app,
                                            serviceUpdateOverride:
                                                event.target.value,
                                        })
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="tags">
                                    Tags (comma separated)
                                </Label>
                                <Input
                                    id="tags"
                                    value={(app.tags || [])
                                        .map((tag) => tag.tagName)
                                        .join(', ')}
                                    onChange={(event) =>
                                        setApp({
                                            ...app,
                                            tags: event.target.value
                                                .split(',')
                                                .map((tag) => tag.trim())
                                                .filter(Boolean)
                                                .map((tagName) => ({
                                                    tagName,
                                                })),
                                        })
                                    }
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end">
                        <Button
                            type="button"
                            disabled={working}
                            onClick={() =>
                                savePatch({
                                    projectId: app.projectId || '',
                                    description: app.description,
                                    instanceCount: app.instanceCount,
                                    containerHttpPort: app.containerHttpPort,
                                    nodeId: app.nodeId || '',
                                    notExposeAsWebApp: app.notExposeAsWebApp,
                                    websocketSupport: app.websocketSupport,
                                    envVars: app.envVars,
                                    ports: app.ports,
                                    volumes: app.volumes,
                                    preDeployFunction:
                                        app.preDeployFunction || '',
                                    serviceUpdateOverride:
                                        app.serviceUpdateOverride || '',
                                    tags: app.tags || [],
                                })
                            }
                        >
                            {working ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4" />
                            )}
                            Save configuration
                        </Button>
                    </div>
                </div>
            )}

            {tab === 'http' && (
                <HttpTab
                    app={app}
                    domain={domain}
                    setDomain={setDomain}
                    working={working}
                    savePatch={savePatch}
                    runOperation={runOperation}
                    setApp={setApp}
                />
            )}

            {tab === 'deploy' && <AppDeployWorkspace app={app} />}

            {tab === 'logs' && app.appName && (
                <AppLogsWorkspace appName={app.appName} />
            )}
        </div>
    )
}

function OverviewTab({ app }: { app: AppDefinition }) {
    const latestVersion = [...(app.versions || [])].sort(
        (a, b) => b.version - a.version
    )[0]

    return (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Instances" value={`${app.instanceCount}`} />
            <StatCard
                label="Deployed version"
                value={`v${app.deployedVersion || 0}`}
            />
            <StatCard
                label="HTTP port"
                value={`${app.containerHttpPort || 80}`}
            />
            <StatCard
                label="Persistent data"
                value={app.hasPersistentData ? 'Enabled' : 'Disabled'}
            />
            <Card className="md:col-span-2 xl:col-span-4">
                <CardHeader>
                    <CardTitle>Current deployment</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
                    <div>
                        <p className="text-muted-foreground">Image</p>
                        <p className="mt-1 break-all font-medium">
                            {latestVersion?.deployedImageName ||
                                'No image recorded'}
                        </p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Git hash</p>
                        <p className="mt-1 break-all font-medium">
                            {latestVersion?.gitHash || 'n/a'}
                        </p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Last deploy</p>
                        <p className="mt-1 font-medium">
                            {latestVersion?.timeStamp
                                ? new Date(
                                      latestVersion.timeStamp
                                  ).toLocaleString()
                                : 'No deploy recorded'}
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

function RenameAppCard({
    appName,
    disabled,
    onChange,
    onSubmit,
}: {
    appName: string
    disabled: boolean
    onChange: (value: string) => void
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Application identity</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Renaming changes the app hostname. Update any internal
                    references that still use the old name.
                </p>
            </CardHeader>
            <CardContent>
                <form
                    className="flex flex-col gap-3 sm:flex-row"
                    onSubmit={onSubmit}
                >
                    <Input
                        value={appName}
                        onChange={(event) => onChange(event.target.value)}
                        aria-label="Application name"
                        required
                    />
                    <Button
                        type="submit"
                        disabled={disabled || !appName.trim()}
                    >
                        Rename app
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}

function HttpTab({
    app,
    domain,
    setDomain,
    working,
    savePatch,
    runOperation,
    setApp,
}: {
    app: AppDefinition
    domain: string
    setDomain: (value: string) => void
    working: boolean
    savePatch: (
        patch: Record<string, unknown>,
        successMessage?: string
    ) => Promise<void>
    runOperation: (
        path: string,
        body: Record<string, unknown>,
        successMessage: string
    ) => Promise<void>
    setApp: (value: AppDefinition) => void
}) {
    const [authUser, setAuthUser] = useState(app.httpAuth?.user || '')
    const [authPassword, setAuthPassword] = useState('')

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Web app settings</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-5 md:grid-cols-2">
                    <ToggleField
                        label="Expose as web app"
                        checked={!app.notExposeAsWebApp}
                        onChange={(checked) =>
                            setApp({ ...app, notExposeAsWebApp: !checked })
                        }
                    />
                    <ToggleField
                        label="Force HTTPS"
                        checked={app.forceSsl}
                        onChange={(checked) =>
                            setApp({ ...app, forceSsl: checked })
                        }
                    />
                    <ToggleField
                        label="Websocket support"
                        checked={app.websocketSupport}
                        onChange={(checked) =>
                            setApp({ ...app, websocketSupport: checked })
                        }
                    />
                    <div className="space-y-2">
                        <Label htmlFor="redirect-domain">Redirect domain</Label>
                        <Input
                            id="redirect-domain"
                            value={app.redirectDomain || ''}
                            onChange={(event) =>
                                setApp({
                                    ...app,
                                    redirectDomain: event.target.value,
                                })
                            }
                        />
                    </div>
                    <div className="space-y-3 md:col-span-2">
                        <div>
                            <Label htmlFor="http-auth-user">
                                HTTP Basic Auth username
                            </Label>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Leave the username empty and save to disable
                                Basic Auth. Leave the password empty to keep the
                                current password.
                            </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Input
                                id="http-auth-user"
                                value={authUser}
                                onChange={(event) =>
                                    setAuthUser(event.target.value)
                                }
                                placeholder="username"
                                autoComplete="off"
                            />
                            <Input
                                id="http-auth-password"
                                type="password"
                                value={authPassword}
                                onChange={(event) =>
                                    setAuthPassword(event.target.value)
                                }
                                placeholder={
                                    app.httpAuth
                                        ? 'Leave empty to keep current password'
                                        : 'password'
                                }
                                autoComplete="new-password"
                            />
                        </div>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="custom-nginx">
                            Custom Nginx configuration
                        </Label>
                        <Textarea
                            id="custom-nginx"
                            rows={8}
                            value={app.customNginxConfig || ''}
                            onChange={(event) =>
                                setApp({
                                    ...app,
                                    customNginxConfig: event.target.value,
                                })
                            }
                        />
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                        <Button
                            type="button"
                            disabled={working}
                            onClick={() =>
                                savePatch({
                                    notExposeAsWebApp: app.notExposeAsWebApp,
                                    forceSsl: app.forceSsl,
                                    websocketSupport: app.websocketSupport,
                                    redirectDomain: app.redirectDomain || '',
                                    httpAuth: authUser.trim()
                                        ? {
                                              user: authUser.trim(),
                                              ...(authPassword
                                                  ? { password: authPassword }
                                                  : {}),
                                          }
                                        : null,
                                    customNginxConfig:
                                        app.customNginxConfig || '',
                                })
                            }
                        >
                            <Save className="h-4 w-4" />
                            Save HTTP settings
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Custom domains</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                            value={domain}
                            onChange={(event) => setDomain(event.target.value)}
                            placeholder="app.example.com"
                        />
                        <Button
                            type="button"
                            disabled={working || !domain.trim()}
                            onClick={() =>
                                runOperation(
                                    '/user/apps/appDefinitions/customdomain/',
                                    {
                                        appName: app.appName,
                                        customDomain: domain.trim(),
                                    },
                                    'Custom domain added.'
                                )
                            }
                        >
                            <Plus className="h-4 w-4" />
                            Add domain
                        </Button>
                    </div>
                    <div className="space-y-2">
                        {(app.customDomain || []).length === 0 && (
                            <p className="text-sm text-muted-foreground">
                                No custom domains configured.
                            </p>
                        )}
                        {(app.customDomain || []).map((item) => (
                            <div
                                key={item.publicDomain}
                                className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div className="flex items-center gap-2">
                                    <Globe2 className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium">
                                        {item.publicDomain}
                                    </span>
                                    {item.hasSsl && <Badge>SSL</Badge>}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        type="button"
                                        disabled={working || item.hasSsl}
                                        onClick={() =>
                                            runOperation(
                                                '/user/apps/appDefinitions/enablecustomdomainssl/',
                                                {
                                                    appName: app.appName,
                                                    customDomain:
                                                        item.publicDomain,
                                                },
                                                'Custom domain SSL enabled.'
                                            )
                                        }
                                    >
                                        Enable SSL
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        type="button"
                                        disabled={working}
                                        onClick={() =>
                                            runOperation(
                                                '/user/apps/appDefinitions/removecustomdomain/',
                                                {
                                                    appName: app.appName,
                                                    customDomain:
                                                        item.publicDomain,
                                                },
                                                'Custom domain removed.'
                                            )
                                        }
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        Remove
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                    {!app.hasDefaultSubDomainSsl && (
                        <Button
                            variant="outline"
                            type="button"
                            disabled={working}
                            onClick={() =>
                                runOperation(
                                    '/user/apps/appDefinitions/enablebasedomainssl/',
                                    { appName: app.appName },
                                    'Default subdomain SSL enabled.'
                                )
                            }
                        >
                            Enable default subdomain SSL
                        </Button>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

function ToggleField({
    label,
    checked,
    onChange,
}: {
    label: string
    checked: boolean
    onChange: (value: boolean) => void
}) {
    return (
        <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
            />
            {label}
        </label>
    )
}

function EditableListCard({
    title,
    description,
    emptyLabel,
    onAdd,
    children,
}: {
    title: string
    description: string
    emptyLabel: string
    onAdd: () => void
    children: ReactNode
}) {
    return (
        <Card>
            <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <CardTitle>{title}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {description}
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={onAdd}
                >
                    <Plus className="h-4 w-4" />
                    Add
                </Button>
            </CardHeader>
            <CardContent className="space-y-3">
                {children || (
                    <p className="text-sm text-muted-foreground">
                        {emptyLabel}
                    </p>
                )}
            </CardContent>
        </Card>
    )
}

function IconButton({
    label,
    onClick,
}: {
    label: string
    onClick: () => void
}) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
            <Trash2 className="h-4 w-4" />
        </button>
    )
}

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <Card>
            <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
            </CardContent>
        </Card>
    )
}
