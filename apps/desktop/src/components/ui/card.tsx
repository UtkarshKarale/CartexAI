import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))] p-4 shadow-[0_24px_60px_rgba(2,6,23,0.12)] backdrop-blur-xl',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: CardProps) {
  return <div className={cn('mb-4 space-y-1', className)} {...props} />
}

export function CardTitle({ className, ...props }: CardProps) {
  return <h3 className={cn('text-base font-semibold tracking-tight text-[rgb(var(--foreground))]', className)} {...props} />
}

export function CardDescription({ className, ...props }: CardProps) {
  return <p className={cn('text-sm text-[rgb(var(--muted-foreground))]', className)} {...props} />
}

export function CardContent({ className, ...props }: CardProps) {
  return <div className={cn('space-y-3', className)} {...props} />
}
