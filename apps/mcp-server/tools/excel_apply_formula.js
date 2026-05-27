const { validateFilePath } = require('../utils/excel-utils')
const XLSX = require('xlsx')

function parseRange(rangeStr) {
  const parts = rangeStr.split(':')
  if (parts.length !== 2) throw new Error(`Invalid range "${rangeStr}". Use A1:D100 notation.`)
  const start = XLSX.utils.decode_cell(parts[0])
  const end = XLSX.utils.decode_cell(parts[1])
  return { startRow: start.r, endRow: end.r, startCol: start.c, endCol: end.c, startCell: parts[0], endCell: parts[1] }
}

function adjustFormula(formula, baseRow, currentRow) {
  return formula.replace(/([A-Z]+)(\d+)/g, (match, col, num) => {
    const adjusted = parseInt(num) + (currentRow - baseRow)
    return `${col}${adjusted}`
  })
}

module.exports = {
  name: 'excel_apply_formula',
  definition: {
    name: 'excel_apply_formula',
    description: 'Apply an Excel formula to a range of cells. Row numbers in the formula are automatically incremented per row. Example: formula "=B2*0.18" on range "D2:D5000" writes =B2*0.18, =B3*0.18, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the Excel file.' },
        sheet: { type: 'string', description: 'Sheet name. Defaults to the first sheet.' },
        formula: { type: 'string', description: 'Excel formula starting with "=". Row numbers are auto-incremented. E.g. "=B2*0.18" or "=SUM(A2:C2)".' },
        range: { type: 'string', description: 'Target cell range in A1:B100 notation. E.g. "D2:D5000".' },
      },
      required: ['file_path', 'formula', 'range'],
    },
  },
  handler: async (args) => {
    try {
      const filePath = validateFilePath(args.file_path)
      if (!args.formula.startsWith('=')) throw new Error('formula must start with "="')

      const wb = XLSX.readFile(filePath)
      const sheetName = args.sheet || wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      if (!ws) throw new Error(`Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(', ')}`)

      const { startRow, endRow, startCol, endCol } = parseRange(args.range)
      const baseRow = startRow + 1

      let cellsWritten = 0
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          const cellAddr = XLSX.utils.encode_cell({ r: row, c: col })
          const adjustedFormula = adjustFormula(args.formula, baseRow, row + 1)
          ws[cellAddr] = { t: 'n', f: adjustedFormula.replace(/^=/, '') }
          cellsWritten++
        }
      }

      const currentRef = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null
      const newEnd = { r: endRow, c: endCol }
      if (!currentRef || newEnd.r > currentRef.e.r || newEnd.c > currentRef.e.c) {
        const newStart = currentRef ? currentRef.s : { r: startRow, c: startCol }
        ws['!ref'] = XLSX.utils.encode_range({ s: newStart, e: { r: Math.max(currentRef?.e.r ?? 0, endRow), c: Math.max(currentRef?.e.c ?? 0, endCol) } })
      }

      XLSX.writeFile(wb, filePath)

      const result = { sheet: sheetName, formula: args.formula, range: args.range, cells_written: cellsWritten }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true }
    }
  },
}
