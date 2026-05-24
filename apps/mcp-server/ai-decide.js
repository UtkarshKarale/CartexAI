const os = require('os');
const { llmChat } = require('./llm');

const HOME = os.homedir();

function buildToolMenu(tools) {
  return Array.from(tools.values()).map(t => {
    const props = t.definition.inputSchema?.properties ?? {};
    const params = Object.entries(props).map(([k, v]) => `${k}(${v.type ?? 'string'})`).join(', ');
    return `${t.definition.name}: ${t.definition.description} | params: ${params}`;
  }).join('\n');
}

async function aiDecide(userQuery, tools) {
  const home = os.homedir();
  const toolMenu = buildToolMenu(tools);

  const systemPrompt = `You are a file assistant. Given a user request, output ONLY a single JSON line:
{"tool":"<tool_name>","args":{...}}

Rules:
- Use exact tool names from the list below
- Home dir is ${home}. Desktop=${home}/Desktop, Downloads=${home}/Downloads, Documents=${home}/Documents
- For rename: keep newPath in same directory as oldPath unless user says to move
- Output ONLY the JSON. No explanation.

Tools:
${toolMenu}`;

  const raw = await llmChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userQuery },
  ], 120);

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.tool || !tools.has(parsed.tool)) return null;

  if (parsed.tool === 'rename_file' && parsed.args?.oldPath && parsed.args?.newPath) {
    const path = require('path');
    const oldDir = path.dirname(parsed.args.oldPath);
    const newDir = path.dirname(parsed.args.newPath);
    if (oldDir !== newDir) {
      parsed.args.newPath = path.join(oldDir, path.basename(parsed.args.newPath));
    }
  }

  return { tool: parsed.tool, args: parsed.args ?? {} };
}

module.exports = { aiDecide };