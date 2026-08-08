import Link from 'next/link'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface ServiceStateProps {
    title: string
    message: string
    retryHref?: string
}

export function ServiceState({
    title,
    message,
    retryHref = '/',
}: ServiceStateProps) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-background px-6">
            <div className="w-full max-w-lg space-y-5">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">
                    CapRover
                </p>
                <Alert variant="destructive">
                    <AlertTitle>{title}</AlertTitle>
                    <AlertDescription>{message}</AlertDescription>
                </Alert>
                <Link
                    href={retryHref}
                    className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                    Try again
                </Link>
            </div>
        </main>
    )
}
