const fs = require('fs/promises');
const path = require('path');
const os = require('os');

module.exports = {
  name: 'trash_manager',
  definition: {
    name: 'trash_manager',
    description: 'Move files to a local trash folder instead of permanent deletion.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path of the file or folder to move to trash.',
        },
      },
      required: ['path'],
    },
  },
  handler: async (args) => {
    const trashDir = path.join(os.homedir(), '.jifile-trash');
    try {
      await fs.mkdir(trashDir, { recursive: true });
      const targetPath = path.join(trashDir, `${Date.now()}_${path.basename(args.path)}`);
      await fs.rename(args.path, targetPath);
      return {
        content: [
          {
            type: 'text',
            text: `Moved to trash: ${args.path}\nYou can find it at: ${trashDir}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Trash error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
