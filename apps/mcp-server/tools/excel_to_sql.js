const { validateFilePath, loadWorkbookData, sheetToRows, inferCellType, getSheetDimensions } = require('../utils/excel-utils')
const fs = require('fs')
const path = require('path')

function toSqlType(jsType) {
  if (jsType === 'number') return 'DECIMAL(18,4)'
  if (jsType === 'boolean') return 'BOOLEAN'
  if (jsType === 'date') return 'DATE'
  return 'VARCHAR(500)'
}

function toSqlIdentifier(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&').toLowerCase()
}

function escapeSqlValue(val) {
  if (val === null || val === undefined) return 'NULL'
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
  return `'${String(val).replace(/'/g, "''")}'`
}

module.exports = {
  name: 'excel_to_sql',
  definition: {
    name: 'excel_to_sql',
    description: 'Convert an Excel sheet into SQL DDL (CREATE TABLE) + DML (INSERT statements). Supports MySQL, PostgreSQL, SQLite dialects. Optionally saves to a .sql file. Useful for loading Excel data into a database.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the Excel file.' },
        sheet: { type: 'string', description: 'Sheet name. Defaults to first sheet.' },
        table_name: { type: 'string', description: 'SQL table name. Defaults to the sheet name (sanitised).' },
        dialect: { type: 'string', enum: ['mysql', 'postgresql', 'sqlite'], description: 'SQL dialect. Default: mysql.' },
        include_create: { type: 'boolean', description: 'Include CREATE TABLE statement. Default: true.' },
        include_inserts: { type: 'boolean', description: 'Include INSERT statements. Default: true.' },
        batch_size: { type: 'number', description: 'Rows per INSERT batch statement. Default: 100.' },
        output_path: { type: 'string', description: 'Optional: save SQL to this .sql file path.' },
      },
      required: ['file_path'],
    },
  },
  handler: async (args) => {
    try {
      const filePath = validateFilePath(args.file_path)
      const dialect = args.dialect || 'mysql'
      const batchSize = Math.max(1, Number(args.batch_size) || 100)
      const includeCreate = args.include_create !== false
      const includeInserts = args.include_inserts !== false

      const wb = loadWorkbookData(filePath)
      const sheetName = args.sheet || wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      if (!ws) throw new Error(`Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(', ')}`)

      const dims = getSheetDimensions(ws)
      const rows = sheetToRows(ws)
      if (rows.length === 0) throw new Error('Sheet is empty')

      const tableName = toSqlIdentifier(args.table_name || sheetName)
      const headers = Object.keys(rows[0])
      const sampleRow = rows[0]
      const columnDefs = headers.map(h => {
        const sqlType = toSqlType(inferCellType(sampleRow[h]))
        const colName = toSqlIdentifier(h)
        return { original: h, sql_name: colName, sql_type: sqlType }
      })

      const q = dialect === 'mysql' ? '`' : '"'
      const lines = []

      if (includeCreate) {
        if (dialect === 'mysql') lines.push(`CREATE TABLE IF NOT EXISTS ${q}${tableName}${q} (`)
        else if (dialect === 'postgresql') lines.push(`CREATE TABLE IF NOT EXISTS ${q}${tableName}${q} (`)
        else lines.push(`CREATE TABLE IF NOT EXISTS ${q}${tableName}${q} (`)
        lines.push(`  id INTEGER PRIMARY KEY ${ dialect === 'postgresql' ? 'GENERATED ALWAYS AS IDENTITY' : dialect === 'sqlite' ? 'AUTOINCREMENT' : 'AUTO_INCREMENT'},`)
        columnDefs.forEach((col, i) => {
          const comma = i < columnDefs.length - 1 ? ',' : ''
          lines.push(`  ${q}${col.sql_name}${q} ${col.sql_type}${comma}`)
        })
        lines.push(');')
        lines.push('')
      }

      if (includeInserts) {
        const colList = columnDefs.map(c => `${q}${c.sql_name}${q}`).join(', ')
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize)
          const valuesList = batch.map(row => `(${columnDefs.map(c => escapeSqlValue(row[c.original])).join(', ')})`).join(',\n  ')
          lines.push(`INSERT INTO ${q}${tableName}${q} (${colList}) VALUES`)
          lines.push(`  ${valuesList};`)
          lines.push('')
        }
      }

      const sql = lines.join('\n')

      if (args.output_path) {
        const outPath = path.resolve(args.output_path)
        fs.writeFileSync(outPath, sql, 'utf8')
      }

      const result = {
        table_name: tableName,
        dialect,
        total_rows: rows.length,
        columns: columnDefs,
        output_path: args.output_path || null,
        sql_preview: sql.slice(0, 500) + (sql.length > 500 ? '\n... (truncated)' : ''),
        token_estimate: { tokens_used: Math.ceil(JSON.stringify({ table_name: tableName, columns: columnDefs, total_rows: rows.length }).length / 4), full_file_estimated_tokens: Math.ceil((dims.rows * dims.cols * 15) / 4), note: 'Schema metadata returned. Full data only in saved .sql file.' },
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true }
    }
  },
}
