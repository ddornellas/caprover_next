'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import { translate, useLocale } from '@/components/locale-preferences'

import { Button } from '@/components/ui/button'

export function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme()
    const locale = useLocale()
    const [mounted, setMounted] = useState(false)

    useEffect(() => setMounted(true), [])

    if (!mounted) {
        return <div className="h-10 w-10" aria-hidden="true" />
    }

    const isDark = resolvedTheme === 'dark'

    return (
        <Button
            variant="ghost"
            size="icon"
            type="button"
            aria-label={translate(
                isDark ? 'Use light theme' : 'Use dark theme',
                locale
            )}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
        >
            {isDark ? (
                <Sun className="h-4 w-4" />
            ) : (
                <Moon className="h-4 w-4" />
            )}
        </Button>
    )
}
