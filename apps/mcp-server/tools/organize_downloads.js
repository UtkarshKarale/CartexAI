const fs = require('fs/promises');
const path = require('path');

module.exports = {
  name: 'organize_downloads',
  definition: {
    name: 'organize_downloads',
    description: 'Organize files in a directory into subfolders by type (Images, Docs, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'The directory to organize (e.g., Downloads folder).',
        },
      },
      required: ['directory'],
    },
  },
  handler: async (args) => {
    const { directory } = args;
    const mapping = {
      'Images': ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.bmp'],
      'Documents': ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'],
      'Spreadsheets': ['.xls', '.xlsx', '.csv'],
      'Archives': ['.zip', '.rar', '.7z', '.tar', '.gz'],
      'Code': ['.js', '.py', '.java', '.cpp', '.html', '.css', '.ts'],
      'Audio': ['.mp3', '.wav', '.flac', '.m4a'],
      'Video': ['.mp4', '.mkv', '.avi', '.mov'],
    };

    try {
      const files = await fs.readdir(directory, { withFileTypes: true });
      let movedCount = 0;

      for (const file of files) {
        if (file.isFile()) {
          const ext = path.extname(file.name).toLowerCase();
          let category = 'Others';

          for (const [cat, exts] of Object.entries(mapping)) {
            if (exts.includes(ext)) {
              category = cat;
              break;
            }
          }

          const targetDir = path.join(directory, category);
          await fs.mkdir(targetDir, { recursive: true });
          await fs.rename(
            path.join(directory, file.name),
            path.join(targetDir, file.name)
          );
          movedCount++;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: `Successfully organized ${movedCount} files in ${directory}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error organizing downloads: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
