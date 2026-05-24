import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function ScrollArea({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return (
    <div className={cn('overflow-auto', className)} {...props}>
      {children}
    </div>
  )
}

