import { redirect } from 'next/navigation'

import { AppDetailsWorkspace } from '@/components/app-details-workspace'
import { DashboardShell } from '@/components/dashboard-shell'
import { ServiceState } from '@/components/service-state'
import { getAppDefinition } from '@/lib/caprover-api'

export const dynamic = 'force-dynamic'

export default async function AppDetailsPage({
    params,
}: {
    params: Promise<{ appName: string }>
}) {
    const { appName } = await params
    const result = await getAppDefinition(decodeURIComponent(appName))

    if (result.state.kind === 'unauthenticated') {
        redirect('/login')
    }

    if (!result.data) {
        return (
            <ServiceState
                title="Unable to load app"
                message={result.state.message}
                retryHref="/apps"
            />
        )
    }

    return (
        <DashboardShell info={result.data.systemInfo}>
            <AppDetailsWorkspace
                app={result.data.app}
                projects={result.data.projects}
                rootDomain={result.data.apps.rootDomain}
            />
        </DashboardShell>
    )
}
