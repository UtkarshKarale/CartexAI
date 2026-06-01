import type { AiToolSchema } from './providers/base'

const CORE_TOOLS = new Set([
  'list_files',
  'search_files',
  'recent_files',
])

const INTENT_MAP: Array<{ pattern: RegExp; tools: string[] }> = [
  {
    pattern: /\.(xlsx|xls|csv|xlsm|xlsb)|excel|spreadsheet|workbook|gst|invoice|tally|ledger|voucher|reconcil|payroll|salary|attendance|vendor|pivot|formula|cell\b/i,
    tools: ['excel_get_schema', 'excel_read_sample_rows', 'excel_query_rows', 'excel_detect_anomalies', 'excel_generate_summary', 'excel_export_xlsx', 'excel_bulk_update', 'excel_apply_formula', 'excel_merge_sheets', 'excel_ai_map_columns', 'excel_validate_formats', 'excel_split_by_column'],
  },
  {
    pattern: /\.(pdf)|pdf file|extract.*pdf|pdf.*table|bank.*statement.*pdf|invoice.*pdf/i,
    tools: ['pdf_extract_tables', 'pdf_read_content', 'excel_export_xlsx', 'ocr_image'],
  },
  {
    pattern: /\bread.*pdf|pdf.*content|summarize.*pdf|pdf.*text|what.*pdf|pdf.*question|open.*pdf\b/i,
    tools: ['pdf_read_content', 'pdf_extract_tables'],
  },
  {
    pattern: /\.(xml)|xml.*file|xml.*data|convert.*xml/i,
    tools: ['xml_to_excel', 'excel_export_xlsx'],
  },
  {
    pattern: /sql|database|db export|insert.*statement|create.*table/i,
    tools: ['excel_to_sql', 'excel_query_rows'],
  },
  {
    pattern: /chart|graph|bar chart|line chart|pie chart|visuali/i,
    tools: ['excel_add_charts', 'excel_generate_summary', 'excel_export_xlsx'],
  },
  {
    pattern: /formula.*error|broken.*formula|#ref|#div|#value|#name|#na\b/i,
    tools: ['excel_scan_formula_errors'],
  },
  {
    pattern: /\b(gmail|google mail|my inbox|unread email|email.*api|sign in.*google|connect.*gmail|oauth.*google)\b/i,
    tools: ['gmail_auth', 'gmail_list_inbox', 'gmail_read_email', 'gmail_send'],
  },
  {
    pattern: /\b(read.*email|check.*email|email.*opportunit|auto.*reply|reply.*suggest|analyze.*email|email.*trigger|email.*listen|new.*email)\b/i,
    tools: ['gmail_list_inbox', 'gmail_read_email', 'gmail_send', 'gmail_auth'],
  },
  {
    pattern: /\b(email|send|mail|smtp|inbox|attachment)\b/i,
    tools: ['send_email_smtp', 'gmail_send', 'search_files', 'schedule_reminder'],
  },
  {
    pattern: /\b(remind|reminder|alarm|set.*alarm|notify.*me)\b|\bin \d+ (minute|hour|day)s?\b|\b(tomorrow|today|tonight)\b.{0,30}\b(at|by)\b|\bat \d{1,2}(:\d{2})?\s*(am|pm)\b|\bschedule\b/i,
    tools: ['schedule_reminder', 'list_reminders', 'cancel_reminder'],
  },
  {
    pattern: /\b(voice|transcribe|transcription|record.*voice|speech.*text|audio.*file|whisper)\b/i,
    tools: ['voice_command'],
  },
  {
    pattern: /\b(delete|remove|trash|unlink)\b/i,
    tools: ['delete_file', 'trash_manager'],
  },
  {
    pattern: /\b(move|copy|rename|transfer)\b/i,
    tools: ['move_file', 'copy_file', 'rename_file'],
  },
  {
    pattern: /\b(write|create|mkdir|new file|new folder|touch)\b/i,
    tools: ['write_file', 'create_folder'],
  },
  {
    pattern: /\b(read|open|view|show|content of|inside)\b.*\.(txt|json|md|log|yaml|yml|toml|ini|conf|py|js|ts|sh)/i,
    tools: ['read_file'],
  },
  {
    pattern: /\b(terminal|command|run|execute|shell|bash|cmd)\b/i,
    tools: ['execute_command', 'terminal_session'],
  },
  {
    pattern: /\b(screenshot|capture|screen grab|screen shot)\b/i,
    tools: ['take_screenshot'],
  },
  {
    pattern: /\b(zip|compress|extract|unzip|archive|tar)\b/i,
    tools: ['compress_file', 'extract_zip'],
  },
  {
    pattern: /\b(organize|sort|clean\s*up|arrange|restructure)\b/i,
    tools: ['organize_downloads', 'duplicate_detector', 'largest_files'],
  },
  {
    pattern: /\b(drive|google drive|upload.*drive|move.*drive|backup.*drive|send.*drive|copy.*drive|save.*drive)\b/i,
    tools: ['backup_to_drive', 'gmail_auth'],
  },
  {
    pattern: /\b(clipboard|paste|copy to clip)\b/i,
    tools: ['clipboard_manager'],
  },
  {
    pattern: /\b(open|launch|start|run)\b.{0,40}\b(app|application|chrome|firefox|brave|edge|safari|code|vscode|cursor|spotify|vlc|slack|discord|zoom|terminal|calculator|notepad|excel|word|powerpoint|finder|explorer)\b|\b(open|launch|start)\b.{0,20}\b(browser|editor|player|studio)\b/i,
    tools: ['open_application', 'execute_command'],
  },
  {
    pattern: /\b(photo|photos|picture|pictures|image|images|similar image|find photo|find picture|search images)\b/i,
    tools: ['find_similar_images'],
  },
  {
    pattern: /\b(ocr|text from image|extract text|read image|scan)\b/i,
    tools: ['ocr_image'],
  },
  {
    pattern: /\b(permission|chmod|access rights)\b/i,
    tools: ['file_permissions'],
  },
  {
    pattern: /\b(startup|autostart|boot|login items)\b/i,
    tools: ['startup_apps'],
  },
  {
    pattern: /\b(large|biggest|heavy|size|disk usage)\b/i,
    tools: ['largest_files'],
  },
  {
    pattern: /\b(duplicate|dupe|same file)\b/i,
    tools: ['duplicate_detector'],
  },
  {
    pattern: /\b(find|locate|search|where is|look for)\b/i,
    tools: ['search_files', 'search_pattern', 'search_file_by_location'],
  },
  {
    pattern: /\b(semantic|meaning|similar to|related)\b/i,
    tools: ['semantic_search'],
  },
  {
    pattern: /\b(monitor|watch|folder change|notify)\b/i,
    tools: ['monitor_folder'],
  },
  {
    pattern: /\b(undo|revert|rollback)\b/i,
    tools: ['undo_action'],
  },
  {
    pattern: /\b(activity|log|history|audit log)\b/i,
    tools: ['activity_logs'],
  },
  {
    pattern: /\b(system info|cpu|ram|memory|disk|hardware|os)\b/i,
    tools: ['system_info', 'detect_os'],
  },
  {
    pattern: /\b(workflow|automate|pipeline)\b/i,
    tools: ['workflow_runner'],
  },
]

const MAX_TOOLS = 20

export function selectTools(userMessage: string, allTools: AiToolSchema[]): AiToolSchema[] {
  const toolIndex = new Map(allTools.map((t) => [t.function.name, t]))
  const selected = new Set<string>(CORE_TOOLS)

  for (const { pattern, tools } of INTENT_MAP) {
    if (pattern.test(userMessage)) {
      for (const name of tools) selected.add(name)
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
