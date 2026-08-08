import { redirect } from 'next/navigation'

import { DashboardShell } from '@/components/dashboard-shell'
import { OneClickWorkspace } from '@/components/one-click-workspace'
import { ServiceState } from '@/components/service-state'
import { getSystemInfo } from '@/lib/caprover-api'

export const dynamic = 'force-dynamic'

export default async function OneClickAppPage({
    params,
    searchParams,
}: {
    params: Promise<{ appName: string }>
    searchParams: Promise<{
        baseDomain?: string
        oneClickAppStringifiedData?: string
        templateName?: string
    }>
}) {
    const result = await getSystemInfo()
    if (result.state.kind === 'unauthenticated') redirect('/login')
    if (!result.data) {
        return (
            <ServiceState
                title="Unable to load one-click app"
                message={result.state.message}
            />
        )
    }

    const { appName } = await params
    const query = await searchParams
    const customTemplate = query.oneClickAppStringifiedData

    return (
        <DashboardShell info={result.data}>
            <OneClickWorkspace
                mode={customTemplate ? 'custom' : 'app'}
                initialAppName={decodeURIComponent(appName)}
                initialBaseDomain={query.baseDomain || ''}
                initialTemplate={customTemplate}
                initialTemplateName={query.templateName || ''}
                rootDomain={result.data.rootDomain}
            />
        </DashboardShell>
    )
}
