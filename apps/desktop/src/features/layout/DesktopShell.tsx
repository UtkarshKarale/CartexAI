import { LogOut, Lock, MessageSquarePlus, Settings2, ChevronLeft, ChevronRight, BrainCircuit, Sun, Moon, Download, AlertCircle, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { AppSettings, ConversationSummary, GemmaModelInfo, MessageRecord, ModelSetupChunk, ThemeMode, UserProfile } from '../../shared/contracts'
import { cn } from '../../lib/utils'
import { ChatPanel } from '../chat/ChatPanel'
import { SettingsPanel } from '../settings/SettingsPanel'

interface DesktopShellProps {
  user: UserProfile | null
  sessionActive: boolean
  conversations: ConversationSummary[]
  selectedConversationId: string | null
  messages: MessageRecord[]
  settings: AppSettings
  theme: ThemeMode
  modelSetup: ModelSetupChunk | null
  gemmaModels: GemmaModelInfo[]
  onRefreshModels: () => void
  onSelectConversation: (id: string) => void
  onCreateConversation: () => void
  onSendMessage: (content: string) => void
  onClearConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
  onUpdateTheme: (theme: ThemeMode) => void
  onUpdateSettings: (updates: Partial<AppSettings>) => Promise<void>
  onLock: () => void
  onLogout: () => void
}

export function DesktopShell({
  user,
  conversations,
  selectedConversationId,
  messages,
  settings,
  theme,
  modelSetup,
  gemmaModels,
  onRefreshModels,
  onSelectConversation,
  onCreateConversation,
  onSendMessage,
  onClearConversation,
  onDeleteConversation,
  onUpdateTheme,
  onUpdateSettings,
  onLock,
  onLogout,
}: DesktopShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const currentConversation = conversations.find((c) => c.id === selectedConversationId) ?? null

  return (
    <div className="flex h-screen overflow-hidden bg-[rgb(var(--background))] text-[rgb(var(--foreground))]">
      <aside
        className={cn(
          'flex flex-shrink-0 flex-col bg-[rgb(var(--sidebar))] border-r border-[rgb(var(--border))] transition-all duration-200',
          collapsed ? 'w-[60px]' : 'w-[260px]',
        )}
      >
        <div className="flex items-center gap-2.5 px-3 py-4 border-b border-[rgb(var(--border))]">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--accent))]/15 text-[rgb(var(--accent))]">
            <BrainCircuit className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-tight">xfile.ai</div>
              <div className="text-[11px] text-[rgb(var(--muted-foreground))] leading-tight mt-0.5">Local AI assistant</div>
            </div>
          )}
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="ml-auto flex-shrink-0 rounded-lg p-1 text-[rgb(var(--muted-foreground))] hover:bg-[rgb(var(--muted))]/40 hover:text-[rgb(var(--foreground))] transition"
            aria-label="Toggle sidebar"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <div className="p-2 border-b border-[rgb(var(--border))]">
          <button
            onClick={onCreateConversation}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition',
              'bg-[rgb(var(--accent))]/10 text-[rgb(var(--accent))] hover:bg-[rgb(var(--accent))]/20',
              collapsed && 'justify-center px-2',
            )}
          >
            <MessageSquarePlus className="h-4 w-4 flex-shrink-0" />
            {!collapsed && 'New chat'}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {!collapsed && conversations.length === 0 && (
            <div className="px-2 py-6 text-center text-xs text-[rgb(var(--muted-foreground))]">
              No conversations yet
            </div>
          )}
          <div className="space-y-0.5">
            {conversations.map((conv) => {
              const active = conv.id === selectedConversationId
              return (
                <div key={conv.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conv.id)}
                    title={collapsed ? conv.title : undefined}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition',
                      active
                        ? 'bg-[rgb(var(--accent))]/15 text-[rgb(var(--foreground))]'
                        : 'text-[rgb(var(--muted-foreground))] hover:bg-[rgb(var(--muted))]/40 hover:text-[rgb(var(--foreground))]',
                      collapsed && 'justify-center px-2',
                    )}
                  >
                    <MessageSquarePlus className={cn('h-4 w-4 flex-shrink-0', active && 'text-[rgb(var(--accent))]')} />
                    {!collapsed && (
                      <div className="min-w-0 flex-1 pr-6">
                        <div className="line-clamp-1 text-sm font-medium">{conv.title}</div>
                        {conv.preview && (
                          <div className="line-clamp-1 text-[11px] text-[rgb(var(--muted-foreground))] mt-0.5">
                            {conv.preview}
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                  {!collapsed && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteConversation(conv.id)
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[rgb(var(--muted-foreground))] hover:text-red-400 hover:bg-red-500/10 transition-all"
                      title="Delete conversation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="border-t border-[rgb(var(--border))] p-2 space-y-0.5">
          <SidebarAction
            icon={<Settings2 className="h-4 w-4" />}
            label="Settings"
            collapsed={collapsed}
            active={showSettings}
            onClick={() => setShowSettings((v) => !v)}
          />
          <SidebarAction
            icon={theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            collapsed={collapsed}
            onClick={() => onUpdateTheme(theme === 'dark' ? 'light' : 'dark')}
          />
          <SidebarAction
            icon={<Lock className="h-4 w-4" />}
            label="Lock"
            collapsed={collapsed}
            onClick={onLock}
          />
          <SidebarAction
            icon={<LogOut className="h-4 w-4" />}
            label={user?.displayName ? `Sign out (${user.displayName})` : 'Sign out'}
            collapsed={collapsed}
            onClick={onLogout}
          />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {modelSetup && <ModelSetupBanner chunk={modelSetup} model={settings.defaultModel} />}
        <ChatPanel
          conversation={currentConversation}
          messages={messages}
          onSendMessage={onSendMessage}
          onClearConversation={onClearConversation}
        />
      </main>

      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        gemmaModels={gemmaModels}
        onUpdateTheme={onUpdateTheme}
        onUpdateSettings={onUpdateSettings}
        onRefreshModels={onRefreshModels}
      />
    </div>
  )
}

function ModelSetupBanner({ chunk, model }: { chunk: ModelSetupChunk; model: string }) {
  const isError = Boolean(chunk.error)

  return (
    <div className={cn(
      'flex flex-shrink-0 items-center gap-3 border-b px-4 py-3 text-sm',
      isError
        ? 'border-red-400/20 bg-red-500/10 text-red-400'
        : 'border-[rgb(var(--accent))]/20 bg-[rgb(var(--accent))]/8 text-[rgb(var(--foreground))]',
    )}>
      {isError ? (
        <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-400" />
      ) : (
        <Download className="h-4 w-4 flex-shrink-0 animate-bounce text-[rgb(var(--accent))]" />
      )}

      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {isError ? 'Model setup failed' : `Setting up ${model}`}
        </div>
        <div className={cn('mt-0.5 text-xs', isError ? 'text-red-400/80' : 'text-[rgb(var(--muted-foreground))]')}>
          {chunk.status}
        </div>
        {!isError && chunk.percent > 0 && (
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[rgb(var(--muted))]/40">
            <div
              className="h-full rounded-full bg-[rgb(var(--accent))] transition-all duration-300"
              style={{ width: `${chunk.percent}%` }}
            />
          </div>
        )}
      </div>

      {!isError && chunk.percent > 0 && (
        <span className="flex-shrink-0 text-xs font-medium text-[rgb(var(--accent))]">{chunk.percent}%</span>
      )}
    </div>
  )
}

function SidebarAction({
  icon,
  label,
  collapsed,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  collapsed: boolean
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition',
        active
          ? 'bg-[rgb(var(--muted))]/60 text-[rgb(var(--foreground))]'
          : 'text-[rgb(var(--muted-foreground))] hover:bg-[rgb(var(--muted))]/40 hover:text-[rgb(var(--foreground))]',
        collapsed && 'justify-center px-2',
      )}
    >
      <span className="flex-shrink-0">{icon}</span>
      {!collapsed && <span className="line-clamp-1">{label}</span>}
    </button>
  )
}
