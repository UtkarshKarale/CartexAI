const fs = require('fs')
const path = require('path')

function flattenObject(obj, prefix = '') {
  const result = {}
  for (const [key, val] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key
    if (val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length < 10) {
      Object.assign(result, flattenObject(val, newKey))
    } else if (Array.isArray(val)) {
      result[newKey] = val.join(', ')
    } else {
      result[newKey] = val === null ? null : String(val)
    }
  }
  return result
}

function extractRows(parsed) {
  if (Array.isArray(parsed)) return parsed.map(item => typeof item === 'object' ? flattenObject(item) : { value: item })
  if (typeof parsed === 'object') {
    const keys = Object.keys(parsed)
    for (const key of keys) {
      if (Array.isArray(parsed[key])) return parsed[key].map(item => typeof item === 'object' ? flattenObject(item) : { [key]: item })
    }
    for (const key of keys) {
      if (typeof parsed[key] === 'object' && !Array.isArray(parsed[key])) {
        const inner = extractRows(parsed[key])
        if (inner.length > 0) return inner
      }
    }
    return [flattenObject(parsed)]
  }
  return [{ value: String(parsed) }]
}

module.exports = {
  name: 'xml_to_excel',
  definition: {
    name: 'xml_to_excel',
    description: 'Parse an XML file and convert it to an Excel workbook. Auto-detects the repeating record element and flattens nested nodes into columns. Works for any XML structure (API exports, data feeds, config files).',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the XML file.' },
        output_path: { type: 'string', description: 'Absolute path for the output .xlsx file.' },
        root_element: { type: 'string', description: 'Optional: XML element name containing the records. Auto-detected if omitted.' },
        sheet_name: { type: 'string', description: 'Sheet name in output. Default: "Data".' },
      },
      required: ['file_path', 'output_path'],
    },
  },
  handler: async (args) => {
    try {
      const filePath = path.resolve(args.file_path)
      if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`)
      const outputPath = path.resolve(args.output_path)

      const xml2js = require('xml2js')
      const xmlContent = fs.readFileSync(filePath, 'utf8')
      const parsed = await xml2js.parseStringPromise(xmlContent, { explicitArray: false, mergeAttrs: true, trim: true })

      let data = parsed
      if (args.root_element && parsed[args.root_element]) {
        data = parsed[args.root_element]
      } else {
        const rootKey = Object.keys(parsed)[0]
        if (rootKey) data = parsed[rootKey]
      }

      const rows = extractRows(data)
      if (rows.length === 0) throw new Error('No records found in XML. Try specifying root_element.')

      const ExcelJS = require('exceljs')
      const wb = new ExcelJS.Workbook()
      wb.creator = 'JiFiles XML Converter'
      const ws = wb.addWorksheet(args.sheet_name || 'Data')
      const headers = [...new Set(rows.flatMap(r => Object.keys(r)))]
      ws.columns = headers.map(h => ({ header: h, key: h, width: Math.min(30, Math.max(10, h.length + 4)) }))
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF366092' } }
      ws.addRows(rows)
      await wb.xlsx.writeFile(outputPath)

      const result = { source_xml: filePath, output_path: outputPath, records_converted: rows.length, columns: headers.length, column_names: headers, token_estimate: { tokens_used: Math.ceil(JSON.stringify({ records: rows.length, columns: headers }).length / 4), note: 'XML fully processed locally.' } }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true }
    }
  },
}
