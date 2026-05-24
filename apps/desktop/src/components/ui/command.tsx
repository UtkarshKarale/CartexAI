import type { ReactNode } from 'react'
import { Dialog, DialogContent } from './dialog'
import { Button } from './button'
import { Input } from './input'
import { cn } from '../../lib/utils'

interface CommandProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  query: string
  onQueryChange: (value: string) => void
  children: ReactNode
}

export function Command({ open, onOpenChange, query, onQueryChange, children }: CommandProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Command palette" description="Search actions, panels, and assistant commands.">
        <div className="space-y-4">
          <Input
            autoFocus
            placeholder="Type to search commands..."
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          {children}
          <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-3 py-2 text-xs text-slate-400">
            <span>Press Esc to close</span>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function CommandList({ children }: { children: ReactNode }) {
  return <div className="space-y-2">{children}</div>
}

export function CommandItem({
  title,
  description,
  active,
  onSelect,
}: {
  title: string
  description?: string
  active?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-2xl border border-white/8 px-3 py-3 text-left transition hover:bg-white/6',
        active && 'border-cyan-400/25 bg-cyan-400/10',
      )}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/8 text-sm font-semibold text-white">
        {title.slice(0, 2).toUpperCase()}
      </div>
      <div>
        <div className="text-sm font-medium text-white">{title}</div>
        {description ? <div className="mt-1 text-xs leading-5 text-slate-400">{description}</div> : null}
      </div>
    </button>
  )
}

