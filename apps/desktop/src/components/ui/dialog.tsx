import React from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './button'
import { cn } from '../../lib/utils'

interface DialogContextValue {
  open: boolean
  setOpen: (open: boolean) => void
}

const DialogContext = React.createContext<DialogContextValue | null>(null)

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  return <DialogContext.Provider value={{ open, setOpen: onOpenChange }}>{children}</DialogContext.Provider>
}

export function DialogTrigger({ children }: { children: ReactNode }) {
  const context = React.useContext(DialogContext)
  if (!context) throw new Error('DialogTrigger must be used within Dialog')
  return <div onClick={() => context.setOpen(true)}>{children}</div>
}

export function DialogContent({
  className,
  title,
  description,
  children,
}: HTMLAttributes<HTMLDivElement> & { title?: string; description?: string; children: ReactNode }) {
  const context = React.useContext(DialogContext)
  if (!context?.open) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
      <div className={cn('w-full max-w-xl rounded-3xl border border-white/10 bg-slate-950/95 p-5 shadow-2xl', className)}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title ? <h2 className="text-lg font-semibold text-white">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon" onClick={() => context.setOpen(false)} aria-label="Close dialog">
            ×
          </Button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
