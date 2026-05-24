const screenshot = require('screenshot-desktop');
const path = require('path');
const fs = require('fs');

module.exports = {
  name: 'take_screenshot',
  definition: {
    name: 'take_screenshot',
    description: 'Capture a screenshot of the primary display.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'The filename to save the screenshot (e.g., "screenshot.png").',
          default: 'screenshot.png',
        },
      },
    },
  },
  handler: async (args) => {
    const { filename = 'screenshot.png' } = args;
    try {
      const imgPath = await screenshot({ filename });
      return {
        content: [
          {
            type: 'text',
            text: `Screenshot saved to: ${imgPath}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Screenshot error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
