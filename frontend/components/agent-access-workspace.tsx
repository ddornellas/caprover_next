'use client'

import {
    Check,
    Clipboard,
    KeyRound,
    LoaderCircle,
    ShieldCheck,
    XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { CaptainApiError, clientApiRequest } from '@/lib/api-client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type AgentRole = 'read' | 'deploy_approval' | 'deploy'

interface AgentKey {
    id: string
    name: string
    role: AgentRole
    appNames: string[]
    createdAt: string
    expiresAt?: string
    revokedAt?: string
    lastUsedAt?: string
}

interface DeploymentRequest {
    id: string
    agentKeyName: string
    role: AgentRole
    appName: string
    captainDefinition: Record<string, unknown>
    status: string
    createdAt: string
    expiresAt: string
    error?: string
}

const roleDescriptions: Record<AgentRole, string> = {
    read: 'Read scoped apps and logs. No changes.',
    deploy_approval: 'Submit deploys that wait for a human approval.',
    deploy: 'Deploy scoped apps without an approval step.',
}

function getErrorMessage(error: unknown) {
    if (error instanceof CaptainApiError) return error.message
    if (error instanceof Error) return error.message
    return 'The operation could not be completed.'
}

function formatDate(value?: string) {
    if (!value) return 'Never'
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : value
}

export function AgentAccessWorkspace() {
    const [keys, setKeys] = useState<AgentKey[]>([])
    const [deployments, setDeployments] = useState<DeploymentRequest[]>([])
    const [availableApps, setAvailableApps] = useState<string[]>([])
    const [name, setName] = useState('')
    const [role, setRole] = useState<AgentRole>('deploy_approval')
    const [appNames, setAppNames] = useState('')
    const [expiresAt, setExpiresAt] = useState('')
    const [newApiKey, setNewApiKey] = useState('')
    const [copied, setCopied] = useState(false)
    const [loading, setLoading] = useState(true)
    const [working, setWorking] = useState(false)
    const [notice, setNotice] = useState<string>()
    const [error, setError] = useState<string>()

    async function load() {
        setLoading(true)
        setError(undefined)
        try {
            const [keysResponse, deploymentsResponse, appsResponse] =
                await Promise.all([
                    clientApiRequest<{ keys?: AgentKey[] }>(
                        '/user/agents/keys/'
                    ),
                    clientApiRequest<{ deployments?: DeploymentRequest[] }>(
                        '/user/agents/deployments/'
                    ),
                    clientApiRequest<{
                        appDefinitions?: Array<{ appName?: string }>
                    }>('/user/apps/appDefinitions/'),
                ])

            setKeys(keysResponse.data.keys || [])
            setDeployments(deploymentsResponse.data.deployments || [])
            setAvailableApps(
                (appsResponse.data.appDefinitions || [])
                    .map((app) => app.appName || '')
                    .filter(Boolean)
                    .sort()
            )
        } catch (loadError) {
            setError(getErrorMessage(loadError))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void load()
    }, [])

    async function createKey(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const scopedApps = Array.from(
            new Set(
                appNames
                    .split(',')
                    .map((appName) => appName.trim())
                    .filter(Boolean)
            )
        )

        if (!scopedApps.length) {
            setError('Add at least one existing app to the key scope.')
            return
        }

        setWorking(true)
        setError(undefined)
        setNotice(undefined)
        try {
            const response = await clientApiRequest<{
                apiKey: string
                metadata: AgentKey
            }>('/user/agents/keys/', {
                method: 'POST',
                body: JSON.stringify({
                    name: name.trim(),
                    role,
                    appNames: scopedApps,
                    expiresAt: expiresAt
                        ? new Date(expiresAt).toISOString()
                        : undefined,
                }),
            })
            setNewApiKey(response.data.apiKey)
            setName('')
            setAppNames('')
            setExpiresAt('')
            setNotice(
                'Agent key created. Copy it now; it will not be shown again.'
            )
            await load()
        } catch (createError) {
            setError(getErrorMessage(createError))
        } finally {
            setWorking(false)
        }
    }

    async function copyKey() {
        try {
            await navigator.clipboard.writeText(newApiKey)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
        } catch {
            setError('Copy failed. Select and copy the key manually.')
        }
    }

    async function revokeKey(key: AgentKey) {
        if (!window.confirm(`Revoke the agent key “${key.name}”?`)) return
        setWorking(true)
        setError(undefined)
        try {
            await clientApiRequest(`/user/agents/keys/${key.id}/revoke/`, {
                method: 'POST',
            })
            setNotice(`Agent key “${key.name}” revoked.`)
            await load()
        } catch (revokeError) {
            setError(getErrorMessage(revokeError))
        } finally {
            setWorking(false)
        }
    }

    async function approveDeployment(request: DeploymentRequest) {
        setWorking(true)
        setError(undefined)
        try {
            await clientApiRequest(
                `/user/agents/deployments/${request.id}/approve/`,
                { method: 'POST' }
            )
            setNotice(`Deployment for “${request.appName}” approved.`)
            await load()
        } catch (approveError) {
            setError(getErrorMessage(approveError))
        } finally {
            setWorking(false)
        }
    }

    async function rejectDeployment(request: DeploymentRequest) {
        const reason = window.prompt('Optional rejection reason:', '')
        if (reason === null) return
        setWorking(true)
        setError(undefined)
        try {
            await clientApiRequest(
                `/user/agents/deployments/${request.id}/reject/`,
                {
                    method: 'POST',
                    body: JSON.stringify({ reason }),
                }
            )
            setNotice(`Deployment for “${request.appName}” rejected.`)
            await load()
        } catch (rejectError) {
            setError(getErrorMessage(rejectError))
        } finally {
            setWorking(false)
        }
    }

    const pendingDeployments = deployments.filter(
        (deployment) => deployment.status === 'pending'
    )

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <KeyRound className="h-5 w-5 text-primary" />
                    Agent access
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                    Create scoped API keys for automation without sharing the
                    root password or granting SSH. Every key is restricted to
                    the apps listed below.
                </p>
            </CardHeader>
            <CardContent className="space-y-6">
                {notice && (
                    <Alert>
                        <AlertTitle>Agent access updated</AlertTitle>
                        <AlertDescription>{notice}</AlertDescription>
                    </Alert>
                )}
                {error && (
                    <Alert variant="destructive">
                        <AlertTitle>Agent access failed</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                {newApiKey && (
                    <Alert className="border-amber-300 bg-amber-50 text-amber-950">
                        <AlertTitle>Copy this key now</AlertTitle>
                        <AlertDescription className="space-y-3">
                            <p>
                                This is the only time CapRover will display the
                                secret.
                            </p>
                            <div className="flex gap-2">
                                <Textarea
                                    readOnly
                                    rows={2}
                                    value={newApiKey}
                                    className="font-mono text-xs text-slate-950"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="shrink-0"
                                    onClick={() => void copyKey()}
                                >
                                    {copied ? (
                                        <Check className="h-4 w-4" />
                                    ) : (
                                        <Clipboard className="h-4 w-4" />
                                    )}
                                    {copied ? 'Copied' : 'Copy'}
                                </Button>
                            </div>
                        </AlertDescription>
                    </Alert>
                )}

                <form
                    className="grid gap-4 lg:grid-cols-2"
                    onSubmit={createKey}
                >
                    <div className="space-y-2">
                        <Label htmlFor="agent-key-name">Key name</Label>
                        <Input
                            id="agent-key-name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="deploy-bot-production"
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="agent-key-role">Access level</Label>
                        <Select
                            id="agent-key-role"
                            value={role}
                            onChange={(event) =>
                                setRole(event.target.value as AgentRole)
                            }
                        >
                            <option value="read">Read only</option>
                            <option value="deploy_approval">
                                Deploy with approval
                            </option>
                            <option value="deploy">Deploy</option>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            {roleDescriptions[role]}
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="agent-key-apps">Allowed apps</Label>
                        <Input
                            id="agent-key-apps"
                            value={appNames}
                            onChange={(event) =>
                                setAppNames(event.target.value)
                            }
                            placeholder="api, web, worker"
                            list="agent-key-app-options"
                            required
                        />
                        <datalist id="agent-key-app-options">
                            {availableApps.map((appName) => (
                                <option key={appName} value={appName} />
                            ))}
                        </datalist>
                        <p className="text-xs text-muted-foreground">
                            Separate names with commas. Wildcards are not
                            supported.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="agent-key-expiry">Expiration</Label>
                        <Input
                            id="agent-key-expiry"
                            type="datetime-local"
                            value={expiresAt}
                            onChange={(event) =>
                                setExpiresAt(event.target.value)
                            }
                        />
                        <p className="text-xs text-muted-foreground">
                            Optional; maximum lifetime is one year.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 lg:col-span-2">
                        <Button type="submit" disabled={working}>
                            {working && (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                            )}
                            Create agent key
                        </Button>
                        <span className="text-xs text-muted-foreground">
                            Keys cannot delete apps or access SSH.
                        </span>
                    </div>
                </form>

                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-medium">Issued keys</h3>
                            <p className="text-sm text-muted-foreground">
                                Revoke a key immediately if it is exposed.
                            </p>
                        </div>
                        {loading && (
                            <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                    </div>
                    {keys.length === 0 ? (
                        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                            No agent keys issued yet.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {keys.map((key) => (
                                <div
                                    key={key.id}
                                    className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-medium">
                                                {key.name}
                                            </p>
                                            <Badge>{key.role}</Badge>
                                            {key.revokedAt && (
                                                <Badge className="border-rose-300 bg-rose-50 text-rose-700">
                                                    Revoked
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            Apps: {key.appNames.join(', ')}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Created {formatDate(key.createdAt)}{' '}
                                            · Last used{' '}
                                            {formatDate(key.lastUsedAt)}
                                            {key.expiresAt &&
                                                ` · Expires ${formatDate(key.expiresAt)}`}
                                        </p>
                                    </div>
                                    {!key.revokedAt && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            disabled={working}
                                            onClick={() => void revokeKey(key)}
                                        >
                                            <XCircle className="h-4 w-4" />
                                            Revoke
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-3 border-t pt-6">
                    <div>
                        <h3 className="flex items-center gap-2 font-medium">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                            Pending human approvals
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            Review the exact app and image/Dockerfile payload
                            before allowing a deploy.
                        </p>
                    </div>
                    {pendingDeployments.length === 0 ? (
                        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                            No deployments are waiting for approval.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {pendingDeployments.map((request) => (
                                <div
                                    key={request.id}
                                    className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4"
                                >
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge>{request.appName}</Badge>
                                        <Badge>{request.agentKeyName}</Badge>
                                        <span className="text-xs text-muted-foreground">
                                            Expires{' '}
                                            {formatDate(request.expiresAt)}
                                        </span>
                                    </div>
                                    <pre className="max-h-40 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
                                        {JSON.stringify(
                                            request.captainDefinition,
                                            null,
                                            2
                                        )}
                                    </pre>
                                    {request.error && (
                                        <p className="text-sm text-rose-700">
                                            {request.error}
                                        </p>
                                    )}
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            disabled={working}
                                            onClick={() =>
                                                void approveDeployment(request)
                                            }
                                        >
                                            <Check className="h-4 w-4" />
                                            Approve deploy
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            disabled={working}
                                            onClick={() =>
                                                void rejectDeployment(request)
                                            }
                                        >
                                            <XCircle className="h-4 w-4" />
                                            Reject
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
