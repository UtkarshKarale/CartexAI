import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

type Variant = 'default' | 'secondary' | 'ghost' | 'outline' | 'destructive' | 'glass'
type Size = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children?: ReactNode
}

const styles: Record<Variant, string> = {
  default:
    'bg-[rgb(var(--foreground))] text-[rgb(var(--background))] hover:opacity-95 shadow-[0_10px_28px_rgba(15,23,42,0.14)]',
  secondary:
    'bg-[rgb(var(--muted))] text-[rgb(var(--foreground))] hover:opacity-95',
  ghost: 'bg-transparent text-[rgb(var(--foreground))] hover:bg-[rgb(var(--muted))]/40',
  outline:
    'border border-[rgb(var(--border))] bg-transparent text-[rgb(var(--foreground))] hover:bg-[rgb(var(--muted))]/35',
  destructive: 'bg-rose-500 text-white hover:bg-rose-400',
  glass:
    'border border-[rgb(var(--border))] bg-[rgb(var(--panel))] text-[rgb(var(--foreground))] backdrop-blur-xl hover:opacity-95 shadow-[0_12px_40px_rgba(15,23,42,0.18)]',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-sm',
  icon: 'h-10 w-10 p-0',
}

export function Button({
  variant = 'default',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 disabled:cursor-not-allowed disabled:opacity-50',
        styles[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}
