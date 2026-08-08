import { Activity, Boxes, CircleGauge, Rocket, Server } from 'lucide-react'
import Link from 'next/link'

import type { AppsPayload } from '@/lib/caprover-types'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function DashboardOverview({
    apps,
    projects,
}: {
    apps: AppsPayload
    projects: { id: string; name: string }[]
}) {
    const definitions = apps.appDefinitions || []
    const building = definitions.filter((app) => app.isAppBuilding).length
    const exposed = definitions.filter((app) => !app.notExposeAsWebApp).length

    return (
        <div className="space-y-8">
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
                        Deploy, observe, and maintain Docker Swarm apps without
                        leaving the control plane.
                    </p>
                </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Apps"
                    value={`${definitions.length}`}
                    icon={<Boxes className="h-4 w-4 text-sky-500" />}
                />
                <StatCard
                    label="Projects"
                    value={`${projects.length}`}
                    icon={<Server className="h-4 w-4 text-violet-500" />}
                />
                <StatCard
                    label="Web apps"
                    value={`${exposed}`}
                    icon={<Activity className="h-4 w-4 text-emerald-500" />}
                />
                <StatCard
                    label="Builds running"
                    value={`${building}`}
                    icon={<Rocket className="h-4 w-4 text-amber-500" />}
                />
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <Card>
                    <CardHeader>
                        <CardTitle>Applications</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {definitions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No apps yet. Create the first service to get
                                started.
                            </p>
                        ) : (
                            definitions.slice(0, 8).map((app) => (
                                <Link
                                    key={app.appName}
                                    href={`/apps/details/${encodeURIComponent(app.appName || '')}`}
                                    className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate font-medium">
                                            {app.appName}
                                        </p>
                                        <p className="truncate text-sm text-muted-foreground">
                                            {app.description ||
                                                'No description'}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        {app.isAppBuilding && (
                                            <Badge className="border-amber-300 bg-amber-50 text-amber-700">
                                                Building
                                            </Badge>
                                        )}
                                        <span className="text-xs text-muted-foreground">
                                            v{app.deployedVersion || 0}
                                        </span>
                                    </div>
                                </Link>
                            ))
                        )}
                        {definitions.length > 8 && (
                            <Link
                                href="/apps"
                                className="inline-flex text-sm font-medium text-primary hover:underline"
                            >
                                View all apps
                            </Link>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Quick actions</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3">
                        <QuickLink
                            href="/apps"
                            title="Deploy an app"
                            description="Create or update a service."
                        />
                        <QuickLink
                            href="/apps/oneclick"
                            title="One-click catalog"
                            description="Install a packaged application."
                        />
                        <QuickLink
                            href="/monitoring"
                            title="Inspect traffic"
                            description="Review system and app metrics."
                        />
                        <QuickLink
                            href="/maintenance"
                            title="Maintain Captain"
                            description="Backups, updates, and cleanup."
                        />
                    </CardContent>
                </Card>
            </section>
        </div>
    )
}

function StatCard({
    label,
    value,
    icon,
}: {
    label: string
    value: string
    icon: React.ReactNode
}) {
    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium">{label}</CardTitle>
                {icon}
            </CardHeader>
            <CardContent>
                <p className="text-2xl font-semibold">{value}</p>
            </CardContent>
        </Card>
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
