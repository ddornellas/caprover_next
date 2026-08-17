'use client'

import {
    Folder,
    FolderPlus,
    LoaderCircle,
    Plus,
    Search,
    Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { clientApiRequest, CaptainApiError } from '@/lib/api-client'
import type {
    AppDefinition,
    AppStatus,
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

interface AppsWorkspaceProps {
    apps: AppDefinition[]
    projects: ProjectDefinition[]
    rootDomain: string
    initialProjectId?: string
    initialShowProjectForm?: boolean
}

interface Notice {
    kind: 'success' | 'error'
    message: string
}

function getErrorMessage(error: unknown) {
    if (error instanceof CaptainApiError) return error.message
    if (error instanceof Error) return error.message
    return 'The operation could not be completed.'
}

function appBelongsToProject(app: AppDefinition, projectId: string) {
    return (app.projectId || '') === projectId
}

function getAppStatus(app: AppDefinition): AppStatus {
    if (app.status) return app.status
    return Number(app.instanceCount) === 0 ? 'paused' : 'published'
}

function getAppStatusLabel(status: AppStatus) {
    if (status === 'on_approval') return 'On approval'
    if (status === 'paused') return 'Paused'
    return 'Published'
}

function getAppStatusClassName(status: AppStatus) {
    if (status === 'on_approval') {
        return 'border-amber-300 bg-amber-50 text-amber-700'
    }
    if (status === 'paused') {
        return 'border-slate-300 bg-slate-100 text-slate-600'
    }
    return 'border-emerald-300 bg-emerald-50 text-emerald-700'
}

export function AppsWorkspace({
    apps: initialApps,
    projects: initialProjects,
    rootDomain,
    initialProjectId = '',
    initialShowProjectForm = false,
}: AppsWorkspaceProps) {
    const [apps] = useState(initialApps)
    const [projects] = useState(initialProjects)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | AppStatus>('all')
    const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId)
    const [notice, setNotice] = useState<Notice | undefined>()
    const [working, setWorking] = useState(false)
    const [showCreateApp, setShowCreateApp] = useState(false)
    const [showProjectForm, setShowProjectForm] = useState(
        initialShowProjectForm
    )
    const [editingProject, setEditingProject] =
        useState<ProjectDefinition | null>(null)
    const [deleteCandidate, setDeleteCandidate] =
        useState<AppDefinition | null>(null)
    const [volumesToDelete, setVolumesToDelete] = useState<string[]>([])

    const visibleApps = useMemo(() => {
        const query = search.trim().toLocaleLowerCase()
        const tagQuery = query.startsWith('tag:') ? query.slice(4).trim() : ''

        return apps.filter((app) => {
            if (statusFilter !== 'all' && getAppStatus(app) !== statusFilter) {
                return false
            }

            if (
                selectedProjectId &&
                !appBelongsToProject(app, selectedProjectId)
            ) {
                return false
            }

            if (!query) return true

            const searchable = [
                app.appName,
                app.description,
                ...(app.tags || []).map((tag) => tag.tagName),
            ]
                .filter(Boolean)
                .join(' ')
                .toLocaleLowerCase()

            return tagQuery
                ? (app.tags || []).some((tag) =>
                      tag.tagName.toLocaleLowerCase().includes(tagQuery)
                  )
                : searchable.includes(query)
        })
    }, [apps, search, selectedProjectId, statusFilter])

    const deleteCandidateVolumes = (deleteCandidate?.volumes || [])
        .map((volume) => volume.volumeName)
        .filter((volume): volume is string => !!volume)

    const refresh = () => {
        window.location.reload()
    }

    async function runOperation(operation: () => Promise<void>) {
        setWorking(true)
        setNotice(undefined)

        try {
            await operation()
            setNotice({ kind: 'success', message: 'Operation completed.' })
            refresh()
        } catch (error) {
            setNotice({ kind: 'error', message: getErrorMessage(error) })
        } finally {
            setWorking(false)
        }
    }

    async function createApp(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const appName = `${form.get('appName') || ''}`.trim()

        if (!appName) return

        await runOperation(async () => {
            await clientApiRequest(
                '/user/apps/appDefinitions/register/?detached=true',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        appName,
                        projectId: `${form.get('projectId') || ''}`,
                        hasPersistentData:
                            form.get('hasPersistentData') === 'on',
                    }),
                }
            )
        })
    }

    async function saveProject(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const name = `${form.get('name') || ''}`.trim()
        if (!name) return

        await runOperation(async () => {
            if (editingProject) {
                await clientApiRequest('/user/projects/update/', {
                    method: 'POST',
                    body: JSON.stringify({
                        projectDefinition: {
                            id: editingProject.id,
                            name,
                            description:
                                `${form.get('description') || ''}`.trim(),
                            parentProjectId: `${form.get('parentProjectId') || ''}`,
                        },
                    }),
                })
            } else {
                await clientApiRequest('/user/projects/register/', {
                    method: 'POST',
                    body: JSON.stringify({
                        name,
                        description: `${form.get('description') || ''}`.trim(),
                        parentProjectId: `${form.get('parentProjectId') || ''}`,
                    }),
                })
            }
        })
    }

    function beginDeleteApp(app: AppDefinition) {
        const name = app.appName || ''
        if (!name) return

        const confirmation = window.prompt(
            `This permanently deletes ${name}. Type CONFIRM to choose its volumes.`
        )
        if (confirmation?.trim().toLocaleLowerCase() !== 'confirm') return

        const volumeNames = (app.volumes || [])
            .map((volume) => volume.volumeName)
            .filter((volume): volume is string => !!volume)

        setDeleteCandidate(app)
        setVolumesToDelete(volumeNames)
    }

    async function deleteApp() {
        if (!deleteCandidate?.appName) return

        await runOperation(async () => {
            await clientApiRequest('/user/apps/appDefinitions/delete/', {
                method: 'POST',
                body: JSON.stringify({
                    appNames: [deleteCandidate.appName],
                    volumes: volumesToDelete,
                }),
            })
        })
        setDeleteCandidate(null)
        setVolumesToDelete([])
    }

    async function deleteProject(project: ProjectDefinition) {
        const projectApps = apps.filter((app) =>
            appBelongsToProject(app, project.id)
        )
        if (projectApps.length) {
            setNotice({
                kind: 'error',
                message: 'Move or delete the apps in this project first.',
            })
            return
        }

        if (
            window.prompt(`Type DELETE to remove project ${project.name}.`) !==
            'DELETE'
        ) {
            return
        }

        await runOperation(async () => {
            await clientApiRequest('/user/projects/delete/', {
                method: 'POST',
                body: JSON.stringify({ projectIds: [project.id] }),
            })
        })
    }

    return (
        <div className="space-y-6">
            {notice && (
                <Alert
                    variant={
                        notice.kind === 'error' ? 'destructive' : 'default'
                    }
                >
                    <AlertTitle>
                        {notice.kind === 'error' ? 'Operation failed' : 'Done'}
                    </AlertTitle>
                    <AlertDescription>{notice.message}</AlertDescription>
                </Alert>
            )}

            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
                        Application inventory
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                        Apps
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Organize services into projects and open each app for
                        configuration and deployment.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() => {
                            setEditingProject(null)
                            setShowProjectForm((value) => !value)
                        }}
                    >
                        <FolderPlus className="h-4 w-4" />
                        New project
                    </Button>
                    <Button
                        type="button"
                        onClick={() => setShowCreateApp((value) => !value)}
                    >
                        <Plus className="h-4 w-4" />
                        New app
                    </Button>
                </div>
            </div>

            {showCreateApp && (
                <Card>
                    <CardHeader>
                        <CardTitle>Create an app</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form
                            className="grid gap-4 md:grid-cols-[1.2fr_1fr_auto] md:items-end"
                            onSubmit={createApp}
                        >
                            <div className="space-y-2">
                                <Label htmlFor="new-app-name">App name</Label>
                                <Input
                                    id="new-app-name"
                                    name="appName"
                                    placeholder="my-awesome-app"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="new-app-project">Project</Label>
                                <Select
                                    id="new-app-project"
                                    name="projectId"
                                    defaultValue=""
                                >
                                    <option value="">Root apps</option>
                                    {projects.map((project) => (
                                        <option
                                            key={project.id}
                                            value={project.id}
                                        >
                                            {project.name}
                                        </option>
                                    ))}
                                </Select>
                            </div>
                            <label className="flex h-10 items-center gap-2 text-sm">
                                <input
                                    name="hasPersistentData"
                                    type="checkbox"
                                />
                                Persistent data
                            </label>
                            <div className="md:col-span-3 flex justify-end">
                                <Button type="submit" disabled={working}>
                                    {working && (
                                        <LoaderCircle className="h-4 w-4 animate-spin" />
                                    )}
                                    Create app
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {showProjectForm && (
                <Card>
                    <CardHeader>
                        <CardTitle>
                            {editingProject
                                ? `Edit ${editingProject.name}`
                                : 'Create a project'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form
                            className="grid gap-4 md:grid-cols-2"
                            onSubmit={saveProject}
                        >
                            <div className="space-y-2">
                                <Label htmlFor="project-name">Name</Label>
                                <Input
                                    id="project-name"
                                    name="name"
                                    defaultValue={editingProject?.name}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="project-parent">
                                    Parent project
                                </Label>
                                <Select
                                    id="project-parent"
                                    name="parentProjectId"
                                    defaultValue={
                                        editingProject?.parentProjectId || ''
                                    }
                                >
                                    <option value="">No parent</option>
                                    {projects
                                        .filter(
                                            (project) =>
                                                project.id !==
                                                editingProject?.id
                                        )
                                        .map((project) => (
                                            <option
                                                key={project.id}
                                                value={project.id}
                                            >
                                                {project.name}
                                            </option>
                                        ))}
                                </Select>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="project-description">
                                    Description
                                </Label>
                                <Textarea
                                    id="project-description"
                                    name="description"
                                    defaultValue={editingProject?.description}
                                />
                            </div>
                            <div className="md:col-span-2 flex justify-end gap-2">
                                <Button
                                    variant="ghost"
                                    type="button"
                                    onClick={() => setShowProjectForm(false)}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={working}>
                                    {working && (
                                        <LoaderCircle className="h-4 w-4 animate-spin" />
                                    )}
                                    Save project
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {deleteCandidate && (
                <Card className="border-destructive/40">
                    <CardHeader>
                        <CardTitle className="text-destructive">
                            Delete {deleteCandidate.appName}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                            The app cannot be restored. Select only the
                            persistent volumes that should be removed. CapRover
                            will still protect volumes shared with another app.
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {deleteCandidateVolumes.length > 0 ? (
                            <div className="grid gap-2 sm:grid-cols-2">
                                {deleteCandidateVolumes.map((volume) => (
                                    <label
                                        key={volume}
                                        className="flex items-center gap-2 rounded-lg border p-3 text-sm"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={volumesToDelete.includes(
                                                volume
                                            )}
                                            onChange={(event) =>
                                                setVolumesToDelete((current) =>
                                                    event.target.checked
                                                        ? Array.from(
                                                              new Set([
                                                                  ...current,
                                                                  volume,
                                                              ])
                                                          )
                                                        : current.filter(
                                                              (item) =>
                                                                  item !==
                                                                  volume
                                                          )
                                                )
                                            }
                                        />
                                        <span className="truncate font-mono text-xs">
                                            {volume}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        ) : (
                            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                                This app has no persistent volumes. No volume
                                data will be removed.
                            </p>
                        )}
                        <div className="flex flex-wrap justify-end gap-2">
                            <Button
                                variant="ghost"
                                type="button"
                                onClick={() => {
                                    setDeleteCandidate(null)
                                    setVolumesToDelete([])
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                type="button"
                                disabled={working}
                                onClick={() => void deleteApp()}
                            >
                                {working && (
                                    <LoaderCircle className="h-4 w-4 animate-spin" />
                                )}
                                Delete app
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
                <Card className="h-fit">
                    <CardHeader>
                        <CardTitle className="text-base">Projects</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1">
                        <button
                            type="button"
                            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${!selectedProjectId ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted'}`}
                            onClick={() => setSelectedProjectId('')}
                        >
                            <span className="flex items-center gap-2">
                                <Folder className="h-4 w-4" /> All apps
                            </span>
                            <span>{apps.length}</span>
                        </button>
                        {projects.map((project) => (
                            <div
                                key={project.id}
                                className="group flex items-center gap-1"
                            >
                                <button
                                    type="button"
                                    className={`flex min-w-0 flex-1 items-center justify-between rounded-md px-3 py-2 text-left text-sm ${selectedProjectId === project.id ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted'}`}
                                    onClick={() =>
                                        setSelectedProjectId(project.id)
                                    }
                                >
                                    <span className="flex min-w-0 items-center gap-2">
                                        <Folder className="h-4 w-4 shrink-0" />
                                        <span className="truncate">
                                            {project.name}
                                        </span>
                                    </span>
                                    <span>
                                        {
                                            apps.filter((app) =>
                                                appBelongsToProject(
                                                    app,
                                                    project.id
                                                )
                                            ).length
                                        }
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    aria-label={`Edit ${project.name}`}
                                    className="rounded p-2 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100"
                                    onClick={() => {
                                        setEditingProject(project)
                                        setShowProjectForm(true)
                                    }}
                                >
                                    <span className="text-xs">Edit</span>
                                </button>
                                <button
                                    type="button"
                                    aria-label={`Delete ${project.name}`}
                                    className="rounded p-2 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                                    onClick={() => deleteProject(project)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <CardTitle className="text-base">
                                {selectedProjectId
                                    ? projects.find(
                                          (project) =>
                                              project.id === selectedProjectId
                                      )?.name
                                    : 'All apps'}
                            </CardTitle>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {visibleApps.length} of {apps.length} apps
                            </p>
                        </div>
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                            <Select
                                className="w-full sm:w-40"
                                value={statusFilter}
                                onChange={(event) =>
                                    setStatusFilter(
                                        event.target.value as 'all' | AppStatus
                                    )
                                }
                                aria-label="Filter apps by status"
                            >
                                <option value="all">All statuses</option>
                                <option value="published">Published</option>
                                <option value="on_approval">On approval</option>
                                <option value="paused">Paused</option>
                            </Select>
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    className="pl-9"
                                    value={search}
                                    onChange={(event) =>
                                        setSearch(event.target.value)
                                    }
                                    placeholder="Search apps or tag:name"
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {visibleApps.length === 0 ? (
                            <div className="rounded-xl border border-dashed p-10 text-center">
                                <p className="font-medium">No apps found</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Create an app or adjust the current filter.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {visibleApps.map((app) => {
                                    const status = getAppStatus(app)
                                    return (
                                        <div
                                            key={app.appName}
                                            className="flex flex-col gap-4 rounded-xl border p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between"
                                        >
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {status ===
                                                    'on_approval' ? (
                                                        <span className="truncate font-medium">
                                                            {app.appName}
                                                        </span>
                                                    ) : (
                                                        <Link
                                                            href={`/apps/details/${encodeURIComponent(app.appName || '')}`}
                                                            className="truncate font-medium text-primary hover:underline"
                                                        >
                                                            {app.appName}
                                                        </Link>
                                                    )}
                                                    <Badge
                                                        className={getAppStatusClassName(
                                                            status
                                                        )}
                                                    >
                                                        {getAppStatusLabel(
                                                            status
                                                        )}
                                                    </Badge>
                                                    {app.isAppBuilding && (
                                                        <Badge className="border-amber-300 bg-amber-50 text-amber-700">
                                                            Building
                                                        </Badge>
                                                    )}
                                                    {app.hasPersistentData && (
                                                        <Badge>
                                                            Persistent
                                                        </Badge>
                                                    )}
                                                    {app.createdByAgent && (
                                                        <Badge className="border-violet-300 bg-violet-50 text-violet-700">
                                                            Agent:{' '}
                                                            {
                                                                app
                                                                    .createdByAgent
                                                                    .name
                                                            }
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="mt-1 truncate text-sm text-muted-foreground">
                                                    {app.description ||
                                                        'No description'}
                                                </p>
                                                <div className="mt-2 flex flex-wrap gap-1">
                                                    {(app.tags || []).map(
                                                        (tag) => (
                                                            <Badge
                                                                key={
                                                                    tag.tagName
                                                                }
                                                                className="text-[11px]"
                                                            >
                                                                {tag.tagName}
                                                            </Badge>
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-4 text-sm text-muted-foreground">
                                                {status === 'on_approval' ? (
                                                    <span>
                                                        Waiting for approval
                                                    </span>
                                                ) : (
                                                    <>
                                                        <span>
                                                            {app.instanceCount}{' '}
                                                            instance
                                                            {app.instanceCount ===
                                                            1
                                                                ? ''
                                                                : 's'}
                                                        </span>
                                                        <span>
                                                            v
                                                            {app.deployedVersion ||
                                                                0}
                                                        </span>
                                                    </>
                                                )}
                                                {status === 'published' &&
                                                !app.notExposeAsWebApp ? (
                                                    <a
                                                        className="text-primary hover:underline"
                                                        href={`https://${app.appName}.${rootDomain}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        Open
                                                    </a>
                                                ) : null}
                                                {status !== 'on_approval' && (
                                                    <button
                                                        type="button"
                                                        aria-label={`Delete ${app.appName}`}
                                                        className="rounded p-2 hover:bg-destructive/10 hover:text-destructive"
                                                        onClick={() =>
                                                            beginDeleteApp(app)
                                                        }
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
