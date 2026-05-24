const { spawn } = require('child_process');

const sessions = new Map();

module.exports = {
  name: 'terminal_session',
  definition: {
    name: 'terminal_session',
    description: 'Persistent terminal execution (start session or send command).',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Unique session identifier.' },
        command: { type: 'string', description: 'Command to send to the session.' },
        action: { type: 'string', enum: ['start', 'send', 'close'], default: 'send' },
      },
      required: ['sessionId'],
    },
  },
  handler: async (args) => {
    const { sessionId, command, action } = args;

    if (action === 'start') {
      const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
      const child = spawn(shell, [], { stdio: ['pipe', 'pipe', 'pipe'] });
      
      let output = '';
      child.stdout.on('data', (data) => { output += data.toString(); });
      child.stderr.on('data', (data) => { output += data.toString(); });

      sessions.set(sessionId, { child, output: () => output });
      return { content: [{ type: 'text', text: `Terminal session ${sessionId} started.` }] };
    } else if (action === 'close') {
      const session = sessions.get(sessionId);
      if (session) {
        session.child.kill();
        sessions.delete(sessionId);
        return { content: [{ type: 'text', text: `Session ${sessionId} closed.` }] };
      }
      return { content: [{ type: 'text', text: 'Session not found.' }] };
    } else {
      const session = sessions.get(sessionId);
      if (!session) return { content: [{ type: 'text', text: 'Session not found. Start it first.' }], isError: true };

      session.child.stdin.write(`${command}\n`);
      // Wait a bit for output
      await new Promise(resolve => setTimeout(resolve, 500));
      return { content: [{ type: 'text', text: session.output() }] };
    }
  },
};
