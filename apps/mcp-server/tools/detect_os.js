const { getOS } = require('../utils/os-detector');

module.exports = {
  name: 'detect_os',
  definition: {
    name: 'detect_os',
    description: 'Detect current operating system of the host machine.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  handler: async () => {
    const os = getOS();
    return {
      content: [
        {
          type: 'text',
          text: `The current operating system is: ${os}`,
        },
      ],
    };
  },
};
