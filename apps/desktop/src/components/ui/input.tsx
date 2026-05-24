import type { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-3 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))] outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20',
        className,
      )}
      {...props}
    />
  )
}
