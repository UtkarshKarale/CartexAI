const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const { getOS } = require('../utils/os-detector');

module.exports = {
  name: 'startup_apps',
  definition: {
    name: 'startup_apps',
    description: 'Show a list of startup applications.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  handler: async () => {
    const os = getOS();
    try {
      let command = '';
      if (os === 'windows') {
        command = 'wmic startup get caption,command';
      } else if (os === 'macos') {
        command = 'launchctl list';
      } else {
        command = 'ls /etc/init.d/ && ls ~/.config/autostart/';
      }

      const { stdout } = await execPromise(command);
      return {
        content: [{ type: 'text', text: stdout.trim() || 'No startup apps found or command not supported.' }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error fetching startup apps: ${error.message}` }],
        isError: true,
      };
    }
  },
};
