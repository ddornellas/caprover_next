import { Server } from 'lucide-react'

import { LoginForm } from '@/components/login-form'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'

export default function LoginPage() {
    return (
        <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-5 py-10 text-white">
            <div className="absolute inset-0 bg-grid-white/[0.04]" />
            <div className="relative w-full max-w-md">
                <div className="mb-8 flex items-center justify-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-400 text-slate-950 shadow-xl shadow-sky-400/20">
                        <Server className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-lg font-semibold tracking-tight">
                            CapRover
                        </p>
                        <p className="text-sm text-slate-400">
                            Infrastructure control plane
                        </p>
                    </div>
                </div>

                <Card className="border-white/10 bg-white/[0.97] text-slate-950 shadow-2xl">
                    <CardHeader>
                        <CardTitle>Welcome back</CardTitle>
                        <CardDescription>
                            Sign in to manage your Captain instance.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <LoginForm />
                    </CardContent>
                </Card>

                <p className="mt-6 text-center text-xs text-slate-500">
                    CapRover keeps the existing API v2 contract while the new
                    interface rolls out.
                </p>
            </div>
        </main>
    )
}
