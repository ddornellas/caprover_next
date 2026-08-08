'use client'

import { useEffect } from 'react'

import { applyLocale } from '@/components/locale-preferences'

export function LocaleRuntime() {
    useEffect(() => {
        const stored = window.localStorage.getItem('caprover-language')
        if (stored) {
            applyLocale(stored)
            window.dispatchEvent(new CustomEvent('caprover:locale-changed'))
        }
    }, [])

    return null
}
