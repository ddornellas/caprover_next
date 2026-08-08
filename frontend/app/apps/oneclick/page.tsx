import { redirect } from 'next/navigation'

import { DashboardShell } from '@/components/dashboard-shell'
import { OneClickWorkspace } from '@/components/one-click-workspace'
import { ServiceState } from '@/components/service-state'
import { getSystemInfo } from '@/lib/caprover-api'

export const dynamic = 'force-dynamic'

export default async function OneClickPage() {
    const result = await getSystemInfo()
    if (result.state.kind === 'unauthenticated') redirect('/login')
    if (!result.data) {
        return (
            <ServiceState
                title="Unable to load one-click apps"
                message={result.state.message}
            />
        )
    }
    return (
        <DashboardShell info={result.data}>
            <OneClickWorkspace rootDomain={result.data.rootDomain} />
        </DashboardShell>
    )
}
