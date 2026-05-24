const fs = require('fs/promises');
const path = require('path');

module.exports = {
  name: 'backup_to_drive',
  definition: {
    name: 'backup_to_drive',
    description: 'Backup files to a local backup location or Google Drive (skeleton).',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source file or folder.' },
        destination: { type: 'string', description: 'Local destination or Drive path.' },
        useDrive: { type: 'boolean', description: 'Whether to use Google Drive (requires setup).', default: false },
      },
      required: ['source', 'destination'],
    },
  },
  handler: async (args) => {
    const { source, destination, useDrive } = args;
    if (useDrive) {
      return {
        content: [{ type: 'text', text: 'Google Drive backup requires valid credentials and setup. Please configure the server with DRIVE_CREDENTIALS.' }],
        isError: true,
      };
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(destination, `backup_${timestamp}`);
      await fs.mkdir(backupPath, { recursive: true });
      await fs.cp(source, path.join(backupPath, path.basename(source)), { recursive: true });
      
      return {
        content: [{ type: 'text', text: `Successfully backed up to ${backupPath}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Backup error: ${error.message}` }],
        isError: true,
      };
    }
  },
};
