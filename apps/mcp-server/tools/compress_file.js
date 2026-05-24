const fs = require('fs');
const archiver = require('archiver');
const path = require('path');

module.exports = {
  name: 'compress_file',
  definition: {
    name: 'compress_file',
    description: 'Compress files or folders into a zip archive.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'The path to the file or folder to compress.',
        },
        destination: {
          type: 'string',
          description: 'The path of the resulting zip file (e.g., "archive.zip").',
        },
      },
      required: ['source', 'destination'],
    },
  },
  handler: async (args) => {
    const { source, destination } = args;
    const { ZipArchive } = require('archiver');
    
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(destination);
      const archive = new ZipArchive({ zlib: { level: 9 } });

      output.on('close', () => {
        resolve({
          content: [{ type: 'text', text: `Successfully compressed ${source} to ${destination} (${archive.pointer()} total bytes)` }],
        });
      });

      archive.on('error', (err) => {
        resolve({
          content: [{ type: 'text', text: `Compression error: ${err.message}` }],
          isError: true,
        });
      });

      archive.pipe(output);

      const stats = fs.statSync(source);
      if (stats.isDirectory()) {
        archive.directory(source, false);
      } else {
        archive.file(source, { name: path.basename(source) });
      }

      archive.finalize();
    });
  },
};
