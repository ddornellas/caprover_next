'use client'

import { Activity, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { clientApiRequest, CaptainApiError } from '@/lib/api-client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type JsonObject = Record<string, unknown>

function getErrorMessage(error: unknown) {
    if (error instanceof CaptainApiError) return error.message
    if (error instanceof Error) return error.message
    return 'The operation could not be completed.'
}

function pretty(value: unknown) {
    return JSON.stringify(value ?? {}, null, 2)
}

export function MonitoringWorkspace() {
    const [loadBalancer, setLoadBalancer] = useState<JsonObject>()
    const [netData, setNetData] = useState<JsonObject>()
    const [goAccess, setGoAccess] = useState<JsonObject>()
    const [netDataJson, setNetDataJson] = useState('')
    const [goAccessJson, setGoAccessJson] = useState('')
    const [loading, setLoading] = useState(true)
    const [working, setWorking] = useState(false)
    const [notice, setNotice] = useState<string>()
    const [error, setError] = useState<string>()

    async function load() {
        setLoading(true)
        setError(undefined)
        try {
            const [loadBalancerResponse, netDataResponse, goAccessResponse] =
                await Promise.all([
                    clientApiRequest<JsonObject>(
                        '/user/system/loadbalancerinfo/'
                    ),
                    clientApiRequest<JsonObject>('/user/system/netdata/'),
                    clientApiRequest<JsonObject>('/user/system/goaccess/'),
                ])
            setLoadBalancer(loadBalancerResponse.data)
            setNetData(netDataResponse.data)
            setGoAccess(goAccessResponse.data)
            setNetDataJson(pretty(netDataResponse.data))
            setGoAccessJson(pretty(goAccessResponse.data))
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void load()
    }, [])

    async function saveNetData() {
        let parsed: JsonObject
        try {
            parsed = JSON.parse(netDataJson) as JsonObject
        } catch {
            setError('NetData settings must be valid JSON.')
            return
        }

        setWorking(true)
        setError(undefined)
        try {
            await clientApiRequest('/user/system/netdata/', {
                method: 'POST',
                body: JSON.stringify({ netDataInfo: parsed }),
            })
            setNetData(parsed)
            setNotice('NetData settings saved.')
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setWorking(false)
        }
    }

    async function saveGoAccess() {
        let parsed: JsonObject
        try {
            parsed = JSON.parse(goAccessJson) as JsonObject
        } catch {
            setError('GoAccess settings must be valid JSON.')
            return
        }

        setWorking(true)
        setError(undefined)
        try {
            await clientApiRequest('/user/system/goaccess/', {
                method: 'POST',
                body: JSON.stringify({ goAccessInfo: parsed }),
            })
            setGoAccess(parsed)
            setNotice('GoAccess settings saved.')
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setWorking(false)
        }
    }

    async function toggle(
        kind: 'netdata' | 'goaccess',
        current: JsonObject | undefined
    ) {
        if (!current) return
        const next = { ...current, isEnabled: !current.isEnabled }
        if (kind === 'netdata') {
            setNetData(next)
            setNetDataJson(pretty(next))
        } else {
            setGoAccess(next)
            setGoAccessJson(pretty(next))
        }
        setWorking(true)
        setError(undefined)
        try {
            await clientApiRequest(`/user/system/${kind}/`, {
                method: 'POST',
                body: JSON.stringify(
                    kind === 'netdata'
                        ? { netDataInfo: next }
                        : { goAccessInfo: next }
                ),
            })
            setNotice(`${kind === 'netdata' ? 'NetData' : 'GoAccess'} updated.`)
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setWorking(false)
        }
    }

    if (loading && !netData && !goAccess) {
        return (
            <Card>
                <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Loading observability settings…
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
                    <AlertTitle>Monitoring operation failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
                        Observability
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                        Monitoring
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Configure the existing NetData and GoAccess managers and
                        inspect the load balancer state.
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
                <StatusCard
                    title="NetData"
                    enabled={!!netData?.isEnabled}
                    onToggle={() => void toggle('netdata', netData)}
                    disabled={working}
                />
                <StatusCard
                    title="GoAccess"
                    enabled={!!goAccess?.isEnabled}
                    onToggle={() => void toggle('goaccess', goAccess)}
                    disabled={working}
                />
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Activity className="h-4 w-4 text-primary" />
                            Load balancer
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            Current manager information is available below.
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <JsonSettingsCard
                    title="NetData settings"
                    description="The JSON editor preserves notification fields that may be added by newer CapRover versions."
                    value={netDataJson}
                    onChange={setNetDataJson}
                    onSave={() => void saveNetData()}
                    disabled={working}
                />
                <JsonSettingsCard
                    title="GoAccess settings"
                    description="Configure report rotation and retention without bypassing the existing manager."
                    value={goAccessJson}
                    onChange={setGoAccessJson}
                    onSave={() => void saveGoAccess()}
                    disabled={working}
                />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Load balancer information</CardTitle>
                </CardHeader>
                <CardContent>
                    <pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                        {pretty(loadBalancer)}
                    </pre>
                </CardContent>
            </Card>

            {!!netData?.isEnabled && typeof netData.netDataUrl === 'string' && (
                <a
                    href={`https://${netData.netDataUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                >
                    Open NetData <ExternalLink className="h-4 w-4" />
                </a>
            )}
        </div>
    )
}

function StatusCard({
    title,
    enabled,
    onToggle,
    disabled,
}: {
    title: string
    enabled: boolean
    onToggle: () => void
    disabled: boolean
}) {
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
                <Badge
                    className={
                        enabled
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            : ''
                    }
                >
                    {enabled ? 'Running' : 'Stopped'}
                </Badge>
                <Button
                    variant={enabled ? 'destructive' : 'default'}
                    size="sm"
                    type="button"
                    disabled={disabled}
                    onClick={onToggle}
                >
                    {enabled ? 'Stop' : 'Start'}
                </Button>
            </CardContent>
        </Card>
    )
}

function JsonSettingsCard({
    title,
    description,
    value,
    onChange,
    onSave,
    disabled,
}: {
    title: string
    description: string
    value: string
    onChange: (value: string) => void
    onSave: () => void
    disabled: boolean
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <p className="text-sm text-muted-foreground">{description}</p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label>Configuration</Label>
                    <Textarea
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        rows={14}
                        spellCheck={false}
                        className="font-mono text-xs"
                    />
                </div>
                <div className="flex justify-end">
                    <Button type="button" disabled={disabled} onClick={onSave}>
                        Save settings
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
