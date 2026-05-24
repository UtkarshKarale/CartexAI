const fs = require('fs/promises');
const path = require('path');

module.exports = {
  name: 'largest_files',
  definition: {
    name: 'largest_files',
    description: 'Find the largest storage-consuming files in a directory.',
    inputSchema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'The directory to search. Defaults to current.',
          default: '.',
        },
        limit: {
          type: 'number',
          description: 'Number of largest files to return.',
          default: 10,
        },
      },
    },
  },
  handler: async (args) => {
    const { directory = '.', limit = 10 } = args;
    const files = [];

    async function walk(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile()) {
          try {
            const stats = await fs.stat(fullPath);
            files.push({ name: entry.name, path: fullPath, size: stats.size });
          } catch (err) {}
        } else if (entry.isDirectory()) {
          try {
            await walk(fullPath);
          } catch (err) {}
        }
      }
    }

    try {
      await walk(directory);
      const largest = files
        .sort((a, b) => b.size - a.size)
        .slice(0, limit);

      return {
        content: [
          {
            type: 'text',
            text: largest.length > 0
              ? `Largest files in ${path.resolve(directory)}:\n` + 
                largest.map(f => `- ${f.name} (${(f.size / 1024 / 1024).toFixed(2)} MB) at ${f.path}`).join('\n')
              : 'No files found.',
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error finding largest files: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
