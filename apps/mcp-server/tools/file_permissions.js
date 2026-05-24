const fs = require('fs/promises');

module.exports = {
  name: 'file_permissions',
  definition: {
    name: 'file_permissions',
    description: 'Read or change file permissions.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file or folder.' },
        mode: { type: 'string', description: 'Octal mode (e.g., "755"). If omitted, reads current mode.' },
      },
      required: ['path'],
    },
  },
  handler: async (args) => {
    try {
      if (args.mode) {
        await fs.chmod(args.path, parseInt(args.mode, 8));
        return {
          content: [{ type: 'text', text: `Successfully changed permissions of ${args.path} to ${args.mode}` }],
        };
      } else {
        const stats = await fs.stat(args.path);
        const mode = (stats.mode & parseInt('777', 8)).toString(8);
        return {
          content: [{ type: 'text', text: `Current permissions of ${args.path}: ${mode}` }],
        };
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Permissions error: ${error.message}` }],
        isError: true,
      };
    }
  },
};
