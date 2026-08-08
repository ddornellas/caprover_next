import type * as React from 'react'

import { cn } from '@/lib/utils'

const Card = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={cn(
            'rounded-xl border bg-card text-card-foreground shadow-sm',
            className
        )}
        {...props}
    />
)

const CardHeader = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={cn('flex flex-col space-y-1.5 p-6', className)}
        {...props}
    />
)

const CardTitle = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3
        className={cn(
            'text-2xl font-semibold leading-none tracking-tight',
            className
        )}
        {...props}
    />
)

const CardDescription = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className={cn('text-sm text-muted-foreground', className)} {...props} />
)

const CardContent = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn('p-6 pt-0', className)} {...props} />
)

const CardFooter = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn('flex items-center p-6 pt-0', className)} {...props} />
)

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
