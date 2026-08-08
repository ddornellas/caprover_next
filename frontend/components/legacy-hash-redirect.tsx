'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function LegacyHashRedirect() {
    const router = useRouter()

    useEffect(() => {
        const hash = window.location.hash
        if (!hash.startsWith('#/')) return

        const target = hash.slice(1)
        window.history.replaceState(null, '', target)
        router.replace(target)
    }, [router])

    return null
}
