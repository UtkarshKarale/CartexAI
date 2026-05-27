const { validateFilePath, loadWorkbookData, sheetToRows, estimateTokenSavings, getSheetDimensions } = require('../utils/excel-utils')

const BUILTIN_PATTERNS = {
  pan: { pattern: '^[A-Z]{5}[0-9]{4}[A-Z]{1}$', description: 'PAN: 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F)' },
  gstin: { pattern: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', description: 'GSTIN: 15-char GST Identification Number' },
  email: { pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', description: 'Email address' },
  phone: { pattern: '^[6-9][0-9]{9}$', description: 'Indian 10-digit mobile number' },
  pincode: { pattern: '^[1-9][0-9]{5}$', description: 'Indian 6-digit PIN code' },
  date_dmy: { pattern: '^(0?[1-9]|[12][0-9]|3[01])[\\/\\-](0?[1-9]|1[0-2])[\\/\\-]([0-9]{2,4})$', description: 'Date in DD/MM/YYYY or DD-MM-YYYY' },
  date_iso: { pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$', description: 'Date in YYYY-MM-DD (ISO 8601)' },
  ifsc: { pattern: '^[A-Z]{4}0[A-Z0-9]{6}$', description: 'IFSC bank code' },
  positive_number: { pattern: '^[0-9]+(\\.[0-9]+)?$', description: 'Positive number (integer or decimal)' },
}

module.exports = {
  name: 'excel_validate_formats',
  definition: {
    name: 'excel_validate_formats',
    description: 'Validate Excel column values against regex patterns. Built-in patterns: pan, gstin, email, phone, pincode, date_dmy, date_iso, ifsc, positive_number. Or supply your own regex. Returns invalid row numbers and sample bad values.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the Excel file.' },
        sheet: { type: 'string', description: 'Sheet name. Defaults to first sheet.' },
        validations: {
          type: 'array',
          description: 'Validation rules to apply.',
          items: {
            type: 'object',
            properties: {
              column: { type: 'string', description: 'Column header name to validate.' },
              pattern: { type: 'string', description: 'Built-in pattern name (pan, gstin, email, phone, pincode, date_dmy, date_iso, ifsc, positive_number) OR a custom regex string.' },
              allow_empty: { type: 'boolean', description: 'Skip empty/null cells. Default: true.' },
            },
            required: ['column', 'pattern'],
          },
        },
      },
      required: ['file_path', 'validations'],
    },
  },
  handler: async (args) => {
    try {
      const filePath = validateFilePath(args.file_path)
      if (!Array.isArray(args.validations) || args.validations.length === 0) throw new Error('validations array is required')

      const wb = loadWorkbookData(filePath)
      const sheetName = args.sheet || wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      if (!ws) throw new Error(`Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(', ')}`)

      const dims = getSheetDimensions(ws)
      const rows = sheetToRows(ws)
      const results = []

      for (const rule of args.validations) {
        const builtin = BUILTIN_PATTERNS[rule.pattern]
        const regex = new RegExp(builtin ? builtin.pattern : rule.pattern, 'i')
        const allowEmpty = rule.allow_empty !== false
        const invalid = []

        rows.forEach((row, i) => {
          const val = row[rule.column]
          if ((val === null || val === undefined || val === '') && allowEmpty) return
          if (!regex.test(String(val ?? ''))) {
            invalid.push({ row: i + 2, value: val })
          }
        })

        results.push({
          column: rule.column,
          pattern: rule.pattern,
          pattern_description: builtin?.description || 'Custom regex',
          total_checked: rows.filter(r => allowEmpty ? (r[rule.column] !== null && r[rule.column] !== '') : true).length,
          invalid_count: invalid.length,
          invalid_rows: invalid.slice(0, 50),
          sample_bad_values: [...new Set(invalid.slice(0, 5).map(x => String(x.value)))],
        })
      }

      const result = { sheet: sheetName, total_rows: rows.length, validations: results, token_estimate: estimateTokenSavings({ validations: results }, dims.rows, dims.cols) }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true }
    }
  },
}
