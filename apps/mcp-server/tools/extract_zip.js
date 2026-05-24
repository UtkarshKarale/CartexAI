const fs = require('fs');
const unzipper = require('unzipper');
const path = require('path');

module.exports = {
  name: 'extract_zip',
  definition: {
    name: 'extract_zip',
    description: 'Extract a zip archive to a directory.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'The path to the zip file.',
        },
        destination: {
          type: 'string',
          description: 'The folder to extract files into.',
        },
      },
      required: ['source', 'destination'],
    },
  },
  handler: async (args) => {
    const { source, destination } = args;
    try {
      await fs.createReadStream(source)
        .pipe(unzipper.Extract({ path: destination }))
        .promise();

      return {
        content: [{ type: 'text', text: `Successfully extracted ${source} to ${destination}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Extraction error: ${error.message}` }],
        isError: true,
      };
    }
  },
};
