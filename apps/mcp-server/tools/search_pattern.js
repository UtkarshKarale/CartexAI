const fs = require('fs/promises');
const path = require('path');

module.exports = {
  name: 'search_pattern',
  definition: {
    name: 'search_pattern',
    description: 'Search for a text pattern inside files within a directory.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The regex pattern or text to search for.',
        },
        directory: {
          type: 'string',
          description: 'The directory to search in.',
          default: '.',
        },
        include: {
          type: 'string',
          description: 'Glob pattern for files to include (e.g., "*.js").',
        },
      },
      required: ['pattern'],
    },
  },
  handler: async (args) => {
    const { pattern, directory = '.', include } = args;
    const regex = new RegExp(pattern, 'i');
    const matches = [];

    async function searchInFile(filePath) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (regex.test(line)) {
            matches.push({
              file: filePath,
              line: index + 1,
              content: line.trim(),
            });
          }
        });
      } catch (err) {
        // Skip binary or unreadable files
      }
    }

    async function walk(dir) {
      const files = await fs.readdir(dir, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isFile()) {
          if (!include || new RegExp(include.replace('*', '.*')).test(file.name)) {
            await searchInFile(fullPath);
          }
        } else if (file.isDirectory()) {
          try {
            await walk(fullPath);
          } catch (err) {}
        }
      }
    }

    try {
      await walk(directory);
      return {
        content: [
          {
            type: 'text',
            text: matches.length > 0
              ? `Found ${matches.length} matches:\n` + 
                matches.slice(0, 50).map(m => `${m.file}:${m.line}: ${m.content}`).join('\n') +
                (matches.length > 50 ? '\n... (truncated)' : '')
              : 'No matches found.',
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error searching pattern: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
