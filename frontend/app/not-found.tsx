import Link from 'next/link'

import { Button } from '@/components/ui/button'

export default function NotFound() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-background px-5">
            <div className="text-center">
                <p className="text-sm font-medium text-primary">404</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                    Page not found
                </h1>
                <Button className="mt-6" type="button">
                    <Link href="/">Back to overview</Link>
                </Button>
            </div>
        </main>
    )
}
