import type { AiToolSchema } from './providers/base'

const CORE_TOOLS = new Set([
  'list_files',
  'search_files',
  'read_file',
  'recent_files',
])

const INTENT_MAP: Array<{ pattern: RegExp; tools: string[] }> = [
  { pattern: /\b(email|send|mail|smtp|inbox|attachment)\b/i,         tools: ['send_email_smtp'] },
  { pattern: /\b(delete|remove|trash|unlink)\b/i,                    tools: ['delete_file', 'trash_manager'] },
  { pattern: /\b(move|copy|rename|transfer)\b/i,                     tools: ['move_file', 'copy_file', 'rename_file'] },
  { pattern: /\b(write|create|mkdir|new file|new folder|touch)\b/i,  tools: ['write_file', 'create_folder'] },
  { pattern: /\b(terminal|command|run|execute|shell|bash|cmd)\b/i,   tools: ['execute_command', 'terminal_session'] },
  { pattern: /\b(screenshot|capture|screen grab|screen shot)\b/i,   tools: ['take_screenshot'] },
  { pattern: /\b(zip|compress|extract|unzip|archive|tar)\b/i,        tools: ['compress_file', 'extract_zip'] },
  { pattern: /\b(organize|sort|clean\s*up|arrange|restructure)\b/i,  tools: ['organize_downloads', 'duplicate_detector', 'largest_files'] },
  { pattern: /\b(backup|drive|cloud|google drive|upload)\b/i,        tools: ['backup_to_drive'] },
  { pattern: /\b(clipboard|paste|copy to clip)\b/i,                  tools: ['clipboard_manager'] },
  { pattern: /\b(open|launch|start app)\b/i,                         tools: ['open_application'] },
  { pattern: /\b(ocr|text from image|extract text|read image)\b/i,   tools: ['ocr_image'] },
  { pattern: /\b(permission|chmod|access rights)\b/i,                tools: ['file_permissions'] },
  { pattern: /\b(startup|autostart|boot|login items)\b/i,            tools: ['startup_apps'] },
  { pattern: /\b(large|biggest|heavy|size|disk usage)\b/i,           tools: ['largest_files'] },
  { pattern: /\b(duplicate|dupe|same file)\b/i,                      tools: ['duplicate_detector'] },
  { pattern: /\b(find|locate|search|where is|look for)\b/i,          tools: ['search_files', 'search_pattern', 'search_file_by_location'] },
  { pattern: /\b(semantic|meaning|similar to|related)\b/i,           tools: ['semantic_search'] },
  { pattern: /\b(monitor|watch|folder change|notify)\b/i,            tools: ['monitor_folder'] },
  { pattern: /\b(undo|revert|rollback)\b/i,                          tools: ['undo_action'] },
  { pattern: /\b(activity|log|history|audit)\b/i,                    tools: ['activity_logs'] },
  { pattern: /\b(system info|cpu|ram|memory|disk|hardware|os)\b/i,   tools: ['system_info', 'detect_os'] },
  { pattern: /\b(workflow|automate|pipeline)\b/i,                    tools: ['workflow_runner'] },
]

const MAX_TOOLS = 10

export function selectTools(userMessage: string, allTools: AiToolSchema[]): AiToolSchema[] {
  const toolIndex = new Map(allTools.map((t) => [t.function.name, t]))

  const selected = new Set<string>(CORE_TOOLS)

  for (const { pattern, tools } of INTENT_MAP) {
    if (pattern.test(userMessage)) {
      for (const name of tools) selected.add(name)
      if (selected.size >= MAX_TOOLS) break
    }
  }

  const result: AiToolSchema[] = []
  for (const name of selected) {
    const tool = toolIndex.get(name)
    if (tool) result.push(tool)
    if (result.length >= MAX_TOOLS) break
  }

  return result
}
