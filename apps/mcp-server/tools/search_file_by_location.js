const fs = require('fs/promises');
const path = require('path');

module.exports = {
  name: 'search_file_by_location',
  definition: {
    name: 'search_file_by_location',
    description: 'Search for files in a specific folder or location.',
    inputSchema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The folder/location to search in.',
        },
        extension: {
          type: 'string',
          description: 'Filter by file extension (e.g., ".txt").',
        },
      },
      required: ['location'],
    },
  },
  handler: async (args) => {
    const { location, extension } = args;
    try {
      const files = await fs.readdir(location, { withFileTypes: true });
      const filtered = files
        .filter(f => f.isFile())
        .filter(f => !extension || f.name.endsWith(extension))
        .map(f => f.name);

      return {
        content: [
          {
            type: 'text',
            text: filtered.length > 0
              ? `Files in ${location}:\n${filtered.join('\n')}`
              : `No files found in ${location}${extension ? ` with extension ${extension}` : ''}.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
