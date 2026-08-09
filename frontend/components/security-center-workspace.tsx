'use client'

import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react'

import type { AuditEvent, SystemInfo } from '@/lib/caprover-types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface SecurityCenterWorkspaceProps {
    systemInfo: SystemInfo
    auditEvents: AuditEvent[]
}

interface Check {
    label: string
    detail: string
    severity: 'critical' | 'warning'
}

export function SecurityCenterWorkspace({
    systemInfo,
    auditEvents,
}: SecurityCenterWorkspaceProps) {
    const checks: Check[] = []

    if (!systemInfo.passwordConfigured) {
        checks.push({
            label: 'Admin password is not configured',
            detail: 'Change the bootstrap password before exposing the dashboard.',
            severity: 'critical',
        })
    }
    if (!systemInfo.twoFactorEnabled) {
        checks.push({
            label: 'Two-factor authentication is disabled',
            detail: 'Enable an authenticator-based second factor for the root account.',
            severity: 'warning',
        })
    }
    if (!systemInfo.hasRootSsl) {
        checks.push({
            label: 'The control-plane certificate is not active',
            detail: 'Configure the root domain and issue a trusted certificate.',
            severity: 'critical',
        })
    } else if (!systemInfo.forceSsl) {
        checks.push({
            label: 'HTTP traffic is still accepted',
            detail: 'Force HTTPS after DNS and certificate validation succeed.',
            severity: 'warning',
        })
    }
    if ((systemInfo.expiringAgentKeyCount || 0) > 0) {
        checks.push({
            label: `${systemInfo.expiringAgentKeyCount} agent key(s) expire soon`,
            detail: 'Rotate automation credentials before they stop working.',
            severity: 'warning',
        })
    }

    return (
        <div className="space-y-6">
            <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
                    Security
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                    Security Center
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    Review the controls that protect this CapRover control
                    plane.
                </p>
            </div>

            {checks.length === 0 ? (
                <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Core controls look healthy</AlertTitle>
                    <AlertDescription>
                        No outstanding control-plane checks were detected.
                    </AlertDescription>
                </Alert>
            ) : (
                <div className="space-y-3">
                    {checks.map((check) => (
                        <Alert
                            key={check.label}
                            variant={
                                check.severity === 'critical'
                                    ? 'destructive'
                                    : 'default'
                            }
                            className={
                                check.severity === 'warning'
                                    ? 'border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100'
                                    : undefined
                            }
                        >
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>{check.label}</AlertTitle>
                            <AlertDescription>{check.detail}</AlertDescription>
                        </Alert>
                    ))}
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
                <StatusCard
                    label="HTTPS"
                    value={systemInfo.hasRootSsl && systemInfo.forceSsl}
                    detail={
                        systemInfo.forceSsl
                            ? 'Traffic is forced over TLS'
                            : 'Certificate or enforcement is missing'
                    }
                />
                <StatusCard
                    label="MFA"
                    value={!!systemInfo.twoFactorEnabled}
                    detail={
                        systemInfo.twoFactorEnabled
                            ? 'Authenticator verification is active'
                            : 'Root account has no second factor'
                    }
                />
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">
                            Agent keys
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">
                            {systemInfo.agentKeyCount || 0}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Scoped automation credentials
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        Recent administrative events
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {auditEvents.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No local events have been recorded yet.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {auditEvents.map((event) => (
                                <div
                                    className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                                    key={event.id}
                                >
                                    <div>
                                        <p className="font-medium">
                                            {event.action}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {event.actor}
                                            {event.resource
                                                ? ` · ${event.resource}`
                                                : ''}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Badge
                                            className={
                                                event.outcome === 'success'
                                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                                    : 'border-rose-300 bg-rose-50 text-rose-700'
                                            }
                                        >
                                            {event.outcome}
                                        </Badge>
                                        <time
                                            className="text-xs text-muted-foreground"
                                            dateTime={event.at}
                                        >
                                            {new Date(
                                                event.at
                                            ).toLocaleString()}
                                        </time>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

function StatusCard({
    label,
    value,
    detail,
}: {
    label: string
    value: boolean
    detail: string
}) {
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">{label}</CardTitle>
            </CardHeader>
            <CardContent>
                <Badge
                    className={
                        value
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            : 'border-amber-300 bg-amber-50 text-amber-700'
                    }
                >
                    {value ? 'Protected' : 'Needs attention'}
                </Badge>
                <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
            </CardContent>
        </Card>
    )
}
