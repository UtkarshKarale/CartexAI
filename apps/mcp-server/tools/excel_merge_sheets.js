const { validateFilePath, loadWorkbookData, sheetToRows } = require('../utils/excel-utils')
const path = require('path')

function colLetterToIndex(letter) {
  let index = 0
  const upper = letter.toUpperCase()
  for (let i = 0; i < upper.length; i++) {
    index = index * 26 + upper.charCodeAt(i) - 64
  }
  return index - 1
}

function selectColumns(rows, columns) {
  if (!columns || columns.length === 0) return rows

  const headers = rows.length > 0 ? Object.keys(rows[0]) : []

  const resolvedKeys = columns.map(col => {
    if (/^[A-Za-z]+$/.test(col) && col.length <= 3 && !headers.includes(col)) {
      const idx = colLetterToIndex(col)
      return headers[idx] !== undefined ? headers[idx] : null
    }
    return headers.includes(col) ? col : null
  }).filter(Boolean)

  return rows.map(row => {
    const result = {}
    for (const key of resolvedKeys) result[key] = row[key] ?? null
    return result
  })
}

function mergeByRow(sources) {
  const maxRows = Math.max(...sources.map(s => s.length))
  const merged = []
  for (let i = 0; i < maxRows; i++) {
    const row = {}
    for (const source of sources) {
      Object.assign(row, source[i] || {})
    }
    merged.push(row)
  }
  return merged
}

function mergeByKey(sources, joinKey) {
  const base = sources[0]
  const lookups = sources.slice(1).map(rows => {
    const map = new Map()
    for (const row of rows) {
      const k = String(row[joinKey] ?? '')
      if (k) map.set(k, row)
    }
    return map
  })

  return base.map(row => {
    const merged = { ...row }
    const keyVal = String(row[joinKey] ?? '')
    for (const lookup of lookups) {
      const match = lookup.get(keyVal)
      if (match) Object.assign(merged, match)
    }
    return merged
  })
}

module.exports = {
  name: 'excel_merge_sheets',
  definition: {
    name: 'excel_merge_sheets',
    description: 'Merge specific columns from multiple Excel files into a single output file — entirely locally, zero data sent to AI. Supports row-based merge (line up rows 1:1) and key-based join (like VLOOKUP/SQL JOIN on a shared column). Columns can be specified by letter (A, B) or header name.',
    inputSchema: {
      type: 'object',
      properties: {
        sources: {
          type: 'array',
          description: 'List of source files with column selections.',
          items: {
            type: 'object',
            properties: {
              file_path: { type: 'string', description: 'Absolute path to the Excel file.' },
              sheet: { type: 'string', description: 'Sheet name. Defaults to the first sheet.' },
              columns: {
                type: 'array',
                items: { type: 'string' },
                description: 'Columns to pick — use header names ("Invoice", "Amount") or Excel column letters ("A", "B"). Omit to include all columns.',
              },
            },
            required: ['file_path'],
          },
        },
        output_path: { type: 'string', description: 'Absolute path for the output .xlsx file.' },
        output_sheet: { type: 'string', description: 'Sheet name in the output file. Default: "Merged".' },
        join_type: {
          type: 'string',
          enum: ['row', 'key'],
          description: '"row" = align rows 1:1 across all files (default). "key" = join on a shared column value (like VLOOKUP).',
        },
        join_key: { type: 'string', description: 'Required when join_type is "key". The column name shared across all source files to join on.' },
      },
      required: ['sources', 'output_path'],
    },
  },
  handler: async (args) => {
    try {
      if (!Array.isArray(args.sources) || args.sources.length < 2) throw new Error('sources must have at least 2 files')

      const joinType = args.join_type || 'row'
      if (joinType === 'key' && !args.join_key) throw new Error('join_key is required when join_type is "key"')

      const loadedSources = []
      const sourceInfo = []

      for (const src of args.sources) {
        const filePath = validateFilePath(src.file_path)
        const wb = loadWorkbookData(filePath)
        const sheetName = src.sheet || wb.SheetNames[0]
        const ws = wb.Sheets[sheetName]
        if (!ws) throw new Error(`Sheet "${sheetName}" not found in ${src.file_path}`)

        const allRows = sheetToRows(ws)
        const selectedRows = selectColumns(allRows, src.columns)
        loadedSources.push(selectedRows)
        sourceInfo.push({
          file: path.basename(src.file_path),
          sheet: sheetName,
          columns_selected: src.columns || Object.keys(allRows[0] || {}),
          rows: allRows.length,
        })
      }

      const merged = joinType === 'key'
        ? mergeByKey(loadedSources, args.join_key)
        : mergeByRow(loadedSources)

      const ExcelJS = require('exceljs')
      const outputPath = path.resolve(args.output_path)
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet(args.output_sheet || 'Merged')

      if (merged.length > 0) {
        const headers = Object.keys(merged[0])
        ws.columns = headers.map(h => ({ header: h, key: h, width: Math.min(30, Math.max(12, h.length + 4)) }))
        const headerRow = ws.getRow(1)
        headerRow.eachCell(cell => {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
          cell.alignment = { vertical: 'middle' }
        })
        ws.addRows(merged)
        ws.views = [{ state: 'frozen', ySplit: 1 }]
      }

      await wb.xlsx.writeFile(outputPath)

      const result = {
        output_path: outputPath,
        join_type: joinType,
        join_key: args.join_key || null,
        output_rows: merged.length,
        output_columns: merged.length > 0 ? Object.keys(merged[0]) : [],
        sources: sourceInfo,
        token_estimate: {
          tokens_used: Math.ceil(JSON.stringify({ sources: sourceInfo, output_rows: merged.length }).length / 4),
          note: 'All merging done locally. Zero row data sent to AI.',
        },
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true }
    }
  },
}
