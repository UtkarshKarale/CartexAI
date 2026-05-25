const { llmChat } = require('./llm');

const TOOL_NAMES = [
  'rename_file', 'delete_file', 'move_file', 'copy_file', 'read_file', 'list_files',
  'write_file', 'create_folder', 'search_files', 'search_pattern',
  'search_file_by_location', 'compress_file', 'extract_zip',
  'backup_to_drive', 'duplicate_detector', 'largest_files',
  'recent_files', 'trash_manager', 'file_permissions', 'monitor_folder',
  'organize_downloads', 'activity_logs', 'system_info', 'detect_os',
  'open_application', 'terminal_session', 'execute_command',
  'take_screenshot', 'ocr_image', 'ai_summary', 'semantic_search',
  'send_email_smtp', 'clipboard_manager', 'voice_command',
  'startup_apps', 'undo_action', 'workflow_runner', 'find_similar_images'
];

const SYSTEM_PROMPT = `You are a tool router. Given a user request, reply with ONLY the tool name that best matches. No explanation, no punctuation — just the tool name.

Available tools:
${TOOL_NAMES.join(', ')}

Examples:
user: rename my file report.pdf to final.pdf → rename_file
user: delete old logs → delete_file
user: I want to delete a file from desktop → delete_file
user: remove this file → delete_file
user: please delete report.pdf → delete_file
user: backup my documents to google drive → backup_to_drive
user: find duplicate files → duplicate_detector
user: what are the largest files on my disk → largest_files
user: compress the photos folder → compress_file
user: unzip archive.zip → extract_zip
user: move resume.pdf to Desktop → move_file
user: copy config.json to backup folder → copy_file
user: search for files named notes → search_files
user: take a screenshot → take_screenshot
user: what files did I open recently → recent_files
user: show system info → system_info
user: open chrome → open_application
user: open this photo → open_application
user: find similar photos → find_similar_images
user: search images across drives → find_similar_images
user: run ls command → execute_command
user: send email to boss → send_email_smtp
user: read contents of file.txt → read_file
user: organize my downloads folder → organize_downloads
user: extract text from image → ocr_image
user: how many files in downloads → list_files
user: count files inside a folder → list_files
user: list files in documents → list_files
user: show files in desktop folder → list_files
user: what files are in my downloads → list_files
user: search for file named notes → search_files
user: find file called config → search_files`;

async function routeIntent(userQuery) {
  const raw = await llmChat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userQuery }
  ], 20);
  const toolName = raw.toLowerCase().replace(/[^a-z_]/g, '');
  return TOOL_NAMES.includes(toolName) ? toolName : null;
}

module.exports = { routeIntent, TOOL_NAMES };
