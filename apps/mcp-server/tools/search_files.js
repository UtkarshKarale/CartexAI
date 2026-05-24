const fs = require('fs/promises');
const path = require('path');
const os = require('os');

module.exports = {
  name: 'search_files',
  definition: {
    name: 'search_files',
    description: 'Search for files by name within a directory.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query (filename or part of it).',
        },
        directory: {
          type: 'string',
          description: 'The directory to search in. Defaults to the home directory.',
          default: os.homedir(),
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to search recursively.',
          default: true,
        },
      },
      required: ['query'],
    },
  },
  handler: async (args) => {
    const { query, directory = os.homedir(), recursive = true } = args;
    const results = [];

    async function walk(dir) {
      const files = await fs.readdir(dir, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.name.toLowerCase().includes(query.toLowerCase())) {
          results.push(fullPath);
        }
        if (recursive && file.isDirectory()) {
          try {
            await walk(fullPath);
          } catch (err) {
            // Ignore access errors
          }
        }
      }
    }

    try {
      await walk(directory);
      return {
        content: [
          {
            type: 'text',
            text: results.length > 0 
              ? `Found ${results.length} files:\n${results.join('\n')}`
              : 'No files found matching the query.',
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error searching files: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
