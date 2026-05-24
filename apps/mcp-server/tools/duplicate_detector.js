const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

module.exports = {
  name: 'duplicate_detector',
  definition: {
    name: 'duplicate_detector',
    description: 'Detect duplicate files in a directory using MD5 hashing.',
    inputSchema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'The directory to scan.',
          default: '.',
        },
      },
    },
  },
  handler: async (args) => {
    const { directory = '.' } = args;
    const hashes = new Map();
    const duplicates = [];

    async function getHash(filePath) {
      const content = await fs.readFile(filePath);
      return crypto.createHash('md5').update(content).digest('hex');
    }

    async function walk(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile()) {
          try {
            const hash = await getHash(fullPath);
            if (hashes.has(hash)) {
              duplicates.push({
                original: hashes.get(hash),
                duplicate: fullPath,
              });
            } else {
              hashes.set(hash, fullPath);
            }
          } catch (err) {}
        } else if (entry.isDirectory()) {
          try {
            await walk(fullPath);
          } catch (err) {}
        }
      }
    }

    try {
      await walk(directory);
      return {
        content: [
          {
            type: 'text',
            text: duplicates.length > 0
              ? `Found ${duplicates.length} duplicate pairs:\n` + 
                duplicates.map(d => `- Duplicate: ${d.duplicate}\n  Original: ${d.original}`).join('\n')
              : 'No duplicate files found.',
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error detecting duplicates: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
