const path = require('path')

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF366092' } }
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
const ZEBRA_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F7FC' } }

module.exports = {
  name: 'excel_export_xlsx',
  definition: {
    name: 'excel_export_xlsx',
    description: 'Create or overwrite an Excel file from structured JSON data. Supports multiple sheets, bold headers with blue styling, zebra-stripe rows, and auto column widths.',
    inputSchema: {
      type: 'object',
      properties: {
        output_path: { type: 'string', description: 'Absolute path for the output .xlsx file.' },
        sheets: {
          type: 'object',
          description: 'Object where each key is a sheet name and value is an array of row objects. E.g. { "Sales": [{Invoice: "INV001", Amount: 5000}] }.',
        },
        auto_width: { type: 'boolean', description: 'Auto-fit column widths based on content. Default: true.' },
        zebra_rows: { type: 'boolean', description: 'Alternate row background colors. Default: true.' },
      },
      required: ['output_path', 'sheets'],
    },
  },
  handler: async (args) => {
    try {
      const ExcelJS = require('exceljs')
      const outputPath = path.resolve(args.output_path)
      const autoWidth = args.auto_width !== false
      const zebraRows = args.zebra_rows !== false

      if (typeof args.sheets !== 'object' || Array.isArray(args.sheets)) throw new Error('sheets must be an object with sheet names as keys')

      const wb = new ExcelJS.Workbook()
      wb.creator = 'JiFiles Excel Engine'
      wb.created = new Date()

      const sheetsCreated = []

      for (const [sheetName, rows] of Object.entries(args.sheets)) {
        if (!Array.isArray(rows)) throw new Error(`Sheet "${sheetName}" value must be an array of row objects`)
        const ws = wb.addWorksheet(sheetName)

        if (rows.length === 0) {
          sheetsCreated.push({ sheet: sheetName, rows: 0 })
          continue
        }

        const headers = Object.keys(rows[0])
        ws.columns = headers.map(h => ({ header: h, key: h, width: 15 }))

        const headerRow = ws.getRow(1)
        headerRow.eachCell(cell => {
          cell.fill = HEADER_FILL
          cell.font = HEADER_FONT
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
          cell.border = { bottom: { style: 'thin', color: { argb: 'FF1F4E79' } } }
        })

        rows.forEach((row, i) => {
          const excelRow = ws.addRow(row)
          if (zebraRows && i % 2 === 1) {
            excelRow.eachCell({ includeEmpty: true }, cell => { cell.fill = ZEBRA_FILL })
          }
        })

        if (autoWidth) {
          ws.columns.forEach(col => {
            const colValues = rows.map(r => String(r[col.key] ?? '')).concat([col.header])
            const maxLen = Math.max(...colValues.map(v => v.length))
            col.width = Math.min(60, Math.max(10, maxLen + 2))
          })
        }

        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } }
        ws.views = [{ state: 'frozen', ySplit: 1 }]

        sheetsCreated.push({ sheet: sheetName, rows: rows.length, columns: headers.length })
      }

      await wb.xlsx.writeFile(outputPath)

      const result = { output_path: outputPath, sheets_created: sheetsCreated, total_rows: sheetsCreated.reduce((s, x) => s + x.rows, 0) }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true }
    }
  },
}
