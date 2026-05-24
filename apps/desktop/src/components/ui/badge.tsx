import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

type Variant = 'default' | 'muted' | 'outline' | 'success' | 'warning' | 'danger'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant
  children?: ReactNode
}

const badgeStyles: Record<Variant, string> = {
  default: 'bg-cyan-400/12 text-cyan-700 ring-1 ring-cyan-400/20 dark:text-cyan-200',
  muted: 'bg-[rgb(var(--muted))] text-[rgb(var(--foreground))] ring-1 ring-[rgb(var(--border))]',
  outline: 'bg-transparent text-[rgb(var(--foreground))] ring-1 ring-[rgb(var(--border))]',
  success: 'bg-emerald-400/12 text-emerald-700 ring-1 ring-emerald-400/20 dark:text-emerald-200',
  warning: 'bg-amber-400/12 text-amber-700 ring-1 ring-amber-400/20 dark:text-amber-200',
  danger: 'bg-rose-400/12 text-rose-700 ring-1 ring-rose-400/20 dark:text-rose-200',
}

export function Badge({ variant = 'default', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]',
        badgeStyles[variant],
        className,
      )}
      {...props}
    />
  )
}
