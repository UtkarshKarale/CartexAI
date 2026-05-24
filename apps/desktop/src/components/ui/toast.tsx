/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react'
import React from 'react'
import { cn } from '../../lib/utils'
import type { ToastEntry } from './toast-types'

interface ToastContextValue {
  toasts: ToastEntry[]
  pushToast: (toast: Omit<ToastEntry, 'id'>) => void
  dismissToast: (id: string) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastEntry[]>([])

  const dismissToast = React.useCallback((id: string) => {
    setToasts((items) => items.filter((toast) => toast.id !== id))
  }, [])

  const pushToast = React.useCallback((toast: Omit<ToastEntry, 'id'>) => {
    const id = crypto.randomUUID()
    setToasts((items) => [...items, { ...toast, id }])
    window.setTimeout(() => dismissToast(id), 3500)
  }, [dismissToast])

  return (
    <ToastContext.Provider value={{ toasts, pushToast, dismissToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[70] flex w-[min(100vw-2rem,24rem)] flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'rounded-2xl border border-white/10 bg-slate-950/95 p-4 shadow-[0_24px_70px_rgba(2,6,23,0.4)] backdrop-blur-xl',
              toast.variant === 'success' && 'border-emerald-400/30',
              toast.variant === 'warning' && 'border-amber-400/30',
              toast.variant === 'destructive' && 'border-rose-400/30',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-white">{toast.title}</h4>
                {toast.description ? <p className="mt-1 text-sm text-slate-400">{toast.description}</p> : null}
              </div>
              <button className="text-slate-400 transition hover:text-white" onClick={() => dismissToast(toast.id)}>
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = React.useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}
