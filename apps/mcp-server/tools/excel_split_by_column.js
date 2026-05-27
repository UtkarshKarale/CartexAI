const { validateFilePath, loadWorkbookData, sheetToRows } = require('../utils/excel-utils')
const path = require('path')

module.exports = {
  name: 'excel_split_by_column',
  definition: {
    name: 'excel_split_by_column',
    description: 'Split a large Excel sheet into multiple files (or sheets) based on unique values in a column. E.g. split a 12-month sheet into Jan.xlsx, Feb.xlsx... or by branch, department, vendor. Runs fully locally.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the source Excel file.' },
        sheet: { type: 'string', description: 'Sheet name. Defaults to first sheet.' },
        split_column: { type: 'string', description: 'Column name whose unique values define the split groups. E.g. "Month", "Branch", "Vendor".' },
        output_dir: { type: 'string', description: 'Directory where split files will be written.' },
        output_mode: { type: 'string', enum: ['files', 'sheets'], description: '"files" = one .xlsx per group (default). "sheets" = one workbook with one sheet per group.' },
        output_filename_prefix: { type: 'string', description: 'Prefix for output file names. Default: the split_column name.' },
      },
      required: ['file_path', 'split_column', 'output_dir'],
    },
  },
  handler: async (args) => {
    try {
      const filePath = validateFilePath(args.file_path)
      const outputDir = path.resolve(args.output_dir)
      const mode = args.output_mode || 'files'
      const prefix = args.output_filename_prefix || args.split_column

      const fs = require('fs')
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

      const wb = loadWorkbookData(filePath)
      const sheetName = args.sheet || wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      if (!ws) throw new Error(`Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(', ')}`)

      const rows = sheetToRows(ws)
      if (rows.length === 0) throw new Error('Sheet is empty')
      if (!Object.keys(rows[0]).includes(args.split_column)) throw new Error(`Column "${args.split_column}" not found. Available: ${Object.keys(rows[0]).join(', ')}`)

      const groups = new Map()
      for (const row of rows) {
        const key = String(row[args.split_column] ?? 'Unknown')
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(row)
      }

      const ExcelJS = require('exceljs')
      const filesCreated = []

      if (mode === 'sheets') {
        const outWb = new ExcelJS.Workbook()
        outWb.creator = 'JiFiles Split Engine'
        for (const [key, groupRows] of groups) {
          const safeName = key.replace(/[\\/:*?"<>|]/g, '_').slice(0, 31)
          const ws = outWb.addWorksheet(safeName)
          const headers = Object.keys(groupRows[0])
          ws.columns = headers.map(h => ({ header: h, key: h, width: Math.min(30, Math.max(10, h.length + 4)) }))
          ws.getRow(1).font = { bold: true }
          ws.addRows(groupRows)
        }
        const outFile = path.join(outputDir, `${prefix}_split.xlsx`)
        await outWb.xlsx.writeFile(outFile)
        filesCreated.push({ group: 'all', file: outFile, rows: rows.length })
      } else {
        for (const [key, groupRows] of groups) {
          const safeName = key.replace(/[\\/:*?"<>|]/g, '_')
          const outFile = path.join(outputDir, `${prefix}_${safeName}.xlsx`)
          const outWb = new ExcelJS.Workbook()
          const ws = outWb.addWorksheet(sheetName)
          const headers = Object.keys(groupRows[0])
          ws.columns = headers.map(h => ({ header: h, key: h, width: Math.min(30, Math.max(10, h.length + 4)) }))
          ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
          ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF366092' } }
          ws.addRows(groupRows)
          await outWb.xlsx.writeFile(outFile)
          filesCreated.push({ group: key, file: outFile, rows: groupRows.length })
        }
      }

      const result = { source: filePath, split_column: args.split_column, mode, groups_found: groups.size, output_dir: outputDir, files_created: filesCreated, token_estimate: { tokens_used: Math.ceil(JSON.stringify({ groups_found: groups.size, files: filesCreated.map(f => f.group) }).length / 4), note: 'All splitting done locally. Zero row data sent to AI.' } }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true }
    }
  },
}
