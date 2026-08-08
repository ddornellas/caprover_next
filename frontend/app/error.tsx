'use client'

import { useEffect } from 'react'

import { Button } from '@/components/ui/button'

export default function ErrorPage({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error(error)
    }, [error])

    return (
        <main className="flex min-h-screen items-center justify-center bg-background px-5">
            <div className="max-w-md text-center">
                <p className="text-sm font-medium text-primary">
                    Something went wrong
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                    Captain needs a retry.
                </h1>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    The control plane could not load this view. Retry once the
                    Captain service is ready.
                </p>
                <Button className="mt-6" type="button" onClick={() => reset()}>
                    Try again
                </Button>
            </div>
        </main>
    )
}
