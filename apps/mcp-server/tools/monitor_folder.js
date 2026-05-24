const fs = require('fs');
const path = require('path');

const watchers = new Map();
const events = [];

module.exports = {
  name: 'monitor_folder',
  definition: {
    name: 'monitor_folder',
    description: 'Watch a folder for changes (start watching or get recent events).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the folder.' },
        action: { type: 'string', enum: ['start', 'stop', 'events'], default: 'events' },
      },
      required: ['path'],
    },
  },
  handler: async (args) => {
    const { path: folderPath, action } = args;

    if (action === 'start') {
      if (watchers.has(folderPath)) {
        return { content: [{ type: 'text', text: `Already watching: ${folderPath}` }] };
      }
      const watcher = fs.watch(folderPath, (eventType, filename) => {
        events.push({
          timestamp: new Date().toISOString(),
          folder: folderPath,
          event: eventType,
          file: filename,
        });
        if (events.length > 100) events.shift();
      });
      watchers.set(folderPath, watcher);
      return { content: [{ type: 'text', text: `Started monitoring: ${folderPath}` }] };
    } else if (action === 'stop') {
      const watcher = watchers.get(folderPath);
      if (watcher) {
        watcher.close();
        watchers.delete(folderPath);
        return { content: [{ type: 'text', text: `Stopped monitoring: ${folderPath}` }] };
      }
      return { content: [{ type: 'text', text: `Not monitoring: ${folderPath}` }] };
    } else {
      const folderEvents = events.filter(e => e.folder === folderPath);
      return {
        content: [{ type: 'text', text: folderEvents.length > 0 
          ? JSON.stringify(folderEvents, null, 2)
          : 'No recent events for this folder.' }],
      };
    }
  },
};
