const { validateFilePath, loadWorkbookData, sheetToRows, estimateTokenSavings, getSheetDimensions } = require('../utils/excel-utils')

module.exports = {
  name: 'excel_read_sample_rows',
  definition: {
    name: 'excel_read_sample_rows',
    description: 'Read a small sample of rows from a specific sheet. Use to understand data structure without sending the full file to AI. Default: 5 rows.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the Excel file.' },
        sheet: { type: 'string', description: 'Sheet name. Defaults to the first sheet.' },
        limit: { type: 'number', description: 'Number of rows to return (1–50). Default: 5.' },
        offset: { type: 'number', description: 'Row offset (skip first N rows). Default: 0.' },
      },
      required: ['file_path'],
    },
  },
  handler: async (args) => {
    try {
      const filePath = validateFilePath(args.file_path)
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 5))
      const offset = Math.max(0, Number(args.offset) || 0)

      const wb = loadWorkbookData(filePath, offset + limit + 1)
      const sheetName = args.sheet || wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      if (!ws) throw new Error(`Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(', ')}`)

      const fullDims = getSheetDimensions(ws)
      const rows = sheetToRows(ws).slice(offset, offset + limit)

      const result = { sheet: sheetName, offset, limit, rows_returned: rows.length, rows }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ ...result, token_estimate: estimateTokenSavings(result, fullDims.rows, fullDims.cols) }),
        }],
      }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true }
    }
  },
}
