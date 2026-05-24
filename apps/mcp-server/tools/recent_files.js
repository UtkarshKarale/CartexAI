const fs = require('fs/promises');
const path = require('path');

module.exports = {
  name: 'recent_files',
  definition: {
    name: 'recent_files',
    description: 'Get a list of recently modified files in a directory.',
    inputSchema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'The directory to check. Defaults to the current directory.',
          default: '.',
        },
        limit: {
          type: 'number',
          description: 'Number of files to return.',
          default: 10,
        },
      },
    },
  },
  handler: async (args) => {
    const { directory = '.', limit = 10 } = args;
    try {
      const files = await fs.readdir(directory, { withFileTypes: true });
      const fileStats = await Promise.all(
        files
          .filter(f => f.isFile())
          .map(async f => {
            const fullPath = path.join(directory, f.name);
            const stats = await fs.stat(fullPath);
            return { name: f.name, path: fullPath, mtime: stats.mtime };
          })
      );

      const recent = fileStats
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, limit);

      return {
        content: [
          {
            type: 'text',
            text: recent.length > 0
              ? `Recent files in ${path.resolve(directory)}:\n` + 
                recent.map(f => `- ${f.name} (Modified: ${f.mtime})`).join('\n')
              : 'No files found.',
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting recent files: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
