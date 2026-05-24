import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface SwitchProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  checked?: boolean
}

export function Switch({ checked = false, className, ...props }: SwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full border border-[rgb(var(--border))] transition',
        checked ? 'bg-cyan-400/80' : 'bg-[rgb(var(--muted))]',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'block h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}
