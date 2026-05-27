import {
  Send, Loader2, Wrench, CheckCircle, XCircle, AlertTriangle,
  Bot, User, Trash2, Copy, Share2, ThumbsUp, ThumbsDown,
  Folder, File, ChevronRight, Home, Zap, ExternalLink,
} from 'lucide-react'
import { useEffect, useRef, useState, useCallback } from 'react'
import type { ConversationSummary, FileEntry, MessageRecord, StreamChunk, TokenUsage } from '../../shared/contracts'
import { cn, formatDateTime } from '../../lib/utils'

interface ChatPanelProps {
  conversation: ConversationSummary | null
  messages: MessageRecord[]
  onSendMessage: (content: string) => void
  onClearConversation: (id: string) => void
}

interface PendingConfirm {
  id: string
  toolName: string
  toolArgs: Record<string, unknown>
}

interface FilePicker {
  cwd: string
  entries: FileEntry[]
  filter: string
  anchorPos: number
}

export function ChatPanel({ conversation, messages, onSendMessage, onClearConversation }: ChatPanelProps) {
  const [draft, setDraft] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [toolActivity, setToolActivity] = useState<string | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)
  const [filePicker, setFilePicker] = useState<FilePicker | null>(null)
  const [reactions, setReactions] = useState<Record<string, 'like' | 'dislike' | null>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [lastUsage, setLastUsage] = useState<TokenUsage | null>(null)
  const [sessionUsage, setSessionUsage] = useState<TokenUsage>({ inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 })
  const [toolSearch, setToolSearch] = useState<{ regex: string; matched: number; label: string } | null>(null)
  const pendingUsageRef = useRef<TokenUsage | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const filePickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!window.desktopApi) return
    const handleChunk = (chunk: StreamChunk) => {
      if (chunk.type === 'text' && chunk.text) {
        setStreamingText((prev) => prev + chunk.text)
      } else if (chunk.type === 'tool_call' && chunk.toolName) {
        setToolActivity(chunk.toolName)
      } else if (chunk.type === 'tool_result') {
        setToolActivity(null)
      } else if (chunk.type === 'confirm' && chunk.confirmId && chunk.toolName) {
        setPendingConfirm({ id: chunk.confirmId, toolName: chunk.toolName, toolArgs: chunk.toolArgs ?? {} })
      } else if (chunk.type === 'usage' && chunk.usage) {
        pendingUsageRef.current = chunk.usage
      } else if (chunk.type === 'tool_search' && chunk.toolRegex) {
        setToolSearch({ regex: chunk.toolRegex, matched: chunk.toolsMatched ?? 0, label: chunk.text ?? 'all' })
      } else if (chunk.type === 'done' || chunk.type === 'error') {
        setIsStreaming(false)
        setStreamingText('')
        setToolActivity(null)
        setToolSearch(null)
        if (pendingUsageRef.current) {
          const u = pendingUsageRef.current
          setLastUsage(u)
          setSessionUsage((prev) => ({
            inputTokens: prev.inputTokens + u.inputTokens,
            outputTokens: prev.outputTokens + u.outputTokens,
            cacheCreationTokens: prev.cacheCreationTokens + u.cacheCreationTokens,
            cacheReadTokens: prev.cacheReadTokens + u.cacheReadTokens,
          }))
          pendingUsageRef.current = null
        }
      }
    }
    window.desktopApi.onStreamChunk(handleChunk)
    return () => window.desktopApi.offStreamChunk()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText, toolActivity, pendingConfirm])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filePickerRef.current && !filePickerRef.current.contains(e.target as Node)) {
        setFilePicker(null)
      }
    }
    if (filePicker) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [filePicker])

  const handleSend = () => {
    const text = draft.trim()
    if (!text || isStreaming) return
    setIsStreaming(true)
    setStreamingText('')
    onSendMessage(text)
    setDraft('')
    setFilePicker(null)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const handleConfirm = async (approved: boolean) => {
    if (!pendingConfirm) return
    const { id } = pendingConfirm
    setPendingConfirm(null)
    await window.desktopApi.confirmToolExecution(id, approved)
  }

  const handleDraftChange = useCallback(async (value: string) => {
    setDraft(value)

    const atIdx = value.lastIndexOf('@')
    if (atIdx === -1) {
      setFilePicker(null)
      return
    }

    const afterAt = value.slice(atIdx + 1)
    const hasSpace = afterAt.includes(' ')
    if (hasSpace) {
      setFilePicker(null)
      return
    }

    const isPath = afterAt.startsWith('/') || afterAt.startsWith('~')
    let dirPath = ''
    let filter = ''

    if (isPath) {
      const lastSlash = afterAt.lastIndexOf('/')
      if (lastSlash >= 0) {
        dirPath = afterAt.slice(0, lastSlash + 1).replace(/^~/, '')
        filter = afterAt.slice(lastSlash + 1)
      } else {
        dirPath = afterAt
        filter = ''
      }
    } else {
      filter = afterAt
    }

    try {
      const result = await window.desktopApi.listDirectory(dirPath)
      setFilePicker({ cwd: result.cwd, entries: result.entries, filter, anchorPos: atIdx })
    } catch {
      setFilePicker(null)
    }
  }, [])

  const selectFile = (entry: FileEntry) => {
    if (!filePicker) return
    if (entry.isDirectory) {
      window.desktopApi.listDirectory(entry.path).then((result) => {
        setFilePicker({ cwd: result.cwd, entries: result.entries, filter: '', anchorPos: filePicker.anchorPos })
        const before = draft.slice(0, filePicker.anchorPos + 1)
        setDraft(before + entry.path + '/')
      }).catch(() => {})
      return
    }
    const before = draft.slice(0, filePicker.anchorPos + 1)
    const after = draft.slice(filePicker.anchorPos + 1 + filePicker.filter.length)
    const afterAtContent = draft.slice(filePicker.anchorPos + 1)
    const slashIdx = afterAtContent.lastIndexOf('/')
    const base = slashIdx >= 0 ? afterAtContent.slice(0, slashIdx + 1) : ''
    const newDraft = before.slice(0, filePicker.anchorPos) + `@${base}${entry.name} ` + after
    setDraft(newDraft)
    setFilePicker(null)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const navigateUp = () => {
    if (!filePicker) return
    const parent = filePicker.cwd.split('/').slice(0, -1).join('/') || '/'
    window.desktopApi.listDirectory(parent).then((result) => {
      setFilePicker({ cwd: result.cwd, entries: result.entries, filter: '', anchorPos: filePicker.anchorPos })
    }).catch(() => {})
  }

  const copyMessage = (id: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(id)
      setTimeout(() => setCopied(null), 1500)
    }).catch(() => {})
  }

  const shareMessage = (content: string) => {
    if (navigator.share) {
      navigator.share({ text: content }).catch(() => {})
    } else {
      navigator.clipboard.writeText(content).catch(() => {})
    }
  }

  const toggleReaction = (id: string, reaction: 'like' | 'dislike') => {
    setReactions((prev) => ({ ...prev, [id]: prev[id] === reaction ? null : reaction }))
  }

  const filteredEntries = filePicker
    ? filePicker.entries.filter((e) =>
        !filePicker.filter || e.name.toLowerCase().startsWith(filePicker.filter.toLowerCase()),
      ).slice(0, 12)
    : []

  const isEmpty = messages.length === 0 && !isStreaming

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[rgb(var(--background))]">
      <div className="border-b border-[rgb(var(--border))] px-6 py-3 flex-shrink-0 flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{conversation?.title ?? 'No conversation selected'}</div>
          {conversation?.preview && (
            <div className="mt-0.5 text-xs text-[rgb(var(--muted-foreground))] line-clamp-1">{conversation.preview}</div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {sessionUsage.inputTokens > 0 && (
            <TokenBadge lastUsage={lastUsage} sessionUsage={sessionUsage} />
          )}
          {conversation && messages.length > 0 && (
            <button
              onClick={() => onClearConversation(conversation.id)}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-[rgb(var(--muted-foreground))] hover:bg-red-500/10 hover:text-red-400 transition"
              title="Clear all messages in this conversation"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear chat</span>
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        {isEmpty ? (
          <EmptyState />
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                reaction={reactions[message.id] ?? null}
                copied={copied === message.id}
                onCopy={() => copyMessage(message.id, message.content)}
                onShare={() => shareMessage(message.content)}
                onLike={() => toggleReaction(message.id, 'like')}
                onDislike={() => toggleReaction(message.id, 'dislike')}
              />
            ))}

            {isStreaming && streamingText && <StreamingBubble text={streamingText} />}

            {toolSearch && (
              <div className="flex items-center gap-2 text-xs text-[rgb(var(--muted-foreground))] mb-1">
                <Zap className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                <span>
                  Tool search{' '}
                  <code className="px-1 py-0.5 rounded bg-[rgb(var(--surface-2))] text-[rgb(var(--foreground))] font-mono text-[10px]">
                    {toolSearch.regex}
                  </code>{' '}
                  — <strong className="text-[rgb(var(--foreground))]">{toolSearch.matched} tools</strong> matched
                </span>
              </div>
            )}

            {toolActivity && (
              <div className="flex items-center gap-2 text-xs text-[rgb(var(--muted-foreground))]">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[rgb(var(--accent))]" />
                <Wrench className="h-3.5 w-3.5 text-[rgb(var(--accent))]" />
                <span>Using <strong className="font-medium text-[rgb(var(--foreground))]">{toolActivity}</strong>…</span>
              </div>
            )}

            {isStreaming && !streamingText && !toolActivity && !pendingConfirm && <ThinkingBubble />}

            {pendingConfirm && (
              <ConfirmCard
                toolName={pendingConfirm.toolName}
                toolArgs={pendingConfirm.toolArgs}
                onApprove={() => void handleConfirm(true)}
                onDeny={() => void handleConfirm(false)}
              />
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="flex-shrink-0 border-t border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-4">
        <div className="mx-auto max-w-3xl relative">
          {filePicker && (
            <div
              ref={filePickerRef}
              className="absolute bottom-full mb-2 left-0 right-0 max-h-72 overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))] shadow-2xl z-20"
            >
              <div className="flex items-center gap-2 px-3 py-2 border-b border-[rgb(var(--border))] bg-[rgb(var(--sidebar))]">
                <button
                  onClick={navigateUp}
                  className="flex items-center justify-center h-6 w-6 rounded-md hover:bg-[rgb(var(--muted))]/40 text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))] transition-colors"
                  title="Go up"
                >
                  <Home className="h-3.5 w-3.5" />
                </button>
                <ChevronRight className="h-3 w-3 text-[rgb(var(--muted-foreground))]/40" />
                <span className="text-[11px] font-mono text-[rgb(var(--muted-foreground))] truncate flex-1">{filePicker.cwd}</span>
              </div>
              <div className="overflow-y-auto max-h-56">
                {filteredEntries.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-[rgb(var(--muted-foreground))]">No matches</div>
                ) : (
                  filteredEntries.map((entry) => (
                    <button
                      key={entry.path}
                      onClick={() => selectFile(entry)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-[rgb(var(--muted))]/30 transition-colors text-left"
                    >
                      {entry.isDirectory ? (
                        <Folder className="h-4 w-4 flex-shrink-0 text-[rgb(var(--accent))]" />
                      ) : (
                        <File className="h-4 w-4 flex-shrink-0 text-[rgb(var(--muted-foreground))]" />
                      )}
                      <span className={cn('truncate text-[rgb(var(--foreground))]', entry.isDirectory && 'font-medium')}>
                        {entry.name}
                      </span>
                      {entry.isDirectory && <ChevronRight className="h-3.5 w-3.5 ml-auto text-[rgb(var(--muted-foreground))]/50" />}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="flex items-end gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-4 py-3 focus-within:border-[rgb(var(--accent))]/50 transition">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && filePicker) {
                  e.preventDefault()
                  setFilePicker(null)
                  return
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Message xfile.ai… (type @ to reference a file)"
              disabled={isStreaming}
              rows={1}
              className="min-h-[24px] max-h-[160px] w-full resize-none bg-transparent text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))] focus:outline-none disabled:opacity-50"
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
            <button
              onClick={handleSend}
              disabled={isStreaming || !draft.trim()}
              className={cn(
                'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl transition',
                isStreaming || !draft.trim()
                  ? 'bg-[rgb(var(--muted))]/40 text-[rgb(var(--muted-foreground))] cursor-not-allowed'
                  : 'bg-[rgb(var(--accent))] text-white hover:opacity-90',
              )}
              aria-label="Send"
            >
              {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="mt-2 text-center text-[11px] text-[rgb(var(--muted-foreground))]">
            {isStreaming ? 'xfile.ai is thinking…' : 'Enter ↵ send · Shift+Enter new line · @ to reference file'}
          </div>
        </div>
      </div>
    </div>
  )
}

interface BubbleActionProps {
  message: MessageRecord
  reaction: 'like' | 'dislike' | null
  copied: boolean
  onCopy: () => void
  onShare: () => void
  onLike: () => void
  onDislike: () => void
}

function MessageBubble({ message, reaction, copied, onCopy, onShare, onLike, onDislike }: BubbleActionProps) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'

  return (
    <div className={cn('group flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn(
        'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-white',
        isUser ? 'bg-[rgb(var(--accent))]' : 'bg-[rgb(var(--muted))]',
      )}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4 text-[rgb(var(--accent))]" />}
      </div>
      <div className={cn('flex max-w-[80%] flex-col gap-1', isUser && 'items-end')}>
        <div className={cn(
          'rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-[rgb(var(--accent))] text-white rounded-tr-sm'
            : 'bg-[rgb(var(--panel))] text-[rgb(var(--foreground))] rounded-tl-sm border border-[rgb(var(--border))]',
        )}>
          {isUser
            ? <p className="whitespace-pre-wrap">{message.content}</p>
            : <ContentWithPaths text={message.content} />}
        </div>
        <div className={cn('flex items-center gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
          <span className="px-1 text-[10px] text-[rgb(var(--muted-foreground))]">
            {formatDateTime(message.createdAt)}
          </span>
          {isAssistant && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <BubbleAction
                onClick={onCopy}
                title="Copy"
                active={copied}
                activeClass="text-emerald-500"
              >
                <Copy className="h-3.5 w-3.5" />
              </BubbleAction>
              <BubbleAction onClick={onShare} title="Share">
                <Share2 className="h-3.5 w-3.5" />
              </BubbleAction>
              <BubbleAction
                onClick={onLike}
                title="Like"
                active={reaction === 'like'}
                activeClass="text-emerald-500"
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </BubbleAction>
              <BubbleAction
                onClick={onDislike}
                title="Dislike"
                active={reaction === 'dislike'}
                activeClass="text-red-400"
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </BubbleAction>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function BubbleAction({ children, onClick, title, active, activeClass }: {
  children: React.ReactNode; onClick: () => void; title: string; active?: boolean; activeClass?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'flex items-center justify-center h-6 w-6 rounded-md transition-colors',
        active
          ? cn(activeClass ?? 'text-[rgb(var(--accent))]', 'bg-[rgb(var(--muted))]/30')
          : 'text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))] hover:bg-[rgb(var(--muted))]/30',
      )}
    >
      {children}
    </button>
  )
}

function StreamingBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[rgb(var(--muted))]">
        <Bot className="h-4 w-4 text-[rgb(var(--accent))]" />
      </div>
      <div className="flex max-w-[80%] flex-col gap-1">
        <div className="rounded-2xl rounded-tl-sm border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-4 py-3 text-sm leading-relaxed text-[rgb(var(--foreground))]">
          <p className="whitespace-pre-wrap">
            {text}
            <span className="ml-0.5 inline-block h-[14px] w-[2px] animate-pulse bg-[rgb(var(--accent))] align-middle" />
          </p>
        </div>
      </div>
    </div>
  )
}

function ThinkingBubble() {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[rgb(var(--muted))]">
        <Bot className="h-4 w-4 text-[rgb(var(--accent))]" />
      </div>
      <div className="rounded-2xl rounded-tl-sm border border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-[rgb(var(--muted-foreground))]">
          <Loader2 className="h-4 w-4 animate-spin text-[rgb(var(--accent))]" />
          Thinking…
        </div>
      </div>
    </div>
  )
}

function ConfirmCard({
  toolName, toolArgs, onApprove, onDeny,
}: {
  toolName: string; toolArgs: Record<string, unknown>; onApprove: () => void; onDeny: () => void
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/20">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
      </div>
      <div className="flex-1 rounded-2xl rounded-tl-sm border border-amber-400/30 bg-amber-500/10 px-4 py-3">
        <p className="mb-1 text-sm font-medium text-[rgb(var(--foreground))]">
          Allow <code className="rounded bg-[rgb(var(--muted))]/40 px-1 font-mono text-[13px]">{toolName}</code>?
        </p>
        {Object.keys(toolArgs).length > 0 && (
          <pre className="mt-2 mb-3 overflow-x-auto rounded-lg bg-black/20 p-2 text-xs text-[rgb(var(--muted-foreground))]">
            {JSON.stringify(toolArgs, null, 2)}
          </pre>
        )}
        <div className="flex gap-2">
          <button
            onClick={onApprove}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/30 transition"
          >
            <CheckCircle className="h-3.5 w-3.5" /> Allow
          </button>
          <button
            onClick={onDeny}
            className="flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/30 transition"
          >
            <XCircle className="h-3.5 w-3.5" /> Deny
          </button>
        </div>
      </div>
    </div>
  )
}

function TokenBadge({ lastUsage, sessionUsage }: { lastUsage: TokenUsage | null; sessionUsage: TokenUsage }) {
  const [showDetail, setShowDetail] = useState(false)
  const total = sessionUsage.inputTokens + sessionUsage.outputTokens
  const saved = sessionUsage.cacheReadTokens

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetail((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-mono transition-colors',
          showDetail
            ? 'bg-[rgb(var(--accent))]/10 text-[rgb(var(--accent))]'
            : 'text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))] hover:bg-[rgb(var(--muted))]/30',
        )}
        title="Token usage"
      >
        <Zap className="h-3 w-3" />
        <span>{fmtK(total)}</span>
        {saved > 0 && <span className="text-emerald-500">⚡{fmtK(saved)}</span>}
      </button>

      {showDetail && (
        <div className="absolute right-0 top-full mt-1 z-30 w-64 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))] shadow-xl p-3 space-y-3">
          {lastUsage && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--muted-foreground))]">Last Response</div>
              <UsageRow label="Input" value={lastUsage.inputTokens} color="text-blue-400" />
              <UsageRow label="Output" value={lastUsage.outputTokens} color="text-purple-400" />
              {lastUsage.cacheReadTokens > 0 && <UsageRow label="Cache hit" value={lastUsage.cacheReadTokens} color="text-emerald-400" note="saved" />}
              {lastUsage.cacheCreationTokens > 0 && <UsageRow label="Cache write" value={lastUsage.cacheCreationTokens} color="text-amber-400" />}
            </div>
          )}
          <div className="space-y-1.5 border-t border-[rgb(var(--border))] pt-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--muted-foreground))]">Session Total</div>
            <UsageRow label="Input" value={sessionUsage.inputTokens} color="text-blue-400" />
            <UsageRow label="Output" value={sessionUsage.outputTokens} color="text-purple-400" />
            {sessionUsage.cacheReadTokens > 0 && <UsageRow label="Cached" value={sessionUsage.cacheReadTokens} color="text-emerald-400" note="~90% cheaper" />}
            {sessionUsage.cacheCreationTokens > 0 && <UsageRow label="Cache writes" value={sessionUsage.cacheCreationTokens} color="text-amber-400" />}
            <div className="flex justify-between pt-1 border-t border-[rgb(var(--border))] text-[10px]">
              <span className="text-[rgb(var(--muted-foreground))]">Total billed</span>
              <span className="font-bold text-[rgb(var(--foreground))] font-mono">{(sessionUsage.inputTokens + sessionUsage.outputTokens).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UsageRow({ label, value, color, note }: { label: string; value: number; color: string; note?: string }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-[rgb(var(--muted-foreground))]">{label}{note && <span className="ml-1 text-[9px] opacity-60">{note}</span>}</span>
      <span className={cn('font-mono font-semibold', color)}>{value.toLocaleString()}</span>
    </div>
  )
}

function fmtK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

const PATH_RE = /((?:\/|~\/)[^\s,;:'"<>(){}\[\]`\\]+)/g

function parseContent(text: string): Array<{ type: 'text' | 'path'; value: string }> {
  const parts: Array<{ type: 'text' | 'path'; value: string }> = []
  let last = 0
  let match: RegExpExecArray | null
  PATH_RE.lastIndex = 0
  while ((match = PATH_RE.exec(text)) !== null) {
    const raw = match[0].replace(/[.,;:!?]+$/, '')
    if (raw.length < 4) continue
    if (match.index > last) parts.push({ type: 'text', value: text.slice(last, match.index) })
    parts.push({ type: 'path', value: raw })
    last = match.index + raw.length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts
}

function PathChip({ path }: { path: string }) {
  const [opening, setOpening] = useState(false)
  const isDir = !path.split('/').pop()?.includes('.')
  const open = async () => {
    if (!window.desktopApi?.openTarget) return
    setOpening(true)
    try { await window.desktopApi.openTarget(path) } finally { setOpening(false) }
  }
  return (
    <span className="inline-flex items-center gap-1 mx-0.5 align-baseline">
      <code className="text-xs font-mono text-[rgb(var(--accent))] bg-[rgb(var(--accent))]/10 px-1.5 py-0.5 rounded break-all">
        {path}
      </code>
      <button
        onClick={open}
        disabled={opening}
        className="inline-flex items-center gap-1 shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgb(var(--muted))]/40 hover:bg-[rgb(var(--accent))]/20 text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--accent))] transition-colors disabled:opacity-50"
        title={`Open ${path}`}
      >
        {opening
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : isDir
            ? <Folder className="h-3 w-3" />
            : <ExternalLink className="h-3 w-3" />}
        Open
      </button>
    </span>
  )
}

function ContentWithPaths({ text }: { text: string }) {
  const parts = parseContent(text)
  return (
    <p className="whitespace-pre-wrap">
      {parts.map((part, i) =>
        part.type === 'path' ? <PathChip key={i} path={part.value} /> : part.value
      )}
    </p>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgb(var(--accent))]/15">
          <Bot className="h-7 w-7 text-[rgb(var(--accent))]" />
        </div>
        <h3 className="text-base font-semibold">How can I help?</h3>
        <p className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">
          Ask me to search files, check system info, run commands, or organize your workspace. Type <code className="bg-[rgb(var(--muted))]/40 px-1 rounded text-xs">@</code> to reference a file or folder.
        </p>
      </div>
    </div>
  )
}
