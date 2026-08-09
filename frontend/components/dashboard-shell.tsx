'use client'

import {
    Activity,
    Boxes,
    CircleGauge,
    ExternalLink,
    LayoutDashboard,
    LogOut,
    Menu,
    Rocket,
    Settings,
    ShieldCheck,
    SlidersHorizontal,
    X,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { ThemeToggle } from '@/components/theme-toggle'
import { translate, useLocale } from '@/components/locale-preferences'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SystemInfo } from '@/lib/caprover-api'
import { cn } from '@/lib/utils'

const navigation = [
    { href: '/', label: 'Overview', icon: LayoutDashboard },
    { href: '/apps', label: 'Apps', icon: Boxes },
    { href: '/apps/oneclick', label: 'One-Click Apps', icon: Rocket },
    { href: '/monitoring', label: 'Monitoring', icon: Activity },
    { href: '/cluster', label: 'Cluster', icon: CircleGauge },
    { href: '/maintenance', label: 'Maintenance', icon: SlidersHorizontal },
    { href: '/settings', label: 'Settings', icon: Settings },
]

interface DashboardShellProps {
    info: SystemInfo
    children?: ReactNode
}

async function logout(router: ReturnType<typeof useRouter>) {
    try {
        await fetch('/api/caprover/login/logout/', {
            method: 'POST',
            credentials: 'include',
        })
    } finally {
        window.localStorage.removeItem('CAPROVER_AUTH_KEY')
        window.sessionStorage.removeItem('CAPROVER_AUTH_KEY')
        router.replace('/login')
        router.refresh()
    }
}

export function DashboardShell({ info, children }: DashboardShellProps) {
    const pathname = usePathname()
    const router = useRouter()
    const locale = useLocale()
    const [mobileOpen, setMobileOpen] = useState(false)

    return (
        <div className="min-h-screen bg-background text-foreground">
            <aside
                className={cn(
                    'fixed inset-y-0 left-0 z-40 w-72 border-r bg-card/95 p-5 backdrop-blur transition-transform lg:translate-x-0',
                    mobileOpen ? 'translate-x-0' : '-translate-x-full'
                )}
            >
                <div className="flex items-center justify-between gap-3 px-2">
                    <Link
                        href="/"
                        className="flex items-center gap-3"
                        onClick={() => setMobileOpen(false)}
                    >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="font-semibold tracking-tight">
                                CapRover
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Control plane
                            </p>
                        </div>
                    </Link>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="lg:hidden"
                        type="button"
                        onClick={() => setMobileOpen(false)}
                        aria-label="Close navigation"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <nav className="mt-10 space-y-1">
                    {navigation.map((item) => {
                        const Icon = item.icon
                        const isActive =
                            pathname === item.href ||
                            (item.href !== '/' &&
                                pathname.startsWith(`${item.href}/`))

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                className={cn(
                                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                                    isActive
                                        ? 'bg-primary/10 font-medium text-primary'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                {translate(item.label, locale)}
                            </Link>
                        )
                    })}
                </nav>

                <div className="absolute inset-x-5 bottom-5 space-y-3">
                    <a
                        href="https://caprover.com"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 px-3 text-xs text-muted-foreground hover:text-foreground"
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {translate('Documentation', locale)}
                    </a>
                    <Button
                        variant="ghost"
                        className="w-full justify-start gap-3 px-3 text-muted-foreground hover:text-foreground"
                        type="button"
                        onClick={() => void logout(router)}
                    >
                        <LogOut className="h-4 w-4" />
                        {translate('Sign out', locale)}
                    </Button>
                </div>
            </aside>

            {mobileOpen && (
                <button
                    className="fixed inset-0 z-30 bg-black/40 lg:hidden"
                    type="button"
                    aria-label="Close navigation"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            <main className="lg:pl-72">
                <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/80 px-5 backdrop-blur lg:px-10">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="lg:hidden"
                        type="button"
                        onClick={() => setMobileOpen(true)}
                        aria-label="Open navigation"
                    >
                        <Menu className="h-5 w-5" />
                    </Button>
                    <div className="hidden text-sm text-muted-foreground lg:block">
                        Infrastructure at a glance
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                        <ThemeToggle />
                    </div>
                </header>

                <div className="mx-auto max-w-7xl space-y-8 px-5 py-8 lg:px-10">
                    {children ?? (
                        <>
                            <section className="relative overflow-hidden rounded-2xl bg-slate-950 p-8 text-white shadow-2xl shadow-slate-950/10 dark:bg-slate-900">
                                <div className="absolute inset-0 bg-grid-white/[0.05]" />
                                <div className="relative max-w-2xl">
                                    <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-sky-300">
                                        Captain online
                                    </p>
                                    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                                        Your infrastructure, in one calm place.
                                    </h1>
                                    <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">
                                        Deploy, observe, and maintain your
                                        Docker Swarm apps without leaving the
                                        control plane.
                                    </p>
                                </div>
                            </section>

                            <section className="grid gap-4 md:grid-cols-3">
                                <Card>
                                    <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                                        <CardTitle className="text-sm font-medium">
                                            Root domain
                                        </CardTitle>
                                        <GlobeIcon />
                                    </CardHeader>
                                    <CardContent>
                                        <p className="truncate text-xl font-semibold">
                                            {info.rootDomain ||
                                                'Not configured'}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {info.hasRootSsl
                                                ? 'TLS certificate active'
                                                : 'TLS certificate not active'}
                                        </p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                                        <CardTitle className="text-sm font-medium">
                                            Captain endpoint
                                        </CardTitle>
                                        <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-xl font-semibold">
                                            {info.captainSubDomain}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {info.forceSsl
                                                ? 'HTTPS enforced'
                                                : 'HTTP and HTTPS available'}
                                        </p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                                        <CardTitle className="text-sm font-medium">
                                            Control plane
                                        </CardTitle>
                                        <CircleGauge className="h-4 w-4 text-sky-500" />
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-xl font-semibold">
                                            Healthy
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            API v2 is responding
                                        </p>
                                    </CardContent>
                                </Card>
                            </section>

                            <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>What&apos;s next</CardTitle>
                                    </CardHeader>
                                    <CardContent className="grid gap-3 sm:grid-cols-2">
                                        <QuickLink
                                            href="/apps"
                                            title="Deploy an app"
                                            description="Create or update a service."
                                        />
                                        <QuickLink
                                            href="/monitoring"
                                            title="Inspect traffic"
                                            description="Review system and app metrics."
                                        />
                                        <QuickLink
                                            href="/cluster"
                                            title="Manage nodes"
                                            description="Review your Swarm topology."
                                        />
                                        <QuickLink
                                            href="/maintenance"
                                            title="Maintain Captain"
                                            description="Backups, updates, and cleanup."
                                        />
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Migration status</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm leading-6 text-muted-foreground">
                                            This dashboard is rendered by a
                                            Next.js Server Component. Existing
                                            CapRover API v2 routes remain the
                                            source of truth while each workflow
                                            moves to the new UI.
                                        </p>
                                    </CardContent>
                                </Card>
                            </section>
                        </>
                    )}
                </div>
            </main>
        </div>
    )
}

function QuickLink({
    href,
    title,
    description,
}: {
    href: string
    title: string
    description: string
}) {
    return (
        <Link
            href={href}
            className="rounded-lg border p-4 transition-colors hover:border-primary/40 hover:bg-muted/50"
        >
            <p className="font-medium">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </Link>
    )
}

function GlobeIcon() {
    return (
        <span className="text-lg" aria-hidden="true">
            ◎
        </span>
    )
}
