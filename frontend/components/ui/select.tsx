import type { SelectHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export function Select({
    className,
    ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            className={cn(
                'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                className
            )}
            {...props}
        />
    )
}
