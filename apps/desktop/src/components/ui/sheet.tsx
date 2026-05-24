import React from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './button'
import { cn } from '../../lib/utils'

interface SheetContextValue {
  open: boolean
  setOpen: (open: boolean) => void
}

const SheetContext = React.createContext<SheetContextValue | null>(null)

export function Sheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  return <SheetContext.Provider value={{ open, setOpen: onOpenChange }}>{children}</SheetContext.Provider>
}

export function SheetContent({
  side = 'right',
  title,
  children,
}: {
  side?: 'left' | 'right'
  title?: string
  children: ReactNode
}) {
  const context = React.useContext(SheetContext)
  if (!context?.open) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm">
      <div
        className={cn(
          'absolute top-0 h-full w-full max-w-md border-l border-white/10 bg-slate-950/98 p-5 shadow-2xl',
          side === 'right' ? 'right-0' : 'left-0 border-l-0 border-r',
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            {title ? <h2 className="text-lg font-semibold text-white">{title}</h2> : null}
          </div>
          <Button variant="ghost" size="icon" onClick={() => context.setOpen(false)} aria-label="Close sheet">
            ×
          </Button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
