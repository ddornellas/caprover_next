import { redirect } from 'next/navigation'

import { DashboardShell } from '@/components/dashboard-shell'
import { MaintenanceWorkspace } from '@/components/maintenance-workspace'
import { ServiceState } from '@/components/service-state'
import { getSystemInfo } from '@/lib/caprover-api'

export const dynamic = 'force-dynamic'

export default async function MaintenancePage() {
    const result = await getSystemInfo()

    if (result.state.kind === 'unauthenticated') redirect('/login')
    if (!result.data) {
        return (
            <ServiceState
                title="Unable to load maintenance"
                message={result.state.message}
            />
        )
    }

    return (
        <DashboardShell info={result.data}>
            <MaintenanceWorkspace />
        </DashboardShell>
    )
}
