const os = require('os');
const path = require('path');

const HOME = os.homedir();

function buildPrompt(userQuery, tools) {
  const toolList = Array.from(tools.values()).map(t => {
    const props = t.definition.inputSchema?.properties ?? {};
    const params = Object.keys(props).join('|');
    return `${t.definition.name} params:${params}`;
  }).join('\n');

  return `You are a file assistant. Pick the right tool for the user request and output ONE line only:
TOOL=<tool_name> ARGS=<key1>:<value1>,<key2>:<value2>

Home dir: ${HOME}
Desktop=${HOME}/Desktop Downloads=${HOME}/Downloads Documents=${HOME}/Documents

Tools:
${toolList}

Rules:
- Output ONLY the TOOL= line, nothing else, no explanation
- Use full absolute paths
- For rename_file: newPath must stay in same directory as oldPath

User: ${userQuery}`;
}

function parseOutput(raw) {
  const line = raw.split('\n').map(l => l.trim()).find(l => l.startsWith('TOOL='));
  if (!line) return null;

  const toolMatch = line.match(/TOOL=(\S+)/);
  const argsMatch = line.match(/ARGS=(.+)/);
  if (!toolMatch) return null;

  const tool = toolMatch[1];
  const args = {};
  if (argsMatch) {
    argsMatch[1].split(',').forEach(pair => {
      const idx = pair.indexOf(':');
      if (idx > 0) {
        const key = pair.slice(0, idx).trim();
        const val = pair.slice(idx + 1).trim();
        args[key] = isNaN(Number(val)) ? val : Number(val);
      }
    });
  }
  return { tool, args };
}

function runGemini(prompt) {
  return new Promise((resolve, reject) => {
    const { exec } = require('child_process');
    const fs = require('fs');
    const tmpFile = `/tmp/jifile_gemini_${Date.now()}.txt`;
    fs.writeFileSync(tmpFile, prompt);
    exec(`script -q -c "gemini -p \\"$(cat ${tmpFile})\\"" /dev/null`, {
      timeout: 25000,
      maxBuffer: 1024 * 1024,
    }, (err, stdout) => {
      try { fs.unlinkSync(tmpFile); } catch {}
      resolve(stdout ?? '');
    });
  });
}

async function geminiDecide(userQuery, tools) {
  const prompt = buildPrompt(userQuery, tools);
  const raw = await runGemini(prompt);
  const parsed = parseOutput(raw);

  if (!parsed || !tools.has(parsed.tool)) return null;

  if (parsed.tool === 'rename_file' && parsed.args?.oldPath && parsed.args?.newPath) {
    const oldDir = path.dirname(parsed.args.oldPath);
    const newDir = path.dirname(parsed.args.newPath);
    if (oldDir !== newDir) {
      parsed.args.newPath = path.join(oldDir, path.basename(parsed.args.newPath));
    }
  }

  return { tool: parsed.tool, args: parsed.args, provider: 'gemini' };
}

module.exports = { geminiDecide };
