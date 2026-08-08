import { redirect } from 'next/navigation'

import { DashboardShell } from '@/components/dashboard-shell'
import { ServiceState } from '@/components/service-state'
import { SettingsWorkspace } from '@/components/settings-workspace'
import { getSystemInfo } from '@/lib/caprover-api'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
    const result = await getSystemInfo()

    if (result.state.kind === 'unauthenticated') redirect('/login')
    if (!result.data) {
        return (
            <ServiceState
                title="Unable to load settings"
                message={result.state.message}
            />
        )
    }

    return (
        <DashboardShell info={result.data}>
            <SettingsWorkspace initialInfo={result.data} />
        </DashboardShell>
    )
}
