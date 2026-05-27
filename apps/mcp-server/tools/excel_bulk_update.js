const { validateFilePath } = require('../utils/excel-utils')
const XLSX = require('xlsx')

module.exports = {
  name: 'excel_bulk_update',
  definition: {
    name: 'excel_bulk_update',
    description: 'Update multiple cells in an Excel file in a single batch write. Always batch updates — never send one-cell-per-request. Preserves all other data.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the Excel file.' },
        sheet: { type: 'string', description: 'Sheet name. Defaults to the first sheet.' },
        updates: {
          type: 'array',
          description: 'Array of cell updates.',
          items: {
            type: 'object',
            properties: {
              cell: { type: 'string', description: 'Cell address in A1 notation, e.g. "D2".' },
              value: { description: 'New cell value (string, number, boolean, or null to clear).' },
            },
            required: ['cell', 'value'],
          },
        },
      },
      required: ['file_path', 'updates'],
    },
  },
  handler: async (args) => {
    try {
      const filePath = validateFilePath(args.file_path)
      if (!Array.isArray(args.updates) || args.updates.length === 0) throw new Error('updates array is required and must not be empty')

      const wb = XLSX.readFile(filePath)
      const sheetName = args.sheet || wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      if (!ws) throw new Error(`Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(', ')}`)

      const applied = []
      const failed = []

      for (const update of args.updates) {
        try {
          const cell = XLSX.utils.decode_cell(update.cell)
          if (!ws[update.cell]) {
            ws[update.cell] = {}
          }
          if (update.value === null || update.value === undefined) {
            delete ws[update.cell]
          } else {
            ws[update.cell] = { v: update.value, t: typeof update.value === 'number' ? 'n' : 's' }
          }
          applied.push(update.cell)
        } catch (cellErr) {
          failed.push({ cell: update.cell, reason: cellErr.message })
        }
      }

      XLSX.writeFile(wb, filePath)

      const result = { sheet: sheetName, applied_count: applied.length, failed_count: failed.length, applied, failed }
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true }
    }
  },
}
