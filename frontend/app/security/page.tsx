import { redirect } from 'next/navigation'

import { SecurityCenterWorkspace } from '@/components/security-center-workspace'
import { DashboardShell } from '@/components/dashboard-shell'
import { ServiceState } from '@/components/service-state'
import { getSecurityCenterData } from '@/lib/caprover-api'

export const dynamic = 'force-dynamic'

export default async function SecurityPage() {
    const result = await getSecurityCenterData()

    if (result.state.kind === 'unauthenticated') redirect('/login')
    if (!result.data) {
        return (
            <ServiceState
                title="Unable to load security center"
                message={result.state.message}
            />
        )
    }

    return (
        <DashboardShell info={result.data.systemInfo}>
            <SecurityCenterWorkspace
                systemInfo={result.data.systemInfo}
                auditEvents={result.data.auditEvents}
            />
        </DashboardShell>
    )
}
