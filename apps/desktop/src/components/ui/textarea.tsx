import type { TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-24 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-3 py-2 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))] outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20',
        className,
      )}
      {...props}
    />
  )
}
