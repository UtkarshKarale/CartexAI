const { validateFilePath, loadWorkbookData, sheetToRows, estimateTokenSavings, getSheetDimensions } = require('../utils/excel-utils')

function detectAnomalies(rows, outlierThreshold) {
  if (rows.length === 0) return { empty_rows: [], missing_values: {}, duplicates: [], outliers: [], stats: {} }

  const headers = Object.keys(rows[0])
  const emptyRows = []
  const missingValues = {}
  const seen = new Map()
  const duplicates = []
  const outliers = []
  const stats = {}

  const numericCols = {}
  headers.forEach(h => { numericCols[h] = [] })

  rows.forEach((row, i) => {
    const rowNum = i + 2
    const allEmpty = headers.every(h => row[h] === null || row[h] === '' || row[h] === undefined)
    if (allEmpty) emptyRows.push(rowNum)

    headers.forEach(h => {
      if (row[h] === null || row[h] === '' || row[h] === undefined) {
        if (!missingValues[h]) missingValues[h] = []
        missingValues[h].push(rowNum)
      }
      const num = Number(row[h])
      if (!isNaN(num) && row[h] !== null && row[h] !== '') numericCols[h].push({ row: rowNum, val: num })
    })

    const key = headers.map(h => String(row[h] ?? '')).join('||')
    if (seen.has(key)) {
      duplicates.push({ row: rowNum, duplicate_of: seen.get(key) })
    } else {
      seen.set(key, rowNum)
    }
  })

  const threshold = Number(outlierThreshold) > 0 ? Number(outlierThreshold) : 5
  headers.forEach(h => {
    const vals = numericCols[h]
    if (vals.length < 3) return
    const avg = vals.reduce((s, x) => s + x.val, 0) / vals.length
    const stdVals = vals.map(x => (x.val - avg) ** 2)
    const std = Math.sqrt(stdVals.reduce((s, x) => s + x, 0) / vals.length)
    stats[h] = { avg: parseFloat(avg.toFixed(4)), std: parseFloat(std.toFixed(4)), count: vals.length }
    vals.forEach(({ row, val }) => {
      if (Math.abs(val - avg) > threshold * std && avg !== 0) {
        outliers.push({ row, column: h, value: val, avg: parseFloat(avg.toFixed(2)), deviation: parseFloat(((val - avg) / std).toFixed(2)) })
      }
    })
  })

  return { empty_rows: emptyRows, missing_values: missingValues, duplicates, outliers, stats }
}

module.exports = {
  name: 'excel_detect_anomalies',
  definition: {
    name: 'excel_detect_anomalies',
    description: 'Scan an Excel sheet for data quality issues: empty rows, missing values, duplicate rows, and statistical outliers. Fully deterministic — no AI needed.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the Excel file.' },
        sheet: { type: 'string', description: 'Sheet name. Defaults to the first sheet.' },
        outlier_threshold: { type: 'number', description: 'Standard deviations from mean to flag as outlier. Default: 5.' },
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
      const anomalies = detectAnomalies(rows, args.outlier_threshold)

      const summary = {
        empty_row_count: anomalies.empty_rows.length,
        duplicate_count: anomalies.duplicates.length,
        outlier_count: anomalies.outliers.length,
        columns_with_missing: Object.keys(anomalies.missing_values).length,
      }

      const result = { sheet: sheetName, total_rows: rows.length, summary, anomalies }
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
