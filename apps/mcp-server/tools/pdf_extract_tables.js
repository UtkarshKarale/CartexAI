const fs = require('fs')
const path = require('path')

function detectTableRows(lines) {
  return lines.filter(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length < 5) return false
    const segments = trimmed.split(/\s{2,}|\t/).filter(Boolean)
    return segments.length >= 2
  })
}

function parseTableToObjects(rows) {
  if (rows.length < 2) return []
  const headers = rows[0].split(/\s{2,}|\t/).map(h => h.trim()).filter(Boolean)
  return rows.slice(1).map(row => {
    const cells = row.split(/\s{2,}|\t/).map(c => c.trim()).filter(Boolean)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = cells[i] ?? null })
    return obj
  })
}

function groupIntoTables(tableRows, allLines) {
  const tables = []
  let current = []
  let lastIdx = -2

  for (const line of tableRows) {
    const idx = allLines.indexOf(line)
    if (idx - lastIdx > 3 && current.length > 0) {
      tables.push([...current])
      current = []
    }
    current.push(line)
    lastIdx = idx
  }
  if (current.length > 0) tables.push(current)
  return tables.filter(t => t.length >= 2)
}

module.exports = {
  name: 'pdf_extract_tables',
  definition: {
    name: 'pdf_extract_tables',
    description: 'Extract tables from a PDF file (text-based or OCR-processed). Detects column-aligned rows, parses headers, and exports all found tables to an Excel file. For scanned PDFs, pre-process with ocr_image first.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the PDF file.' },
        output_path: { type: 'string', description: 'Absolute path for the output .xlsx file.' },
        page_range: { type: 'string', description: 'Optional page range like "1-5" or "3". Default: all pages.' },
        min_columns: { type: 'number', description: 'Minimum columns for a row to be considered a table row. Default: 2.' },
      },
      required: ['file_path', 'output_path'],
    },
  },
  handler: async (args) => {
    try {
      const filePath = path.resolve(args.file_path)
      if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`)
      const outputPath = path.resolve(args.output_path)
      const minCols = Math.max(2, Number(args.min_columns) || 2)

      const pdfParse = require('pdf-parse')
      const buffer = fs.readFileSync(filePath)
      const data = await pdfParse(buffer)

      const allLines = data.text.split('\n')
      const tableRows = detectTableRows(allLines).filter(line => {
        const segs = line.split(/\s{2,}|\t/).filter(Boolean)
        return segs.length >= minCols
      })

      const tables = groupIntoTables(tableRows, allLines)
      const parsedTables = tables.map((rows, i) => ({
        name: `Table_${i + 1}`,
        rows: parseTableToObjects(rows),
        raw_rows: rows.length,
      }))

      const ExcelJS = require('exceljs')
      const wb = new ExcelJS.Workbook()
      wb.creator = 'JiFiles PDF Extractor'

      for (const table of parsedTables) {
        if (table.rows.length === 0) continue
        const ws = wb.addWorksheet(table.name)
        const headers = Object.keys(table.rows[0])
        ws.columns = headers.map(h => ({ header: h, key: h, width: Math.min(30, Math.max(12, h.length + 4)) }))
        ws.getRow(1).font = { bold: true }
        ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF366092' } }
        ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
        ws.addRows(table.rows)
      }

      await wb.xlsx.writeFile(outputPath)

      const result = {
        source_pdf: filePath,
        pages: data.numpages,
        tables_found: parsedTables.length,
        tables: parsedTables.map(t => ({ name: t.name, rows: t.rows.length, columns: t.rows[0] ? Object.keys(t.rows[0]).length : 0 })),
        output_path: outputPath,
        token_estimate: {
          tokens_used: Math.ceil(JSON.stringify({ tables_found: parsedTables.length, tables: parsedTables.map(t => t.name) }).length / 4),
          note: 'PDF processed locally. Only table metadata sent to AI.',
        },
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true }
    }
  },
}
