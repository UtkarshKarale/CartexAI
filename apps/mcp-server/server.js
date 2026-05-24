const Fastify = require('fastify');
const cors = require('@fastify/cors');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { 
  ListToolsRequestSchema, 
  CallToolRequestSchema,
  ErrorCode,
  McpError 
} = require('@modelcontextprotocol/sdk/types.js');
const fs = require('fs');
const path = require('path');
const { aiDecide } = require('./ai-decide');
const { geminiDecide } = require('./gemini-decide');

const app = Fastify();
app.register(cors);

// Initialize MCP Server
const server = new Server(
  {
    name: 'jifile-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Stores for tools
const tools = new Map();

/**
 * Dynamically load tools from the tools/ directory
 */
async function loadTools() {
  const toolsDir = path.join(__dirname, 'tools');
  if (!fs.existsSync(toolsDir)) return;

  const files = fs.readdirSync(toolsDir, { recursive: true });
  for (const file of files) {
    if (file.endsWith('.js')) {
      try {
        const toolModule = require(path.join(toolsDir, file));
        if (toolModule.name && toolModule.definition) {
          tools.set(toolModule.name, toolModule);
          console.log(`Loaded tool: ${toolModule.name}`);
        }
      } catch (error) {
        console.error(`Failed to load tool from ${file}:`, error);
      }
    }
  }
}

// Register MCP handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: Array.from(tools.values()).map(t => t.definition),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = tools.get(name);

  if (!tool) {
    throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
  }

  try {
    const result = await tool.handler(args);
    // Log activity
    fs.appendFileSync('activity.log', `${new Date().toISOString()} - Executed ${name}\n`);
    return result;
  } catch (error) {
    console.error(`Error executing tool ${name}:`, error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// SSE Transport Routes
let transport;

app.get('/sse', async (request, reply) => {
  transport = new SSEServerTransport('/message', reply.raw);
  await server.connect(transport);
});

app.post('/message', async (request, reply) => {
  if (!transport) {
    reply.code(400).send('No active SSE connection');
    return;
  }
  await transport.handlePostMessage(request.raw, reply.raw);
});

app.get('/', async () => {
  return {
    status: 'XFile MCP Running 🚀',
    toolsLoaded: tools.size
  };
});

app.get('/api/tools', async () => {
  return {
    tools: Array.from(tools.values()).map(t => t.definition),
  };
});

app.post('/api/call/:name', async (request, reply) => {
  const { name } = request.params;
  const tool = tools.get(name);
  if (!tool) {
    reply.code(404).send({ error: `Tool not found: ${name}` });
    return;
  }
  try {
    const result = await tool.handler(request.body ?? {});
    fs.appendFileSync('activity.log', `${new Date().toISOString()} - REST call: ${name}\n`);
    return result;
  } catch (error) {
    reply.code(500).send({ error: error.message });
  }
});

async function decide(query, provider) {
  if (provider === 'gemini-cli') {
    try {
      const result = await geminiDecide(query, tools);
      if (result) return result;
    } catch (e) {
      console.warn('Gemini CLI failed:', e.message);
    }
  }
  try {
    return await aiDecide(query, tools);
  } catch (e) {
    console.warn('Local LLM failed:', e.message);
    return null;
  }
}

app.post('/api/route', async (request, reply) => {
  const { query, provider } = request.body ?? {};
  if (!query) { reply.code(400).send({ error: 'query is required' }); return; }

  const decision = await decide(query, provider);
  if (!decision) { reply.code(422).send({ error: 'Could not understand intent.' }); return; }

  return decision;
});

app.post('/api/chat', async (request, reply) => {
  const { query, provider } = request.body ?? {};
  if (!query) { reply.code(400).send({ error: 'query is required' }); return; }

  const decision = await decide(query, provider);
  if (!decision) { reply.code(422).send({ error: 'Could not understand intent.' }); return; }

  const tool = tools.get(decision.tool);
  const result = await tool.handler(decision.args);
  fs.appendFileSync('activity.log', `${new Date().toISOString()} - [${decision.provider ?? 'local'}] ${decision.tool} ${JSON.stringify(decision.args)}\n`);

  return { tool: decision.tool, args: decision.args, result, provider: decision.provider ?? 'local' };
});

const start = async () => {
  try {
    await loadTools();
    await app.listen({ port: 4000, host: '0.0.0.0' });
    console.log('MCP Server Running on http://localhost:4000');
    console.log('SSE endpoint: http://localhost:4000/sse');
    console.log('Message endpoint: http://localhost:4000/message');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
