const fs = require('fs/promises');
const path = require('path');

module.exports = {
  name: 'write_file',
  definition: {
    name: 'write_file',
    description: 'Write content to a file. Overwrites if file exists, creates if not.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file.',
        },
        content: {
          type: 'string',
          description: 'The content to write.',
        },
      },
      required: ['path', 'content'],
    },
  },
  handler: async (args) => {
    try {
      await fs.mkdir(path.dirname(args.path), { recursive: true });
      await fs.writeFile(args.path, args.content, 'utf-8');
      return {
        content: [
          {
            type: 'text',
            text: `Successfully wrote to ${args.path}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error writing file: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
