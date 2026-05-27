const { validateFilePath } = require('../utils/excel-utils')
const XLSX = require('xlsx')

const ERROR_TYPES = { '#REF!': 'Broken reference', '#DIV/0!': 'Division by zero', '#N/A': 'Value not available', '#NAME?': 'Unrecognised formula name', '#NULL!': 'Null intersection', '#NUM!': 'Invalid number', '#VALUE!': 'Wrong value type' }

module.exports = {
  name: 'excel_scan_formula_errors',
  definition: {
    name: 'excel_scan_formula_errors',
    description: 'Scan all cells in an Excel workbook for formula errors (#REF!, #DIV/0!, #N/A, #NAME?, #VALUE!, etc.). Returns exact cell addresses, error types, and counts per sheet.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the Excel file.' },
        sheet: { type: 'string', description: 'Specific sheet to scan. Omit to scan all sheets.' },
      },
      required: ['file_path'],
    },
  },
  handler: async (args) => {
    try {
      const filePath = validateFilePath(args.file_path)
      const wb = XLSX.readFile(filePath)
      const targetSheets = args.sheet ? [args.sheet] : wb.SheetNames

      const report = {}
      let totalErrors = 0

      for (const sheetName of targetSheets) {
        const ws = wb.Sheets[sheetName]
        if (!ws) throw new Error(`Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(', ')}`)

        const errors = []
        for (const [addr, cell] of Object.entries(ws)) {
          if (addr.startsWith('!')) continue
          const isError = cell.t === 'e' || (typeof cell.v === 'string' && ERROR_TYPES[cell.v])
          if (isError) {
            const errorText = cell.t === 'e' ? XLSX.utils.format_error(cell) : cell.v
            errors.push({
              cell: addr,
              error: errorText || '#ERR',
              description: ERROR_TYPES[errorText] || 'Formula error',
              formula: cell.f ? `=${cell.f}` : null,
            })
          }
        }

        report[sheetName] = { error_count: errors.length, errors }
        totalErrors += errors.length
      }

      const summary = Object.entries(report).map(([sheet, data]) => ({ sheet, error_count: data.error_count }))
      const result = { total_errors: totalErrors, summary, sheets: report, token_estimate: { tokens_used: Math.ceil(JSON.stringify({ totalErrors, summary }).length / 4), note: 'Only error metadata returned, not full sheet data.' } }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true }
    }
  },
}
