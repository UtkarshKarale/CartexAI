import { useEffect, useRef, useState, useCallback } from 'react'
import {
  X, Bell, Plus, Trash2, Clock, Mail, CheckCircle2,
  Ban, Loader2, ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { Badge } from '../../components/ui/badge'
import { cn } from '../../lib/utils'
import type { ReminderRecord, CreateReminderInput } from '../../shared/contracts'

interface RemindersPanelProps {
  isOpen: boolean
  onClose: () => void
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  fired: 'Fired',
  cancelled: 'Cancelled',
}

function formatFireAt(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const isTomorrow = d.toDateString() === new Date(now.getTime() + 86400000).toDateString()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (isToday) return `Today at ${time}`
  if (isTomorrow) return `Tomorrow at ${time}`
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ` at ${time}`
}

function formatCountdown(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'now'
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function RemindersPanel({ isOpen, onClose }: RemindersPanelProps) {
  const [reminders, setReminders] = useState<ReminderRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'fired' | 'cancelled'>('all')
  const [, setTick] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await window.desktopApi?.listReminders(filter) ?? []
      setReminders(data)
    } catch {
      setError('Could not load reminders. Make sure the MCP server is running.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    if (isOpen) load()
  }, [isOpen, load])

  useEffect(() => {
    if (!isOpen) return
    const interval = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [isOpen])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (isOpen) document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  const handleCancel = async (id: string) => {
    setCancelling(id)
    try {
      await window.desktopApi?.cancelReminder(id)
      setReminders(prev => prev.map(r => r.id === id ? { ...r, status: 'cancelled' } : r))
    } catch {
      setError('Failed to cancel reminder.')
    } finally {
      setCancelling(null)
    }
  }

  const handleCreate = async (input: CreateReminderInput) => {
    const result = await window.desktopApi?.createReminder(input)
    if (result) {
      setReminders(prev => [result, ...prev])
      setShowForm(false)
    }
  }

  const filtered = filter === 'all' ? reminders : reminders.filter(r => r.status === filter)
  const pendingCount = reminders.filter(r => r.status === 'pending').length

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panelRef}
        className="flex h-full w-full max-w-[480px] flex-col bg-[rgb(var(--background))] shadow-2xl border-l border-[rgb(var(--border))] animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-[rgb(var(--border))] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgb(var(--accent))]/15 text-[rgb(var(--accent))]">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">Reminders</h2>
                {pendingCount > 0 && (
                  <Badge className="h-5 min-w-5 rounded-full px-1.5 text-[10px] font-bold bg-[rgb(var(--accent))] text-white">
                    {pendingCount}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-[rgb(var(--muted-foreground))]">Desktop alerts & scheduled emails</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setShowForm(v => !v)}
              className="gap-1.5 text-xs font-bold h-8"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--muted-foreground))] hover:bg-[rgb(var(--muted))]/40 hover:text-[rgb(var(--foreground))] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--muted))]/10 px-6 py-4">
            <CreateReminderForm
              onSubmit={handleCreate}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex flex-shrink-0 gap-1 border-b border-[rgb(var(--border))] px-6 py-2">
          {(['all', 'pending', 'fired', 'cancelled'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition',
                filter === f
                  ? 'bg-[rgb(var(--accent))]/15 text-[rgb(var(--accent))]'
                  : 'text-[rgb(var(--muted-foreground))] hover:bg-[rgb(var(--muted))]/40 hover:text-[rgb(var(--foreground))]',
              )}
            >
              {f === 'all' ? `All (${reminders.length})` : `${STATUS_LABELS[f]} ${f === 'pending' ? `(${pendingCount})` : ''}`}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[rgb(var(--accent))]" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState filter={filter} onNew={() => setShowForm(true)} />
          ) : (
            filtered.map(reminder => (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                cancelling={cancelling === reminder.id}
                onCancel={() => void handleCancel(reminder.id)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-[rgb(var(--border))] px-6 py-3 flex items-center justify-between">
          <span className="text-[11px] text-[rgb(var(--muted-foreground))]">
            Reminders persist across app restarts
          </span>
          <button
            onClick={() => void load()}
            className="text-[11px] text-[rgb(var(--accent))] hover:underline"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  )
}

function ReminderCard({
  reminder,
  cancelling,
  onCancel,
}: {
  reminder: ReminderRecord
  cancelling: boolean
  onCancel: () => void
}) {
  const isPending = reminder.status === 'pending'
  const isFired = reminder.status === 'fired'

  return (
    <div className={cn(
      'group rounded-2xl border p-4 transition-all',
      isPending
        ? 'border-[rgb(var(--accent))]/20 bg-[rgb(var(--accent))]/5 hover:border-[rgb(var(--accent))]/30'
        : isFired
          ? 'border-emerald-500/15 bg-emerald-500/5'
          : 'border-[rgb(var(--border))] bg-[rgb(var(--muted))]/10 opacity-60',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={cn(
            'mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
            isPending ? 'bg-amber-500/20 text-amber-400' : isFired ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[rgb(var(--muted))]/30 text-[rgb(var(--muted-foreground))]',
          )}>
            {isPending ? <Clock className="h-3.5 w-3.5" /> : isFired ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-[rgb(var(--foreground))] truncate">{reminder.title}</span>
              {isPending && reminder.time_remaining && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-400 flex-shrink-0">
                  in {formatCountdown(reminder.fire_at)}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-[rgb(var(--muted-foreground))] line-clamp-2">{reminder.message}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[rgb(var(--muted-foreground))]">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {isPending ? formatFireAt(reminder.fire_at) : formatAgo(reminder.fire_at)}
              </span>
              {reminder.email_to && (
                <span className="flex items-center gap-1 text-[rgb(var(--accent))]">
                  <Mail className="h-3 w-3" />
                  {reminder.email_to}
                </span>
              )}
            </div>
          </div>
        </div>
        {isPending && (
          <button
            onClick={onCancel}
            disabled={cancelling}
            title="Cancel reminder"
            className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-all text-[rgb(var(--muted-foreground))] hover:bg-red-500/10 hover:text-red-400"
          >
            {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </div>
  )
}

function CreateReminderForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: CreateReminderInput) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [fireAt, setFireAt] = useState('')
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [showEmail, setShowEmail] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTimeout(() => titleRef.current?.focus(), 50) }, [])

  const handleSubmit = async () => {
    if (!title.trim() || !fireAt.trim()) { setError('Title and time are required.'); return }
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        title: title.trim(),
        message: message.trim() || title.trim(),
        fire_at: fireAt.trim(),
        email_to: emailTo.trim() || undefined,
        email_subject: emailSubject.trim() || undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create reminder.')
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-[rgb(var(--muted-foreground))] uppercase tracking-wider">New Reminder</p>

      <div className="space-y-2">
        <input
          ref={titleRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Title (e.g. Call the client)"
          className="h-9 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))] outline-none transition focus:border-[rgb(var(--accent))]/60 focus:ring-2 focus:ring-[rgb(var(--accent))]/20"
        />
        <Textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Message / note (optional)"
          className="bg-[rgb(var(--background))] border-[rgb(var(--border))] text-sm resize-none min-h-[60px]"
        />
        <div className="space-y-1">
          <Input
            value={fireAt}
            onChange={e => setFireAt(e.target.value)}
            placeholder="When — e.g. &quot;in 30 minutes&quot;, &quot;tomorrow 9am&quot;, &quot;today 5pm&quot;"
            className="bg-[rgb(var(--background))] border-[rgb(var(--border))] h-9 text-sm"
          />
          <p className="text-[11px] text-[rgb(var(--muted-foreground))] px-0.5">
            Natural language: &quot;in 2 hours&quot; · &quot;tomorrow 9am&quot; · &quot;today at 3:30pm&quot;
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowEmail(v => !v)}
        className="flex items-center gap-1.5 text-xs text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))] transition-colors"
      >
        {showEmail ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        <Mail className="h-3.5 w-3.5" />
        Also send email at this time
      </button>

      {showEmail && (
        <div className="space-y-2 pl-1 border-l-2 border-[rgb(var(--accent))]/30 ml-1">
          <Input
            value={emailTo}
            onChange={e => setEmailTo(e.target.value)}
            placeholder="Send to (email address)"
            type="email"
            className="bg-[rgb(var(--background))] border-[rgb(var(--border))] h-9 text-sm"
          />
          <Input
            value={emailSubject}
            onChange={e => setEmailSubject(e.target.value)}
            placeholder="Email subject"
            className="bg-[rgb(var(--background))] border-[rgb(var(--border))] h-9 text-sm"
          />
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel} className="h-8 text-xs">
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => void handleSubmit()}
          disabled={submitting || !title.trim() || !fireAt.trim()}
          className="h-8 text-xs font-bold gap-1.5"
        >
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
          {submitting ? 'Scheduling…' : 'Schedule'}
        </Button>
      </div>
    </div>
  )
}

function EmptyState({ filter, onNew }: { filter: string; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgb(var(--muted))]/30">
        <Bell className="h-6 w-6 text-[rgb(var(--muted-foreground))]" />
      </div>
      <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
        {filter === 'all' ? 'No reminders yet' : `No ${filter} reminders`}
      </p>
      <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))] max-w-[220px]">
        {filter === 'all'
          ? 'Schedule alerts or timed emails. You can also ask the AI "remind me at 5pm to…"'
          : 'Nothing here yet.'}
      </p>
      {filter === 'all' && (
        <button
          onClick={onNew}
          className="mt-4 flex items-center gap-1.5 rounded-xl bg-[rgb(var(--accent))]/10 px-4 py-2 text-xs font-semibold text-[rgb(var(--accent))] hover:bg-[rgb(var(--accent))]/20 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> New reminder
        </button>
      )}
    </div>
  )
}
