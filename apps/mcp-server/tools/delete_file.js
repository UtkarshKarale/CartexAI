const fs = require('fs/promises');

module.exports = {
  name: 'delete_file',
  definition: {
    name: 'delete_file',
    description: 'Delete a file or directory.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path of the file or folder to delete.',
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to delete recursively if it is a directory.',
          default: false,
        },
      },
      required: ['path'],
    },
  },
  handler: async (args) => {
    try {
      await fs.rm(args.path, { recursive: args.recursive || false, force: true });
      return {
        content: [
          {
            type: 'text',
            text: `Successfully deleted: ${args.path}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error deleting: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
