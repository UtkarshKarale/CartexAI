const si = require('systeminformation');

module.exports = {
  name: 'system_info',
  definition: {
    name: 'system_info',
    description: 'Get details about the system (RAM, CPU, storage, OS).',
    inputSchema: {
      type: 'object',
      properties: {
        compact: {
          type: 'boolean',
          description: 'Whether to return a compact version of the info.',
          default: false,
        },
      },
    },
  },
  handler: async (args) => {
    try {
      const cpu = await si.cpu();
      const mem = await si.mem();
      const os = await si.osInfo();
      const disk = await si.fsSize();

      const info = {
        os: `${os.distro} ${os.release} (${os.arch})`,
        cpu: `${cpu.manufacturer} ${cpu.brand} @ ${cpu.speed}GHz (${cpu.cores} cores)`,
        memory: {
          total: `${(mem.total / 1024 / 1024 / 1024).toFixed(2)} GB`,
          free: `${(mem.free / 1024 / 1024 / 1024).toFixed(2)} GB`,
          used: `${(mem.used / 1024 / 1024 / 1024).toFixed(2)} GB`,
        },
        storage: disk.map(d => ({
          fs: d.fs,
          type: d.type,
          size: `${(d.size / 1024 / 1024 / 1024).toFixed(2)} GB`,
          used: `${(d.used / 1024 / 1024 / 1024).toFixed(2)} GB`,
          mount: d.mount,
        })),
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(info, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching system info: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
