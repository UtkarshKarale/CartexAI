const fs = require('fs/promises');

module.exports = {
  name: 'ai_summary',
  definition: {
    name: 'ai_summary',
    description: 'Summarize the content of a file using AI (or basic logic if no AI configured).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to summarize.' },
      },
      required: ['path'],
    },
  },
  handler: async (args) => {
    try {
      const content = await fs.readFile(args.path, 'utf-8');
      const stats = await fs.stat(args.path);
      
      // Basic summary logic for skeleton
      const lines = content.split('\n');
      const wordCount = content.split(/\s+/).length;
      
      const summary = [
        `File: ${args.path}`,
        `Size: ${(stats.size / 1024).toFixed(2)} KB`,
        `Lines: ${lines.length}`,
        `Words: ${wordCount}`,
        `Preview: ${lines[0].substring(0, 100)}...`,
        '',
        'AI Note: To get a full semantic summary, please configure an LLM provider.',
      ].join('\n');

      return {
        content: [{ type: 'text', text: summary }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Summary error: ${error.message}` }],
        isError: true,
      };
    }
  },
};
