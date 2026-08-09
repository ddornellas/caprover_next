'use client'

import { ArrowRight, LoaderCircle, LockKeyhole } from 'lucide-react'
import { FormEvent, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface LoginResponse {
    status: number
    description: string
    data?: {
        token?: string
    }
}

const OTP_REQUIRED_STATUS = 1114

export function LoginForm() {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [password, setPassword] = useState('')
    const [otpToken, setOtpToken] = useState('')
    const [needsOtp, setNeedsOtp] = useState(false)
    const [error, setError] = useState('')

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setError('')

        startTransition(async () => {
            try {
                const response = await fetch('/api/caprover/login', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                    },
                    credentials: 'include',
                    body: JSON.stringify({ password, otpToken }),
                })

                const result = (await response.json()) as LoginResponse

                if (result.status === OTP_REQUIRED_STATUS) {
                    setNeedsOtp(true)
                    setError(
                        'Enter the verification code from your authenticator.'
                    )
                    return
                }

                if (!response.ok || result.status !== 100) {
                    setError(result.description || 'Unable to sign in.')
                    return
                }

                router.replace('/')
                router.refresh()
            } catch {
                setError('Unable to reach CapRover. Try again in a moment.')
            }
        })
    }

    return (
        <form className="space-y-5" onSubmit={submit}>
            {error && (
                <Alert
                    className={
                        needsOtp
                            ? 'border-sky-200 bg-sky-50 text-sky-900'
                            : 'border-rose-200 bg-rose-50 text-rose-900'
                    }
                >
                    <AlertTitle>
                        {needsOtp ? 'Verification required' : 'Sign in failed'}
                    </AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="space-y-2">
                <Label className="text-slate-700" htmlFor="password">
                    Password
                </Label>
                <div className="relative">
                    <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input
                        id="password"
                        name="password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="border-slate-300 bg-white text-slate-950 caret-slate-950 placeholder:text-slate-400 focus-visible:border-sky-500 focus-visible:ring-sky-500/30 pl-10"
                        maxLength={29}
                        autoComplete="current-password"
                        autoFocus
                        required
                    />
                </div>
            </div>

            {needsOtp && (
                <div className="space-y-2">
                    <Label className="text-slate-700" htmlFor="otpToken">
                        Authenticator code
                    </Label>
                    <Input
                        id="otpToken"
                        name="otpToken"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={otpToken}
                        onChange={(event) => setOtpToken(event.target.value)}
                        className="border-slate-300 bg-white text-slate-950 caret-slate-950 placeholder:text-slate-400 focus-visible:border-sky-500 focus-visible:ring-sky-500/30"
                        placeholder="123456"
                        autoFocus
                        required
                    />
                </div>
            )}

            <Button
                className="w-full bg-sky-600 text-white shadow-sm hover:bg-sky-700 focus-visible:ring-sky-500"
                type="submit"
                disabled={isPending}
            >
                {isPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                    <ArrowRight className="h-4 w-4" />
                )}
                {isPending ? 'Signing in…' : 'Sign in'}
            </Button>
        </form>
    )
}
