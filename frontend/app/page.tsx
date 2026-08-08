import { redirect } from 'next/navigation'

import { DashboardOverview } from '@/components/dashboard-overview'
import { DashboardShell } from '@/components/dashboard-shell'
import { ServiceState } from '@/components/service-state'
import { getAppsWorkspace } from '@/lib/caprover-api'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
    const systemInfo = await getAppsWorkspace()

    if (systemInfo.state.kind === 'unauthenticated') {
        redirect('/login')
    }

    if (!systemInfo.data) {
        return (
            <ServiceState
                title="Captain is not ready"
                message={systemInfo.state.message}
            />
        )
    }

    return (
        <DashboardShell info={systemInfo.data.systemInfo}>
            <DashboardOverview
                apps={systemInfo.data.apps}
                projects={systemInfo.data.projects}
            />
        </DashboardShell>
    )
}
