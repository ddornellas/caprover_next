import { redirect } from 'next/navigation'

import { DashboardShell } from '@/components/dashboard-shell'
import { OneClickWorkspace } from '@/components/one-click-workspace'
import { ServiceState } from '@/components/service-state'
import { getSystemInfo } from '@/lib/caprover-api'

export const dynamic = 'force-dynamic'

export default async function OneClickDeploymentPage({
    searchParams,
}: {
    searchParams: Promise<{
        template?: string
        valuesArray?: string
        appName?: string
        templateName?: string
    }>
}) {
    const result = await getSystemInfo()
    if (result.state.kind === 'unauthenticated') redirect('/login')
    if (!result.data) {
        return (
            <ServiceState
                title="Unable to start deployment"
                message={result.state.message}
            />
        )
    }
    const query = await searchParams
    return (
        <DashboardShell info={result.data}>
            <OneClickWorkspace
                mode="deployment"
                initialAppName={query.appName || ''}
                initialTemplate={query.template || ''}
                initialValues={query.valuesArray || '[]'}
                initialTemplateName={query.templateName || ''}
                rootDomain={result.data.rootDomain}
            />
        </DashboardShell>
    )
}
