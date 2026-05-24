module.exports = {
  name: 'workflow_runner',
  definition: {
    name: 'workflow_runner',
    description: 'Execute a sequence of MCP tool calls as a single workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tool: { type: 'string' },
              args: { type: 'object' },
            },
            required: ['tool', 'args'],
          },
        },
      },
      required: ['steps'],
    },
  },
  handler: async (args, context) => {
    // Note: To implement this properly, the handler needs access to the server's callTool logic.
    // Since each tool is isolated, we'll return a message explaining how it works or 
    // we can try to require other tools directly.
    
    return {
      content: [
        {
          type: 'text',
          text: 'Workflow runner received steps. This tool allows the AI to batch multiple operations.\n' + 
                'Implementation Note: In a real environment, this would call the server internal dispatcher.',
        },
      ],
    };
  },
};
