const { validateFilePath, loadWorkbookData, sheetToRows, estimateTokenSavings, getSheetDimensions } = require('../utils/excel-utils')

function aggregate(rows, groupByCol, aggregateCol, operations) {
  const groups = new Map()

  for (const row of rows) {
    const key = groupByCol ? String(row[groupByCol] ?? '__ungrouped__') : '__all__'
    if (!groups.has(key)) groups.set(key, [])
    if (aggregateCol) {
      const val = Number(row[aggregateCol])
      if (!isNaN(val)) groups.get(key).push(val)
    }
  }

  return Array.from(groups.entries()).map(([key, vals]) => {
    const entry = groupByCol ? { [groupByCol]: key } : {}
    entry.count = aggregateCol ? vals.length : rows.filter(r => String(r[groupByCol] ?? '') === key).length
    if (aggregateCol && vals.length > 0) {
      const sum = vals.reduce((a, b) => a + b, 0)
      if (operations.includes('sum')) entry.sum = parseFloat(sum.toFixed(4))
      if (operations.includes('avg')) entry.avg = parseFloat((sum / vals.length).toFixed(4))
      if (operations.includes('min')) entry.min = Math.min(...vals)
      if (operations.includes('max')) entry.max = Math.max(...vals)
    }
    return entry
  }).sort((a, b) => (b.sum ?? b.count) - (a.sum ?? a.count))
}

module.exports = {
  name: 'excel_generate_summary',
  definition: {
    name: 'excel_generate_summary',
    description: 'Generate aggregated summaries (group-by, sum, avg, min, max, count) from an Excel sheet. Runs entirely locally — no raw data sent to AI.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the Excel file.' },
        sheet: { type: 'string', description: 'Sheet name. Defaults to the first sheet.' },
        group_by: { type: 'string', description: 'Column name to group by (e.g. "Vendor", "Month"). Omit for totals only.' },
        aggregate_col: { type: 'string', description: 'Numeric column to aggregate (e.g. "Amount", "GST").' },
        operations: {
          type: 'array',
          items: { type: 'string', enum: ['sum', 'avg', 'min', 'max'] },
          description: 'Aggregation operations to compute. Defaults to ["sum", "avg", "min", "max"].',
        },
      },
      required: ['file_path'],
    },
  },
  handler: async (args) => {
    try {
      const filePath = validateFilePath(args.file_path)
      const wb = loadWorkbookData(filePath)
      const sheetName = args.sheet || wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      if (!ws) throw new Error(`Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(', ')}`)

      const dims = getSheetDimensions(ws)
      const rows = sheetToRows(ws)
      const operations = Array.isArray(args.operations) && args.operations.length > 0 ? args.operations : ['sum', 'avg', 'min', 'max']
      const summary = aggregate(rows, args.group_by, args.aggregate_col, operations)

      const result = {
        sheet: sheetName,
        total_rows_processed: rows.length,
        group_by: args.group_by || null,
        aggregate_col: args.aggregate_col || null,
        operations,
        summary,
      }
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
