import { redirect } from 'next/navigation'

export default async function ProjectCompatibilityPage({
    params,
}: {
    params: Promise<{ projectId: string }>
}) {
    const { projectId } = await params
    redirect(`/apps?project=${encodeURIComponent(projectId)}`)
}
