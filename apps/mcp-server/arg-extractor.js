const os = require('os');
const { llmChat } = require('./llm');

const HOME = os.homedir();

async function extractArgs(userQuery, toolDefinition) {
  const schema = toolDefinition.inputSchema ?? toolDefinition.input_schema ?? {};
  const props = schema.properties ?? {};
  const required = schema.required ?? [];

  if (Object.keys(props).length === 0) return {};

  const fieldList = Object.entries(props).map(([key, val]) => {
    const req = required.includes(key) ? '(required)' : '(optional)';
    return `  ${key} ${req}: ${val.description ?? val.type ?? ''}`;
  }).join('\n');

  const firstRequiredKey = required[0] ?? Object.keys(props)[0] ?? 'field';
  const systemPrompt = `Extract arguments from the user request for the tool "${toolDefinition.name}".
Reply with ONLY a valid JSON object using EXACTLY the field names listed below. No explanation. No markdown.

Context: home directory is ${HOME}. Common paths: Downloads=${HOME}/Downloads, Desktop=${HOME}/Desktop, Documents=${HOME}/Documents.

Fields:
${fieldList}

Example reply format: {"${firstRequiredKey}": "value"}`;

  const raw = await llmChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userQuery }
  ], 80);

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Could not extract args from LLM response: ${raw}`);

  const args = JSON.parse(jsonMatch[0]);
  resolvePathArgs(args, props);
  fixRenameDir(args, toolDefinition.name);
  return args;
}

function fixRenameDir(args, toolName) {
  if (toolName !== 'rename_file') return;
  if (!args.oldPath || !args.newPath) return;
  const path = require('path');
  const oldDir = path.dirname(args.oldPath);
  const newDir = path.dirname(args.newPath);
  if (oldDir !== newDir) {
    args.newPath = path.join(oldDir, path.basename(args.newPath));
  }
}

function resolvePathArgs(args, props) {
  const home = os.homedir();
  const shortcuts = {
    downloads: `${home}/Downloads`,
    download: `${home}/Downloads`,
    desktop: `${home}/Desktop`,
    documents: `${home}/Documents`,
    home: home,
    pictures: `${home}/Pictures`,
    videos: `${home}/Videos`,
    music: `${home}/Music`,
  };

  for (const [key, val] of Object.entries(args)) {
    if (typeof val !== 'string') continue;
    if (!/path|dir|directory|folder|file|dest|source|src/i.test(key)) continue;
    if (val.startsWith('/')) continue;

    const lower = val.toLowerCase().replace(/[\\/]/g, '');
    if (shortcuts[lower]) {
      args[key] = shortcuts[lower];
    } else if (val.startsWith('~')) {
      args[key] = val.replace('~', home);
    } else {
      args[key] = `${home}/${val}`;
    }
  }
  return args;
}

module.exports = { extractArgs };