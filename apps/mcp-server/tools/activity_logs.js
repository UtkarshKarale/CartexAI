const fs = require('fs/promises');
const path = require('path');

module.exports = {
  name: 'activity_logs',
  definition: {
    name: 'activity_logs',
    description: 'Read the activity logs of the MCP server.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of recent logs to return.', default: 50 },
      },
    },
  },
  handler: async (args) => {
    const logFile = path.join(process.cwd(), 'activity.log');
    try {
      const content = await fs.readFile(logFile, 'utf-8');
      const lines = content.trim().split('\n');
      const recent = lines.slice(-args.limit);
      return {
        content: [{ type: 'text', text: recent.join('\n') || 'No logs found.' }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: 'No activity logs found yet.' }],
      };
    }
  },
};
