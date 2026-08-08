import type { Metadata } from 'next'

import { LegacyHashRedirect } from '@/components/legacy-hash-redirect'
import { LocaleRuntime } from '@/components/locale-runtime'
import { ThemeProvider } from '@/components/theme-provider'
import { ThemeRuntime } from '@/components/theme-runtime'

import './globals.css'

export const metadata: Metadata = {
    title: 'CapRover',
    description: 'A focused control plane for Docker Swarm.',
}

export default function RootLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body>
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                >
                    <LegacyHashRedirect />
                    <LocaleRuntime />
                    <ThemeRuntime />
                    {children}
                </ThemeProvider>
            </body>
        </html>
    )
}
