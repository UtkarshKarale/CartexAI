const fs = require('fs')
const path = require('path')

function parsePageRange(rangeStr, totalPages) {
  if (!rangeStr) return [1, totalPages]
  const m = rangeStr.trim().match(/^(\d+)(?:-(\d+))?$/)
  if (!m) return [1, totalPages]
  const start = parseInt(m[1])
  const end = m[2] ? parseInt(m[2]) : start
  return [Math.max(1, start), Math.min(end, totalPages)]
}

function scoreLine(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length < 4) return 0
  const segments = trimmed.split(/\s{2,}|\t/).filter(Boolean)
  if (segments.length < 2) return 0
  const numericCount = segments.filter(s => /^[\d,.\-$%]+$/.test(s.trim())).length
  const score = segments.length + numericCount * 0.5
  return score
}

function detectTableBlocks(lines, minCols) {
  const scored = lines.map((line, idx) => ({ line, idx, score: scoreLine(line), cols: line.trim().split(/\s{2,}|\t/).filter(Boolean).length }))

  const blocks = []
  let current = []

  for (let i = 0; i < scored.length; i++) {
    const s = scored[i]
    if (s.cols >= minCols) {
      current.push(s)
    } else if (current.length > 0) {
      if (s.line.trim() === '' && i + 1 < scored.length && scored[i + 1].cols >= minCols) {
        continue
      }
      if (current.length >= 2) blocks.push([...current])
      current = []
    }
  }
  if (current.length >= 2) blocks.push(current)
  return blocks
}

function parseColumns(line) {
  return line.trim().split(/\s{2,}|\t/).map(s => s.trim()).filter(Boolean)
}

function blockToTable(rows, tableIndex) {
  const allCols = rows.map(r => parseColumns(r.line))
  const headers = allCols[0]
  const dataRows = allCols.slice(1).map(cells => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = cells[i] ?? '' })
    return obj
  })
  return { name: `Table_${tableIndex + 1}`, headers, rows: dataRows, raw_row_count: rows.length }
}

module.exports = {
  name: 'pdf_extract_tables',
  definition: {
    name: 'pdf_extract_tables',
    description: 'Extract tables from a PDF file (text-based). Detects column-aligned rows, parses headers, and exports found tables to an Excel file. For scanned/image PDFs, use ocr_image first then pass extracted text. For general text extraction use pdf_read_content.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the PDF file.' },
        output_path: { type: 'string', description: 'Absolute path for the output .xlsx file.' },
        page_range: { type: 'string', description: 'Optional page range like "1-5" or "3". Default: all pages.' },
        min_columns: { type: 'number', description: 'Minimum columns to consider a row as table row (default 2).' },
      },
      required: ['file_path', 'output_path'],
    },
  },
  handler: async (args) => {
    const filePath = path.resolve(args.file_path)
    if (!fs.existsSync(filePath)) {
      return { content: [{ type: 'text', text: `File not found: ${filePath}` }], isError: true }
    }

    const outputPath = path.resolve(args.output_path)
    const minCols = Math.max(2, Number(args.min_columns) || 2)

    const pdfParse = require('pdf-parse')
    const buffer = fs.readFileSync(filePath)

    const pageTexts = []
    const data = await pdfParse(buffer, {
      pagerender: (pageData) => {
        return pageData.getTextContent().then((content) => {
          const items = content.items
          let lastY = null
          let text = ''
          for (const item of items) {
            if (lastY !== null && Math.abs(item.transform[5] - lastY) > 3) text += '\n'
            text += item.str
            if (item.hasEOL) text += '\n'
            lastY = item.transform[5]
          }
          pageTexts.push({ page: pageData.pageNumber, text: text.trim() })
          return text
        })
      },
    }).catch(async () => {
      const fallback = await pdfParse(buffer)
      pageTexts.length = 0
      pageTexts.push({ page: 1, text: fallback.text })
      return fallback
    })

    const totalPages = data.numpages || pageTexts.length || 1
    const [pageStart, pageEnd] = parsePageRange(args.page_range, totalPages)

    const relevantTexts = pageTexts.length > 0
      ? pageTexts.filter(p => p.page >= pageStart && p.page <= pageEnd)
      : [{ page: 1, text: data.text || '' }]

    const allLines = relevantTexts.flatMap(p => p.text.split('\n'))
    const blocks = detectTableBlocks(allLines, minCols)
    const tables = blocks.map((rows, i) => blockToTable(rows, i))

    const ExcelJS = require('exceljs')
    const wb = new ExcelJS.Workbook()
    wb.creator = 'JiFiles PDF Extractor'

    if (tables.length === 0) {
      const ws = wb.addWorksheet('No_Tables_Found')
      ws.addRow(['No structured tables detected in the selected page range.'])
      ws.addRow(['Tip: For scanned PDFs, use ocr_image first. For general text, use pdf_read_content.'])
    }

    for (const table of tables) {
      if (table.rows.length === 0) continue
      const ws = wb.addWorksheet(table.name.slice(0, 31))
      ws.columns = table.headers.map(h => ({ header: h, key: h, width: Math.min(40, Math.max(12, h.length + 4)) }))
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF366092' } }
      ws.addRows(table.rows)
    }

    await wb.xlsx.writeFile(outputPath)

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          source_pdf: filePath,
          total_pages: totalPages,
          pages_scanned: `${pageStart}-${pageEnd}`,
          tables_found: tables.length,
          tables: tables.map(t => ({ name: t.name, rows: t.rows.length, columns: t.headers.length, headers: t.headers })),
          output_path: outputPath,
          tip: tables.length === 0 ? 'No tables found. If this is a scanned PDF, use ocr_image first. For text content, try pdf_read_content.' : undefined,
        }),
      }],
    }
  },
}
