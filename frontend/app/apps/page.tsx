import { redirect } from 'next/navigation'

import { AppsWorkspace } from '@/components/apps-workspace'
import { DashboardShell } from '@/components/dashboard-shell'
import { ServiceState } from '@/components/service-state'
import { getAppsWorkspace } from '@/lib/caprover-api'

export const dynamic = 'force-dynamic'

export default async function AppsPage({
    searchParams,
}: {
    searchParams: Promise<{ project?: string }>
}) {
    const result = await getAppsWorkspace()
    const query = await searchParams

    if (result.state.kind === 'unauthenticated') {
        redirect('/login')
    }

    if (!result.data) {
        return (
            <ServiceState
                title={
                    result.state.kind === 'unavailable'
                        ? 'Captain is not ready'
                        : 'Unable to load apps'
                }
                message={result.state.message}
            />
        )
    }

    return (
        <DashboardShell info={result.data.systemInfo}>
            <AppsWorkspace
                apps={result.data.apps.appDefinitions}
                projects={result.data.projects}
                rootDomain={result.data.apps.rootDomain}
                initialProjectId={
                    query.project && query.project !== 'new'
                        ? decodeURIComponent(query.project)
                        : ''
                }
                initialShowProjectForm={query.project === 'new'}
            />
        </DashboardShell>
    )
}
