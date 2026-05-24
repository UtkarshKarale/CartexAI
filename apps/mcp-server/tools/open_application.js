const open = require('open');

module.exports = {
  name: 'open_application',
  definition: {
    name: 'open_application',
    description: 'Open a file, folder, or application with the system default handler.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'The path or URL to open.',
        },
      },
      required: ['target'],
    },
  },
  handler: async (args) => {
    try {
      const open = require('open').default;
      await open(args.target);
      return {
        content: [
          {
            type: 'text',
            text: `Successfully opened: ${args.target}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error opening ${args.target}: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
