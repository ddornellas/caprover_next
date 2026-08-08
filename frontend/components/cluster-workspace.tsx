'use client'

import {
    Database,
    LoaderCircle,
    Plus,
    RefreshCw,
    Server,
    Trash2,
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
import { Textarea } from '@/components/ui/textarea'

type JsonObject = Record<string, unknown>

interface RegistryForm {
    id: string
    registryUser: string
    registryPassword: string
    registryDomain: string
    registryImagePrefix: string
}

const emptyRegistry: RegistryForm = {
    id: '',
    registryUser: '',
    registryPassword: '',
    registryDomain: '',
    registryImagePrefix: '',
}

function getErrorMessage(error: unknown) {
    if (error instanceof CaptainApiError) return error.message
    if (error instanceof Error) return error.message
    return 'The operation could not be completed.'
}

function valueOf(object: JsonObject, key: string) {
    const value = object[key]
    return value === undefined || value === null ? '' : `${value}`
}

export function ClusterWorkspace() {
    const [nodes, setNodes] = useState<JsonObject[]>([])
    const [registries, setRegistries] = useState<JsonObject[]>([])
    const [defaultRegistryId, setDefaultRegistryId] = useState('')
    const [loading, setLoading] = useState(true)
    const [working, setWorking] = useState(false)
    const [notice, setNotice] = useState<string>()
    const [error, setError] = useState<string>()
    const [showNodeForm, setShowNodeForm] = useState(false)
    const [showRegistryForm, setShowRegistryForm] = useState(false)
    const [registryType, setRegistryType] = useState<'remote' | 'local'>(
        'remote'
    )
    const [editingRegistry, setEditingRegistry] = useState<string>()
    const [registry, setRegistry] = useState<RegistryForm>(emptyRegistry)

    async function load() {
        setLoading(true)
        setError(undefined)
        try {
            const [nodesResponse, registriesResponse] = await Promise.all([
                clientApiRequest<{ nodes?: JsonObject[] }>(
                    '/user/system/nodes/'
                ),
                clientApiRequest<{
                    registries?: JsonObject[]
                    defaultPushRegistryId?: string
                }>('/user/registries/'),
            ])
            setNodes(nodesResponse.data.nodes || [])
            setRegistries(registriesResponse.data.registries || [])
            setDefaultRegistryId(
                registriesResponse.data.defaultPushRegistryId || ''
            )
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void load()
    }, [])

    async function run(operation: () => Promise<void>, message: string) {
        setWorking(true)
        setError(undefined)
        try {
            await operation()
            setNotice(message)
            await load()
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setWorking(false)
        }
    }

    async function addNode(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        await run(async () => {
            await clientApiRequest('/user/system/nodes/', {
                method: 'POST',
                body: JSON.stringify({
                    nodeType: `${form.get('nodeType') || 'worker'}`,
                    privateKey: `${form.get('privateKey') || ''}`,
                    remoteNodeIpAddress: `${form.get('remoteNodeIpAddress') || ''}`,
                    sshPort: `${form.get('sshPort') || '22'}`,
                    sshUser: `${form.get('sshUser') || 'root'}`,
                    captainIpAddress: `${form.get('captainIpAddress') || ''}`,
                }),
            })
        }, 'Docker node joined successfully.')
        setShowNodeForm(false)
        event.currentTarget.reset()
    }

    async function saveRegistry(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (registryType === 'local') {
            await run(async () => {
                await clientApiRequest(
                    '/user/system/selfhostregistry/enableregistry/',
                    { method: 'POST' }
                )
            }, 'Self-hosted registry enabled.')
            setShowRegistryForm(false)
            return
        }

        const form = new FormData(event.currentTarget)
        const body = {
            id: registry.id,
            registryUser: `${form.get('registryUser') || ''}`.trim(),
            registryPassword: `${form.get('registryPassword') || ''}`,
            registryDomain: `${form.get('registryDomain') || ''}`.trim(),
            registryImagePrefix:
                `${form.get('registryImagePrefix') || ''}`.trim(),
        }
        await run(
            async () => {
                await clientApiRequest(
                    editingRegistry
                        ? '/user/registries/update/'
                        : '/user/registries/insert/',
                    {
                        method: 'POST',
                        body: JSON.stringify(body),
                    }
                )
            },
            editingRegistry ? 'Registry updated.' : 'Registry added.'
        )
        setShowRegistryForm(false)
        setEditingRegistry(undefined)
        setRegistry(emptyRegistry)
    }

    async function deleteRegistry(item: JsonObject) {
        const id = valueOf(item, 'id')
        if (
            !window.confirm(
                `Delete registry ${valueOf(item, 'registryDomain')}?`
            )
        ) {
            return
        }
        const local = valueOf(item, 'registryType') === 'LOCAL_REG'
        await run(async () => {
            await clientApiRequest(
                local
                    ? '/user/system/selfhostregistry/disableregistry/'
                    : '/user/registries/delete/',
                {
                    method: 'POST',
                    body: local
                        ? undefined
                        : JSON.stringify({ registryId: id }),
                }
            )
        }, 'Registry deleted.')
    }

    async function setPushRegistry(id: string) {
        await run(async () => {
            await clientApiRequest('/user/registries/setpush/', {
                method: 'POST',
                body: JSON.stringify({ registryId: id }),
            })
        }, 'Default push registry changed.')
    }

    function beginEdit(item: JsonObject) {
        setEditingRegistry(valueOf(item, 'id'))
        setRegistry({
            id: valueOf(item, 'id'),
            registryUser: valueOf(item, 'registryUser'),
            registryPassword: '',
            registryDomain: valueOf(item, 'registryDomain'),
            registryImagePrefix: valueOf(item, 'registryImagePrefix'),
        })
        setRegistryType('remote')
        setShowRegistryForm(true)
    }

    if (loading && !nodes.length && !registries.length) {
        return (
            <Card>
                <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Loading cluster state…
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
                    <AlertTitle>Cluster operation failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
                        Docker Swarm
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                        Cluster
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Manage the sanitized node and registry contracts exposed
                        by CapRover.
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

            <div className="grid gap-4 md:grid-cols-3">
                <StatCard title="Nodes" value={`${nodes.length}`} />
                <StatCard title="Registries" value={`${registries.length}`} />
                <StatCard
                    title="Push registry"
                    value={
                        registries.find(
                            (item) => valueOf(item, 'id') === defaultRegistryId
                        )
                            ? valueOf(
                                  registries.find(
                                      (item) =>
                                          valueOf(item, 'id') ===
                                          defaultRegistryId
                                  ) as JsonObject,
                                  'registryDomain'
                              )
                            : 'Not configured'
                    }
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                    <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Server className="h-5 w-5 text-primary" />
                            Swarm nodes
                        </CardTitle>
                        <Button
                            size="sm"
                            type="button"
                            onClick={() => setShowNodeForm((value) => !value)}
                        >
                            <Plus className="h-4 w-4" />
                            Add node
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {showNodeForm && (
                            <NodeForm onSubmit={addNode} disabled={working} />
                        )}
                        {nodes.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No nodes returned.
                            </p>
                        ) : (
                            nodes.map((node) => (
                                <div
                                    key={valueOf(node, 'nodeId')}
                                    className="rounded-lg border p-3"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="font-medium">
                                            {valueOf(node, 'hostname') ||
                                                valueOf(node, 'nodeId')}
                                        </p>
                                        <Badge>
                                            {valueOf(node, 'status') ||
                                                valueOf(node, 'state')}
                                        </Badge>
                                    </div>
                                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                                        <span>
                                            Type:{' '}
                                            {valueOf(node, 'isLeader') ===
                                            'true'
                                                ? 'Leader'
                                                : valueOf(node, 'type')}
                                        </span>
                                        <span>IP: {valueOf(node, 'ip')}</span>
                                        <span>
                                            OS:{' '}
                                            {valueOf(node, 'operatingSystem')}
                                        </span>
                                        <span>
                                            Docker:{' '}
                                            {valueOf(
                                                node,
                                                'dockerEngineVersion'
                                            )}
                                        </span>
                                        <span>
                                            CPU: {valueOf(node, 'nanoCpu')}
                                        </span>
                                        <span>
                                            Node ID: {valueOf(node, 'nodeId')}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Database className="h-5 w-5 text-primary" />
                            Docker registries
                        </CardTitle>
                        <Button
                            size="sm"
                            type="button"
                            onClick={() => {
                                setEditingRegistry(undefined)
                                setRegistry(emptyRegistry)
                                setRegistryType('remote')
                                setShowRegistryForm((value) => !value)
                            }}
                        >
                            <Plus className="h-4 w-4" />
                            Add registry
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {showRegistryForm && (
                            <form
                                className="space-y-4 rounded-lg border p-4"
                                onSubmit={saveRegistry}
                            >
                                <div className="space-y-2">
                                    <Label htmlFor="registry-type">Type</Label>
                                    <Select
                                        id="registry-type"
                                        value={registryType}
                                        disabled={!!editingRegistry}
                                        onChange={(event) =>
                                            setRegistryType(
                                                event.target.value as
                                                    'remote' | 'local'
                                            )
                                        }
                                    >
                                        <option value="remote">
                                            Remote registry
                                        </option>
                                        <option value="local">
                                            Self-hosted registry
                                        </option>
                                    </Select>
                                </div>
                                {registryType === 'remote' && (
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <RegistryField
                                            label="Username"
                                            name="registryUser"
                                            value={registry.registryUser}
                                            onChange={(value) =>
                                                setRegistry({
                                                    ...registry,
                                                    registryUser: value,
                                                })
                                            }
                                        />
                                        <RegistryField
                                            label="Password"
                                            name="registryPassword"
                                            type="password"
                                            value={registry.registryPassword}
                                            onChange={(value) =>
                                                setRegistry({
                                                    ...registry,
                                                    registryPassword: value,
                                                })
                                            }
                                        />
                                        <RegistryField
                                            label="Domain"
                                            name="registryDomain"
                                            placeholder="registry-1.docker.io"
                                            value={registry.registryDomain}
                                            onChange={(value) =>
                                                setRegistry({
                                                    ...registry,
                                                    registryDomain: value,
                                                })
                                            }
                                        />
                                        <RegistryField
                                            label="Image prefix"
                                            name="registryImagePrefix"
                                            value={registry.registryImagePrefix}
                                            onChange={(value) =>
                                                setRegistry({
                                                    ...registry,
                                                    registryImagePrefix: value,
                                                })
                                            }
                                        />
                                    </div>
                                )}
                                <div className="flex justify-end gap-2">
                                    <Button
                                        variant="ghost"
                                        type="button"
                                        onClick={() =>
                                            setShowRegistryForm(false)
                                        }
                                    >
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={working}>
                                        {working && (
                                            <LoaderCircle className="h-4 w-4 animate-spin" />
                                        )}{' '}
                                        {editingRegistry
                                            ? 'Save registry'
                                            : 'Add registry'}
                                    </Button>
                                </div>
                            </form>
                        )}
                        {registries.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No registries configured.
                            </p>
                        ) : (
                            registries.map((item) => {
                                const id = valueOf(item, 'id')
                                const local =
                                    valueOf(item, 'registryType') ===
                                    'LOCAL_REG'
                                return (
                                    <div
                                        key={id}
                                        className="rounded-lg border p-3"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <p className="font-medium">
                                                    {valueOf(
                                                        item,
                                                        'registryDomain'
                                                    )}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {valueOf(
                                                        item,
                                                        'registryImagePrefix'
                                                    ) || 'No image prefix'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {id === defaultRegistryId && (
                                                    <Badge>Default push</Badge>
                                                )}
                                                <Badge>
                                                    {local
                                                        ? 'Self-hosted'
                                                        : 'Remote'}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                                            {!local && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    type="button"
                                                    onClick={() =>
                                                        beginEdit(item)
                                                    }
                                                >
                                                    Edit
                                                </Button>
                                            )}
                                            {!local &&
                                                id !== defaultRegistryId && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        type="button"
                                                        onClick={() =>
                                                            void setPushRegistry(
                                                                id
                                                            )
                                                        }
                                                    >
                                                        Set default
                                                    </Button>
                                                )}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                type="button"
                                                onClick={() =>
                                                    void deleteRegistry(item)
                                                }
                                            >
                                                <Trash2 className="h-4 w-4" />{' '}
                                                Delete
                                            </Button>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

function StatCard({ title, value }: { title: string; value: string }) {
    return (
        <Card>
            <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{title}</p>
                <p className="mt-2 truncate text-xl font-semibold">{value}</p>
            </CardContent>
        </Card>
    )
}

function RegistryField({
    label,
    name,
    value,
    onChange,
    placeholder,
    type = 'text',
}: {
    label: string
    name: string
    value: string
    onChange: (value: string) => void
    placeholder?: string
    type?: string
}) {
    return (
        <div className="space-y-2">
            <Label htmlFor={name}>{label}</Label>
            <Input
                id={name}
                name={name}
                type={type}
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
                required={name !== 'registryImagePrefix'}
            />
        </div>
    )
}

function NodeForm({
    onSubmit,
    disabled,
}: {
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
    disabled: boolean
}) {
    return (
        <form className="space-y-4 rounded-lg border p-4" onSubmit={onSubmit}>
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="node-type">Node type</Label>
                    <Select
                        id="node-type"
                        name="nodeType"
                        defaultValue="worker"
                    >
                        <option value="worker">Worker</option>
                        <option value="manager">Manager</option>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="ssh-port">SSH port</Label>
                    <Input id="ssh-port" name="sshPort" defaultValue="22" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="remote-ip">Remote node IP</Label>
                    <Input id="remote-ip" name="remoteNodeIpAddress" required />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="captain-ip">Captain IP</Label>
                    <Input id="captain-ip" name="captainIpAddress" required />
                </div>
                <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="ssh-user">SSH user</Label>
                    <Input id="ssh-user" name="sshUser" defaultValue="root" />
                </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor="private-key">SSH private key</Label>
                <Textarea
                    id="private-key"
                    name="privateKey"
                    rows={6}
                    required
                />
            </div>
            <div className="flex justify-end">
                <Button type="submit" disabled={disabled}>
                    {disabled && (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                    )}{' '}
                    Join node
                </Button>
            </div>
        </form>
    )
}
