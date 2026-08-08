import type { TextareaHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export function Textarea({
    className,
    ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <textarea
            className={cn(
                'flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                className
            )}
            {...props}
        />
    )
}
