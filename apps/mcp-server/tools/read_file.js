const fs = require('fs/promises');
const path = require('path');

module.exports = {
  name: 'read_file',
  definition: {
    name: 'read_file',
    description: 'Read the contents of a text file.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The absolute or relative path to the file.',
        },
      },
      required: ['path'],
    },
  },
  handler: async (args) => {
    try {
      const content = await fs.readFile(args.path, 'utf-8');
      return {
        content: [
          {
            type: 'text',
            text: content,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error reading file: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
