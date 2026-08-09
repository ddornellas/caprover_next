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
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.18),transparent_42%)]" />
            <div className="absolute inset-0 bg-grid-white/[0.04]" />
            <div className="relative w-full max-w-md">
                <div className="mb-8 flex items-center justify-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-400 text-slate-950 shadow-xl shadow-sky-400/20 ring-4 ring-sky-400/10">
                        <Server className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-lg font-semibold tracking-tight">
                            CapRover
                        </p>
                        <p className="text-sm text-slate-400">
                            Secure infrastructure control plane
                        </p>
                    </div>
                </div>

                <Card className="overflow-hidden border-slate-200 bg-white text-slate-950 shadow-2xl shadow-black/30">
                    <CardHeader className="space-y-2 border-b border-slate-100 pb-5">
                        <CardTitle className="text-slate-950">
                            Welcome back
                        </CardTitle>
                        <CardDescription className="text-slate-600">
                            Sign in to manage your Captain instance.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <LoginForm />
                    </CardContent>
                </Card>

                <p className="mt-6 text-center text-xs text-slate-400">
                    Secure access to your Docker Swarm control plane.
                </p>
            </div>
        </main>
    )
}
