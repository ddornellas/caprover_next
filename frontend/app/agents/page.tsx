import { redirect } from 'next/navigation'

import { AgentAccessWorkspace } from '@/components/agent-access-workspace'
import { DashboardShell } from '@/components/dashboard-shell'
import { ServiceState } from '@/components/service-state'
import { getSystemInfo } from '@/lib/caprover-api'

export const dynamic = 'force-dynamic'

export default async function AgentsPage() {
    const result = await getSystemInfo()

    if (result.state.kind === 'unauthenticated') redirect('/login')
    if (!result.data) {
        return (
            <ServiceState
                title="Unable to load agents"
                message={result.state.message}
            />
        )
    }

    return (
        <DashboardShell info={result.data}>
            <AgentAccessWorkspace />
        </DashboardShell>
    )
}
