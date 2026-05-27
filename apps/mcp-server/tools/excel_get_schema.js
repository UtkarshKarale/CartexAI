const { validateFilePath, loadWorkbookData, inferCellType, estimateTokenSavings, getSheetDimensions } = require('../utils/excel-utils')

module.exports = {
  name: 'excel_get_schema',
  definition: {
    name: 'excel_get_schema',
    description: 'Detect sheets, headers, column types, and table ranges in an Excel file. Always call this first before any other Excel tool. Returns only metadata — never sends raw data to AI.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the Excel (.xlsx/.xls/.csv) file.' },
      },
      required: ['file_path'],
    },
  },
  handler: async (args) => {
    try {
      const filePath = validateFilePath(args.file_path)
      const wb = loadWorkbookData(filePath, 3)

      const schema = {}
      let totalRows = 0
      let totalCols = 0

      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName]
        const dims = getSheetDimensions(ws)
        totalRows += dims.rows
        totalCols = Math.max(totalCols, dims.cols)

        const raw = require('xlsx').utils.sheet_to_json(ws, { header: 1, defval: null })
        const headers = (raw[0] || []).map(String)
        const sampleRow = raw[1] || []

        schema[sheetName] = {
          headers,
          column_count: headers.length,
          estimated_rows: dims.rows,
          range: ws['!ref'] || 'empty',
          column_types: headers.map((h, i) => ({ name: h, type: inferCellType(sampleRow[i]) })),
        }
      }

      const result = { sheets: wb.SheetNames, schema }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ ...result, token_estimate: estimateTokenSavings(result, totalRows, totalCols) }),
        }],
      }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true }
    }
  },
}
