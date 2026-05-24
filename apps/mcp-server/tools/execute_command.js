const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
  name: 'execute_command',
  definition: {
    name: 'execute_command',
    description: 'Execute a terminal command.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command to execute.',
        },
        cwd: {
          type: 'string',
          description: 'The working directory for the command.',
        },
      },
      required: ['command'],
    },
  },
  handler: async (args) => {
    try {
      const { stdout, stderr } = await execPromise(args.command, {
        cwd: args.cwd || process.cwd(),
      });
      return {
        content: [
          {
            type: 'text',
            text: `Output:\n${stdout}${stderr ? `\nErrors:\n${stderr}` : ''}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Command failed: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
