const { validateFilePath, loadWorkbookData, sheetToRows, estimateTokenSavings, getSheetDimensions } = require('../utils/excel-utils')

module.exports = {
  name: 'excel_query_rows',
  definition: {
    name: 'excel_query_rows',
    description: 'Run a SQL SELECT query on an Excel sheet entirely in-memory using alasql. Use table name "data" in your SQL. Example: "SELECT * FROM data WHERE GST IS NULL". Never sends the full dataset to AI.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the Excel file.' },
        sheet: { type: 'string', description: 'Sheet name. Defaults to the first sheet.' },
        query: { type: 'string', description: 'SQL SELECT query. Use "data" as the table name. E.g. "SELECT * FROM data WHERE Amount > 1000 LIMIT 20".' },
      },
      required: ['file_path', 'query'],
    },
  },
  handler: async (args) => {
    try {
      const filePath = validateFilePath(args.file_path)
      const alasql = require('alasql')

      const wb = loadWorkbookData(filePath)
      const sheetName = args.sheet || wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      if (!ws) throw new Error(`Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(', ')}`)

      const dims = getSheetDimensions(ws)
      const rows = sheetToRows(ws)

      alasql.tables.data = { data: rows }
      const queryResult = alasql(args.query)

      const result = { sheet: sheetName, query: args.query, rows_matched: queryResult.length, rows: queryResult }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ ...result, token_estimate: estimateTokenSavings(result, dims.rows, dims.cols) }),
        }],
      }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true }
    }
  },
}
