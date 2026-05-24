const fs = require('fs/promises');

module.exports = {
  name: 'copy_file',
  definition: {
    name: 'copy_file',
    description: 'Copy a file or directory.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'The path of the source file or folder.',
        },
        destination: {
          type: 'string',
          description: 'The destination path.',
        },
      },
      required: ['source', 'destination'],
    },
  },
  handler: async (args) => {
    try {
      await fs.cp(args.source, args.destination, { recursive: true });
      return {
        content: [
          {
            type: 'text',
            text: `Successfully copied ${args.source} to ${args.destination}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error copying: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
