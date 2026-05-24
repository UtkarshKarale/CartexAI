import { Command, CommandItem, CommandList } from '../../components/ui/command'
import type { ConversationSummary, ThemeMode, WorkspaceSection } from '../../shared/contracts'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  query: string
  onQueryChange: (value: string) => void
  conversations: ConversationSummary[]
  currentSection: WorkspaceSection
  onSelectConversation: (id: string) => void
  onSelectSection: (section: WorkspaceSection) => void
  onCreateConversation: () => void
  onUpdateTheme: (theme: ThemeMode) => void
}

export function CommandPalette({
  open,
  onOpenChange,
  query,
  onQueryChange,
  conversations,
  currentSection,
  onSelectConversation,
  onSelectSection,
  onCreateConversation,
  onUpdateTheme,
}: CommandPaletteProps) {
  const lowerQuery = query.trim().toLowerCase()
  const actions = [
    {
      title: 'Open chat',
      description: 'Jump to the assistant canvas',
      run: () => onSelectSection('chat'),
    },
    {
      title: 'View activity',
      description: 'Inspect runtime activity',
      run: () => onSelectSection('activity'),
    },
    {
      title: 'Open settings',
      description: 'Adjust theme and security preferences',
      run: () => onSelectSection('settings'),
    },
    {
      title: 'Create conversation',
      description: 'Start a fresh local chat thread',
      run: onCreateConversation,
    },
    {
      title: 'Switch to light theme',
      description: 'Make the interface brighter',
      run: () => onUpdateTheme('light'),
    },
    {
      title: 'Switch to dark theme',
      description: 'Return to the default dark shell',
      run: () => onUpdateTheme('dark'),
    },
    ...conversations.map((conversation) => ({
      title: conversation.title,
      description: conversation.preview,
      run: () => onSelectConversation(conversation.id),
    })),
  ].filter((item) => {
    if (!lowerQuery) {
      return true
    }

    return `${item.title} ${item.description ?? ''}`.toLowerCase().includes(lowerQuery)
  })

  return (
    <Command
      open={open}
      onOpenChange={onOpenChange}
      query={query}
      onQueryChange={onQueryChange}
    >
      <CommandList>
        {actions.map((action) => (
          <CommandItem
            key={`${action.title}-${currentSection}`}
            title={action.title}
            description={action.description}
            onSelect={() => {
              action.run()
              onOpenChange(false)
              onQueryChange('')
            }}
          />
        ))}
      </CommandList>
    </Command>
  )
}
