const fs = require('fs/promises');
const path = require('path');

module.exports = {
  name: 'move_file',
  definition: {
    name: 'move_file',
    description: 'Move a file or directory to a new location.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'The path of the file or folder to move.',
        },
        destination: {
          type: 'string',
          description: 'The destination folder or path.',
        },
      },
      required: ['source', 'destination'],
    },
  },
  handler: async (args) => {
    try {
      // Ensure destination directory exists if it's a directory path
      // Note: fs.rename works for moving.
      await fs.rename(args.source, args.destination);
      return {
        content: [
          {
            type: 'text',
            text: `Successfully moved ${args.source} to ${args.destination}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error moving: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
