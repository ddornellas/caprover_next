'use client'

import {
    AlertTriangle,
    CloudDownload,
    LoaderCircle,
    RefreshCw,
    Trash2,
    Wrench,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { clientApiRequest, CaptainApiError } from '@/lib/api-client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

interface VersionInfo {
    canUpdate?: boolean
    currentVersion?: string
    latestVersion?: string
    changeLogMessage?: string
}

interface CleanupConfig {
    mostRecentLimit?: number
    cronSchedule?: string
    timezone?: string
}

interface UnusedImage {
    id: string
    tags?: string[]
}

function getErrorMessage(error: unknown) {
    if (error instanceof CaptainApiError) return error.message
    if (error instanceof Error) return error.message
    return 'The operation could not be completed.'
}

export function MaintenanceWorkspace() {
    const [version, setVersion] = useState<VersionInfo>()
    const [cleanup, setCleanup] = useState<CleanupConfig>()
    const [images, setImages] = useState<UnusedImage[]>([])
    const [selectedImages, setSelectedImages] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [working, setWorking] = useState(false)
    const [notice, setNotice] = useState<string>()
    const [error, setError] = useState<string>()

    async function load() {
        setLoading(true)
        setError(undefined)
        try {
            const [versionResponse, cleanupResponse] = await Promise.all([
                clientApiRequest<VersionInfo>('/user/system/versionInfo/'),
                clientApiRequest<CleanupConfig>('/user/system/diskcleanup/'),
            ])
            setVersion(versionResponse.data)
            setCleanup(cleanupResponse.data)
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void load()
    }, [])

    async function createBackup() {
        setWorking(true)
        setError(undefined)
        try {
            const response = await clientApiRequest<{ downloadToken?: string }>(
                '/user/system/createbackup/',
                { method: 'POST' }
            )
            if (!response.data.downloadToken) {
                throw new Error('CapRover did not return a download token.')
            }
            setNotice('Backup is ready. Download started.')
            window.location.assign(
                `/api/caprover/downloads?namespace=captain&downloadToken=${encodeURIComponent(response.data.downloadToken)}`
            )
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setWorking(false)
        }
    }

    async function saveCleanup() {
        if (!cleanup) return
        setWorking(true)
        setError(undefined)
        try {
            await clientApiRequest('/user/system/diskcleanup/', {
                method: 'POST',
                body: JSON.stringify(cleanup),
            })
            setNotice('Automatic cleanup settings saved.')
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setWorking(false)
        }
    }

    async function installUpdate() {
        if (!version?.latestVersion) return
        if (
            !window.confirm(
                `Start the CapRover update to ${version.latestVersion}? The control plane may be unavailable for about a minute.`
            )
        ) {
            return
        }
        setWorking(true)
        setError(undefined)
        try {
            await clientApiRequest('/user/system/versionInfo/', {
                method: 'POST',
                body: JSON.stringify({ latestVersion: version.latestVersion }),
            })
            setNotice('Update started. The control plane may restart shortly.')
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setWorking(false)
        }
    }

    async function loadImages() {
        setWorking(true)
        setError(undefined)
        try {
            const response = await clientApiRequest<{
                unusedImages?: UnusedImage[]
            }>(
                `/user/apps/appDefinitions/unusedImages?mostRecentLimit=${Math.max(0, Number(cleanup?.mostRecentLimit || 2))}`
            )
            setImages(response.data.unusedImages || [])
            setSelectedImages([])
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setWorking(false)
        }
    }

    async function deleteImages() {
        if (!selectedImages.length) return
        if (
            !window.confirm(`Delete ${selectedImages.length} unused image(s)?`)
        ) {
            return
        }
        setWorking(true)
        setError(undefined)
        try {
            await clientApiRequest('/user/apps/appDefinitions/deleteImages', {
                method: 'POST',
                body: JSON.stringify({ imageIds: selectedImages }),
            })
            setNotice(
                'Selected unused images were removed where Docker allowed it.'
            )
            await loadImages()
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setWorking(false)
        }
    }

    if (loading && !version && !cleanup) {
        return (
            <Card>
                <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Loading maintenance state…
                </CardContent>
            </Card>
        )
    }

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
                    <AlertTitle>Maintenance operation failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
                        Operations
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                        Maintenance
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Back up configuration, update CapRover, and clean unused
                        images with explicit confirmation.
                    </p>
                </div>
                <Button
                    variant="outline"
                    type="button"
                    disabled={loading}
                    onClick={() => void load()}
                >
                    <RefreshCw className={loading ? 'animate-spin' : ''} />
                    Refresh
                </Button>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Wrench className="h-5 w-5 text-primary" />
                            CapRover update
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Info
                                label="Current version"
                                value={version?.currentVersion || 'Unknown'}
                            />
                            <Info
                                label="Latest stable"
                                value={version?.latestVersion || 'Unknown'}
                            />
                        </div>
                        {version?.changeLogMessage && (
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border p-3 text-sm">
                                {version.changeLogMessage}
                            </pre>
                        )}
                        {version?.canUpdate ? (
                            <Button
                                type="button"
                                disabled={working}
                                onClick={() => void installUpdate()}
                            >
                                <CloudDownload className="h-4 w-4" />
                                Install update
                            </Button>
                        ) : (
                            <Badge>Already up to date</Badge>
                        )}
                        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>
                                Read the changelog and keep a backup before
                                installing an update.
                            </span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Configuration backup</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            The backup contains CapRover configuration,
                            certificates, domains, and app definitions.
                            Application volumes and images are not included.
                        </p>
                        <Button
                            type="button"
                            disabled={working}
                            onClick={() => void createBackup()}
                        >
                            {working ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                            ) : (
                                <CloudDownload className="h-4 w-4" />
                            )}
                            Create and download backup
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Automatic disk cleanup</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-5 md:grid-cols-3">
                    <div className="space-y-2">
                        <Label htmlFor="cleanup-cron">Cron schedule</Label>
                        <Input
                            id="cleanup-cron"
                            value={cleanup?.cronSchedule || ''}
                            placeholder="0 1 * * *"
                            onChange={(event) =>
                                setCleanup({
                                    ...cleanup,
                                    cronSchedule: event.target.value,
                                })
                            }
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="cleanup-limit">Keep most recent</Label>
                        <Input
                            id="cleanup-limit"
                            type="number"
                            min={0}
                            value={cleanup?.mostRecentLimit ?? 2}
                            onChange={(event) =>
                                setCleanup({
                                    ...cleanup,
                                    mostRecentLimit: Number(event.target.value),
                                })
                            }
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="cleanup-timezone">Timezone</Label>
                        <Input
                            id="cleanup-timezone"
                            value={cleanup?.timezone || ''}
                            placeholder="UTC"
                            onChange={(event) =>
                                setCleanup({
                                    ...cleanup,
                                    timezone: event.target.value,
                                })
                            }
                        />
                    </div>
                    <div className="md:col-span-3 flex justify-end">
                        <Button
                            type="button"
                            disabled={working || !cleanup}
                            onClick={() => void saveCleanup()}
                        >
                            Save cleanup settings
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle>One-off image cleanup</CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Inspect unused images first, then select only the
                            IDs you want Docker to remove.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="outline"
                            type="button"
                            disabled={working}
                            onClick={() => void loadImages()}
                        >
                            <RefreshCw className="h-4 w-4" /> Get list
                        </Button>
                        <Button
                            variant="destructive"
                            type="button"
                            disabled={working || !selectedImages.length}
                            onClick={() => void deleteImages()}
                        >
                            <Trash2 className="h-4 w-4" /> Remove selected
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    {images.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No image list loaded, or no unused images were
                            found.
                        </p>
                    ) : (
                        images.map((image) => (
                            <label
                                key={image.id}
                                className="flex items-start gap-3 rounded-lg border p-3 text-sm"
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedImages.includes(image.id)}
                                    onChange={(event) =>
                                        setSelectedImages((current) =>
                                            event.target.checked
                                                ? [...current, image.id]
                                                : current.filter(
                                                      (id) => id !== image.id
                                                  )
                                        )
                                    }
                                />
                                <span className="min-w-0">
                                    <span className="block break-all font-mono text-xs">
                                        {image.id}
                                    </span>
                                    <span className="mt-1 block text-muted-foreground">
                                        {image.tags?.join(', ') ||
                                            'Untagged image'}
                                    </span>
                                </span>
                            </label>
                        ))
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

function Info({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 font-medium">{value}</p>
        </div>
    )
}
