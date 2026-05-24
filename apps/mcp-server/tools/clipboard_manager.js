const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const { getOS } = require('../utils/os-detector');

module.exports = {
  name: 'clipboard_manager',
  definition: {
    name: 'clipboard_manager',
    description: 'Read from or write to the system clipboard.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'write'],
          description: 'Whether to read or write to the clipboard.',
        },
        text: {
          type: 'string',
          description: 'The text to write (required if action is "write").',
        },
      },
      required: ['action'],
    },
  },
  handler: async (args) => {
    const { action, text } = args;
    const os = getOS();

    try {
      if (action === 'read') {
        let command = '';
        if (os === 'windows') command = 'powershell Get-Clipboard';
        else if (os === 'macos') command = 'pbpaste';
        else if (os === 'linux') command = 'xclip -selection clipboard -o || xsel --clipboard --output';

        const { stdout } = await execPromise(command);
        return {
          content: [{ type: 'text', text: stdout.trim() }],
        };
      } else {
        if (!text) throw new Error('Text is required for write action');
        
        let command = '';
        if (os === 'windows') command = `powershell "Set-Clipboard -Value '${text.replace(/'/g, "''")}'"`;
        else if (os === 'macos') command = `echo "${text.replace(/"/g, '\\"')}" | pbcopy`;
        else if (os === 'linux') command = `echo "${text.replace(/"/g, '\\"')}" | xclip -selection clipboard`;

        await execPromise(command);
        return {
          content: [{ type: 'text', text: 'Successfully written to clipboard' }],
        };
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Clipboard error: ${error.message}` }],
        isError: true,
      };
    }
  },
};
