const fs = require('fs/promises');

// This would ideally be shared across tools. 
// For now, it's a simple global stack in this module.
const undoStack = [];

module.exports = {
  name: 'undo_action',
  definition: {
    name: 'undo_action',
    description: 'Revert the last reversible file operation (move, rename, trash).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  // This helper will be used by other tools to register undo actions
  registerUndo: (action) => {
    undoStack.push(action);
    if (undoStack.length > 50) undoStack.shift();
  },
  handler: async () => {
    if (undoStack.length === 0) {
      return { content: [{ type: 'text', text: 'Nothing to undo.' }] };
    }

    const lastAction = undoStack.pop();
    try {
      if (lastAction.type === 'rename' || lastAction.type === 'move') {
        await fs.rename(lastAction.to, lastAction.from);
        return { content: [{ type: 'text', text: `Undone: Moved/Renamed ${lastAction.to} back to ${lastAction.from}` }] };
      }
      // Add more undo types as needed
      return { content: [{ type: 'text', text: 'Action type not supported for undo.' }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Undo failed: ${error.message}` }], isError: true };
    }
  },
};
