import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

type SQLiteValue = string | number | boolean | null

export class SQLiteCliDatabase {
  constructor(private readonly dbPath: string) {}

  static initialize(dbPath: string, schema: string) {
    mkdirSync(path.dirname(dbPath), { recursive: true })
    const database = new SQLiteCliDatabase(dbPath)
    database.exec('PRAGMA foreign_keys = ON;')
    database.exec(schema)
    return database
  }

  exec(sql: string) {
    const result = spawnSync('sqlite3', [this.dbPath], {
      input: sql,
      encoding: 'utf8',
    })
    if (result.status !== 0) {
      throw new Error(result.stderr || 'SQLite execution failed')
    }
  }

  query<T extends Record<string, unknown>>(sql: string): T[] {
    const result = spawnSync('sqlite3', ['-json', this.dbPath, sql], {
      encoding: 'utf8',
    })
    if (result.status !== 0) {
      throw new Error(result.stderr || 'SQLite query failed')
    }
    const output = result.stdout.trim()
    if (!output) {
      return []
    }
    return JSON.parse(output) as T[]
  }

  queryOne<T extends Record<string, unknown>>(sql: string): T | null {
    return this.query<T>(sql)[0] ?? null
  }
}

export function sql(value: SQLiteValue) {
  if (value === null) {
    return 'NULL'
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL'
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0'
  }
  return `'${value.split("'").join("''")}'`
}

export function json(value: unknown) {
  return sql(JSON.stringify(value))
}

export function nowIso() {
  return new Date().toISOString()
}

export function bool(value: unknown) {
  return Boolean(value)
}
