import React from 'react'
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface TabsContextValue {
  value: string
  setValue: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

interface TabsProps extends HTMLAttributes<HTMLDivElement> {
  value: string
  onValueChange: (value: string) => void
  children?: ReactNode
}

export function Tabs({ value, onValueChange, className, ...props }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, setValue: onValueChange }}>
      <div className={className} {...props} />
    </TabsContext.Provider>
  )
}

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('inline-flex rounded-2xl bg-white/6 p-1 ring-1 ring-white/10', className)} {...props} />
}

interface TabsTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

export function TabsTrigger({ value, className, children, ...props }: TabsTriggerProps) {
  const context = React.useContext(TabsContext)
  if (!context) {
    throw new Error('TabsTrigger must be used within Tabs')
  }

  const active = context.value === value
  return (
    <button
      type="button"
      onClick={() => context.setValue(value)}
      className={cn(
        'rounded-xl px-3 py-1.5 text-sm font-medium transition',
        active ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-300 hover:text-white',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  value: string
}

export function TabsContent({ value, className, children, ...props }: TabsContentProps) {
  const context = React.useContext(TabsContext)
  if (!context || context.value !== value) {
    return null
  }

  return (
    <div className={cn('pt-4', className)} {...props}>
      {children}
    </div>
  )
}
