const fs = require('fs/promises');
const path = require('path');

module.exports = {
  name: 'list_files',
  definition: {
    name: 'list_files',
    description: 'List all files in a directory and return their names, count, types, and sizes.',
    inputSchema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'The directory path to list files from.',
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to include files in subdirectories.',
          default: false,
        },
      },
      required: ['directory'],
    },
  },
  handler: async (args) => {
    try {
      const dir = args.directory;
      const recursive = args.recursive ?? false;

      const entries = await fs.readdir(dir, { withFileTypes: true });

      const results = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(dir, entry.name);
          try {
            const stat = await fs.stat(fullPath);
            return {
              name: entry.name,
              type: entry.isDirectory() ? 'folder' : 'file',
              size: stat.size,
              sizeHuman: formatSize(stat.size),
              modified: stat.mtime.toLocaleDateString(),
            };
          } catch {
            return { name: entry.name, type: 'unknown', size: 0, sizeHuman: '?', modified: '?' };
          }
        })
      );

      const files = results.filter(e => e.type === 'file');
      const folders = results.filter(e => e.type === 'folder');

      const summary = [
        `Directory: ${dir}`,
        `Total items: ${results.length} (${files.length} files, ${folders.length} folders)`,
        '',
        'Files:',
        ...files.map(f => `  ${f.name}  [${f.sizeHuman}]  ${f.modified}`),
        folders.length > 0 ? '' : '',
        folders.length > 0 ? 'Folders:' : '',
        ...folders.map(f => `  ${f.name}/`),
      ].filter(l => l !== undefined).join('\n');

      return { content: [{ type: 'text', text: summary }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error listing files: ${error.message}` }], isError: true };
    }
  },
};

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}