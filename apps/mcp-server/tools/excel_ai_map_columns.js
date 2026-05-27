function normalise(str) {
  return String(str).toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ')
}

function tokenOverlap(a, b) {
  const ta = new Set(normalise(a).split(/\s+/).filter(Boolean))
  const tb = new Set(normalise(b).split(/\s+/).filter(Boolean))
  if (!ta.size || !tb.size) return 0
  let matches = 0
  for (const t of ta) if (tb.has(t)) matches++
  return matches / Math.max(ta.size, tb.size)
}

function matchToSchema(header, targetSchema) {
  const normHeader = normalise(header)
  let best = { canonical: null, confidence: 0 }

  for (const entry of targetSchema) {
    const canonical = entry.canonical || entry.name || entry
    const aliases = Array.isArray(entry.aliases) ? entry.aliases : []
    const description = entry.description || ''

    if (normalise(canonical) === normHeader) return { canonical, confidence: 1.0 }
    if (aliases.some(a => normalise(a) === normHeader)) { if (0.95 > best.confidence) best = { canonical, confidence: 0.95 }; continue }

    const aliasPartial = aliases.some(a => normalise(a).includes(normHeader) || normHeader.includes(normalise(a)))
    if (aliasPartial && 0.75 > best.confidence) { best = { canonical, confidence: 0.75 }; continue }

    const overlap = Math.max(
      tokenOverlap(header, canonical),
      ...aliases.map(a => tokenOverlap(header, a)),
      description ? tokenOverlap(header, description) * 0.5 : 0
    )
    if (overlap > 0.4 && overlap > best.confidence) best = { canonical, confidence: parseFloat(overlap.toFixed(2)) }
  }

  return best
}

module.exports = {
  name: 'excel_ai_map_columns',
  definition: {
    name: 'excel_ai_map_columns',
    description: 'Map unknown Excel column headers to your target canonical names using fuzzy matching. You define what to map to via target_schema — works for any domain (accounting, HR, inventory, e-commerce, etc.). Only sends headers + 3 sample rows, never the full dataset.',
    inputSchema: {
      type: 'object',
      properties: {
        headers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Column header names from the Excel file to map.',
        },
        target_schema: {
          type: 'array',
          description: 'Your target canonical column definitions. Each item: { canonical, aliases?, description? }. E.g. [{canonical:"vendor_name", aliases:["party","client"], description:"Company or person name"}].',
          items: {
            type: 'object',
            properties: {
              canonical: { type: 'string' },
              aliases: { type: 'array', items: { type: 'string' } },
              description: { type: 'string' },
            },
            required: ['canonical'],
          },
        },
        sample_rows: {
          type: 'array',
          description: 'Optional: up to 3 sample data rows (as objects) to help with type inference.',
          items: { type: 'object' },
        },
        min_confidence: {
          type: 'number',
          description: 'Minimum confidence score (0–1) to consider a match valid. Default: 0.6.',
        },
      },
      required: ['headers', 'target_schema'],
    },
  },
  handler: async (args) => {
    try {
      if (!Array.isArray(args.headers) || args.headers.length === 0) throw new Error('headers array is required')
      if (!Array.isArray(args.target_schema) || args.target_schema.length === 0) throw new Error('target_schema array is required')

      const sampleRows = Array.isArray(args.sample_rows) ? args.sample_rows.slice(0, 3) : []
      const minConf = Number(args.min_confidence) > 0 ? Number(args.min_confidence) : 0.6

      const mappings = args.headers.map(header => {
        const match = matchToSchema(header, args.target_schema)
        const sampleValues = sampleRows.map(row => row[header] ?? null).filter(v => v !== null).slice(0, 3)
        const matched = match.canonical !== null && match.confidence >= minConf
        return {
          original: header,
          canonical: matched ? match.canonical : null,
          confidence: match.confidence,
          sample_values: sampleValues,
          mapped: matched,
        }
      })

      const unmapped = mappings.filter(m => !m.mapped)
      const tokenEstimate = {
        tokens_used: Math.ceil(JSON.stringify({ headers: args.headers, sample_rows: sampleRows }).length / 4),
        note: 'Only headers + ≤3 rows sent. Full dataset never exposed to AI.',
      }

      const result = {
        total_headers: args.headers.length,
        mapped_count: mappings.length - unmapped.length,
        unmapped_count: unmapped.length,
        mappings,
        unmapped_headers: unmapped.map(m => m.original),
        token_estimate: tokenEstimate,
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true }
    }
  },
}
