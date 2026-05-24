import { Activity, BrainCircuit, Database, FolderOpen, MessageSquareText, Settings2, Workflow } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Separator } from '../../components/ui/separator'
import type { ConversationSummary, WorkspaceSection } from '../../shared/contracts'
import { cn, formatDateTime } from '../../lib/utils'

interface SidebarProps {
  conversations: ConversationSummary[]
  selectedConversationId: string | null
  currentSection: WorkspaceSection
  onSelectConversation: (id: string) => void
  onSelectSection: (section: WorkspaceSection) => void
  onCreateConversation: () => void
  collapsed: boolean
  onToggleCollapse: () => void
}

const sections: Array<{ id: WorkspaceSection; label: string; icon: typeof MessageSquareText }> = [
  { id: 'chat', label: 'Chat', icon: MessageSquareText },
  { id: 'history', label: 'History', icon: Database },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'workflows', label: 'Workflows', icon: Workflow },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'settings', label: 'Settings', icon: Settings2 },
]

export function Sidebar({
  conversations,
  selectedConversationId,
  currentSection,
  onSelectConversation,
  onSelectSection,
  onCreateConversation,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-white/10 bg-slate-950/60 backdrop-blur-xl',
        collapsed ? 'w-[76px]' : 'w-[320px]',
      )}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-400/20">
            <BrainCircuit className="h-5 w-5" />
          </div>
          {!collapsed ? (
            <div>
              <div className="text-sm font-semibold text-white">Aster OS</div>
              <div className="text-xs text-slate-400">AI-native desktop shell</div>
            </div>
          ) : null}
        </div>
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} aria-label="Toggle sidebar">
          {collapsed ? '›' : '‹'}
        </Button>
      </div>

      <div className={cn('px-4', collapsed && 'px-2')}>
        <Button className="w-full justify-start" onClick={onCreateConversation}>
          <MessageSquareText className="h-4 w-4" />
          {!collapsed ? 'New conversation' : null}
        </Button>
      </div>

      <div className="mt-4 px-3">
        <div className={cn('grid gap-2', collapsed ? 'justify-items-center' : '')}>
          {sections.map((section) => {
            const Icon = section.icon
            const active = currentSection === section.id
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onSelectSection(section.id)}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition',
                  active ? 'bg-white/10 text-white ring-1 ring-white/10' : 'text-slate-400 hover:bg-white/6 hover:text-white',
                  collapsed && 'w-12 justify-center px-0',
                )}
              >
                <Icon className="h-4 w-4" />
                {!collapsed ? <span className="text-sm font-medium">{section.label}</span> : null}
              </button>
            )
          })}
        </div>
      </div>

      {!collapsed ? (
        <>
          <div className="px-4 py-5">
            <Separator />
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Recent chats</h3>
              <Badge variant="muted">{conversations.length}</Badge>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => onSelectConversation(conversation.id)}
                  className={cn(
                    'w-full rounded-2xl border p-3 text-left transition',
                    selectedConversationId === conversation.id
                      ? 'border-cyan-400/25 bg-cyan-400/10'
                      : 'border-white/8 bg-white/5 hover:bg-white/8',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-white">{conversation.title}</div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{conversation.preview}</div>
                    </div>
                    {conversation.pinned ? <Badge variant="default">Pinned</Badge> : null}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    <span>{conversation.messageCount} messages</span>
                    <span>{formatDateTime(conversation.updatedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </aside>
  )
}

