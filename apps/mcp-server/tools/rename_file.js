const fs = require('fs/promises');
const { registerUndo } = require('./undo_action');

module.exports = {
  name: 'rename_file',
  definition: {
    name: 'rename_file',
    description: 'Rename a file or directory.',
    inputSchema: {
      type: 'object',
      properties: {
        oldPath: {
          type: 'string',
          description: 'The current path of the file or folder.',
        },
        newPath: {
          type: 'string',
          description: 'The new path for the file or folder.',
        },
      },
      required: ['oldPath', 'newPath'],
    },
  },
  handler: async (args) => {
    try {
      await fs.rename(args.oldPath, args.newPath);
      // Register for undo
      try {
        registerUndo({ type: 'rename', from: args.oldPath, to: args.newPath });
      } catch (err) {} 

      return {
        content: [
          {
            type: 'text',
            text: `Successfully renamed ${args.oldPath} to ${args.newPath}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error renaming: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
