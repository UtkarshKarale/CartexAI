const XLSX = require('xlsx')
const path = require('path')
const fs = require('fs')

function validateFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') throw new Error('file_path is required')
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) throw new Error(`File not found: ${resolved}`)
  return resolved
}

function loadWorkbookData(filePath, sheetRows) {
  const opts = sheetRows ? { sheetRows } : {}
  return XLSX.readFile(filePath, opts)
}

function sheetToRows(ws) {
  return XLSX.utils.sheet_to_json(ws, { defval: null })
}

function inferCellType(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (value instanceof Date) return 'date'
  const str = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return 'date'
  if (!isNaN(Number(str)) && str.trim() !== '') return 'number'
  return 'string'
}

function estimateTokenSavings(returnedData, totalRows, totalCols) {
  const returnedStr = JSON.stringify(returnedData)
  const tokensUsed = Math.ceil(returnedStr.length / 4)
  const fullFileTokens = Math.ceil((totalRows * totalCols * 15) / 4)
  const tokensSaved = Math.max(0, fullFileTokens - tokensUsed)
  const efficiencyPct = fullFileTokens > 0 ? Math.round((tokensSaved / fullFileTokens) * 100) : 0
  return {
    tokens_used: tokensUsed,
    tokens_saved: tokensSaved,
    full_file_estimated_tokens: fullFileTokens,
    efficiency_pct: `${efficiencyPct}%`,
    note: `AI saw ${tokensUsed} tokens instead of ~${fullFileTokens} — ${efficiencyPct}% reduction`,
  }
}

function getSheetDimensions(ws) {
  const ref = ws['!ref']
  if (!ref) return { rows: 0, cols: 0 }
  const range = XLSX.utils.decode_range(ref)
  return { rows: range.e.r, cols: range.e.c + 1 }
}

module.exports = { validateFilePath, loadWorkbookData, sheetToRows, inferCellType, estimateTokenSavings, getSheetDimensions }
