const open = require('open');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

module.exports = {
  name: 'open_application',
  definition: {
    name: 'open_application',
    description: 'Open a file, folder, or application with the system default handler.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'The path or URL to open.',
        },
      },
      required: ['target'],
    },
  },
  handler: async (args) => {
    try {
      const target = String(args.target ?? '').trim();
      if (!target) {
        throw new Error('Target is required.');
      }

      const openDefault = require('open').default;
      if (/^https?:\/\//i.test(target)) {
        await openDefault(target);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully opened URL: ${target}`,
            },
          ],
        };
      }

      if (fs.existsSync(target)) {
        await openDefault(target);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully opened: ${target}`,
            },
          ],
        };
      }

      const resolvedApp = await resolveApplication(target);
      if (resolvedApp) {
        await openDefault(resolvedApp);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully opened application: ${resolvedApp}`,
            },
          ],
        };
      }

      await openDefault(target);
      return {
        content: [
          {
            type: 'text',
            text: `Successfully opened: ${args.target}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error opening ${args.target}: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};

async function resolveApplication(target) {
  if (process.platform === 'win32') {
    const whereResult = spawnSync('where', [target], { encoding: 'utf8' });
    if (whereResult.status === 0) {
      const hit = whereResult.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
      if (hit) return hit;
    }

    const shortcut = await findStartMenuShortcut(target);
    if (shortcut) return shortcut;
  }

  const whichResult = spawnSync(process.platform === 'win32' ? 'where' : 'which', [target], { encoding: 'utf8' });
  if (whichResult.status === 0) {
    const hit = whichResult.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (hit) return hit;
  }

  return null;
}

async function findStartMenuShortcut(target) {
  const normalized = target.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const roots = [
    path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.PROGRAMDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ].filter(Boolean);

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const hit = await walkForShortcut(root, normalized);
    if (hit) return hit;
  }
  return null;
}

async function walkForShortcut(dir, normalizedTarget) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const normalizedName = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (normalizedName.includes(normalizedTarget) && (entry.name.endsWith('.lnk') || entry.name.endsWith('.exe'))) {
      return full;
    }
    if (entry.isDirectory()) {
      try {
        const nested = await walkForShortcut(full, normalizedTarget);
        if (nested) return nested;
      } catch {
        // ignore
      }
    }
  }
  return null;
}
