const fs = require('fs/promises');

module.exports = {
  name: 'create_folder',
  definition: {
    name: 'create_folder',
    description: 'Create a new directory.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path of the folder to create.',
        },
      },
      required: ['path'],
    },
  },
  handler: async (args) => {
    try {
      await fs.mkdir(args.path, { recursive: true });
      return {
        content: [
          {
            type: 'text',
            text: `Successfully created folder: ${args.path}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error creating folder: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
