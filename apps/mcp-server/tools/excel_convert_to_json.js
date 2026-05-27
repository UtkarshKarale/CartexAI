const { validateFilePath, loadWorkbookData, sheetToRows, estimateTokenSavings, getSheetDimensions } = require('../utils/excel-utils')
const fs = require('fs')
const path = require('path')

module.exports = {
  name: 'excel_convert_to_json',
  definition: {
    name: 'excel_convert_to_json',
    description: 'Convert an Excel workbook to structured JSON. Optionally save to a .json file. Useful for AI context, APIs, Tally integrations, and downstream processing.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the Excel file.' },
        sheet: { type: 'string', description: 'Specific sheet to convert. Omit to convert all sheets.' },
        output_path: { type: 'string', description: 'Optional path to save the JSON output file.' },
        max_rows: { type: 'number', description: 'Maximum rows per sheet to include. Default: all rows.' },
      },
      required: ['file_path'],
    },
  },
  handler: async (args) => {
    try {
      const filePath = validateFilePath(args.file_path)
      const wb = loadWorkbookData(filePath)
      const maxRows = args.max_rows ? Math.max(1, Number(args.max_rows)) : Infinity

      const targetSheets = args.sheet ? [args.sheet] : wb.SheetNames
      const jsonData = {}
      let totalRows = 0
      let totalCols = 0

      for (const sheetName of targetSheets) {
        const ws = wb.Sheets[sheetName]
        if (!ws) throw new Error(`Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(', ')}`)
        const dims = getSheetDimensions(ws)
        totalRows += dims.rows
        totalCols = Math.max(totalCols, dims.cols)
        const rows = sheetToRows(ws)
        jsonData[sheetName] = isFinite(maxRows) ? rows.slice(0, maxRows) : rows
      }

      if (args.output_path) {
        const outPath = path.resolve(args.output_path)
        fs.writeFileSync(outPath, JSON.stringify(jsonData, null, 2), 'utf8')
      }

      const sheetSummary = Object.entries(jsonData).map(([name, rows]) => ({ sheet: name, rows: rows.length }))
      const result = {
        sheets_converted: sheetSummary,
        output_path: args.output_path || null,
        data: jsonData,
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ ...result, token_estimate: estimateTokenSavings({ sheets_converted: sheetSummary }, totalRows, totalCols) }),
        }],
      }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true }
    }
  },
}
