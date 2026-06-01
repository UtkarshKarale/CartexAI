const fs = require('fs')
const path = require('path')

module.exports = {
  name: 'pdf_read_content',
  definition: {
    name: 'pdf_read_content',
    description: 'Extract and read all text content from a PDF file — suitable for Q&A, summarization, or analysis. Returns text per page. For scanned/image PDFs, use ocr_image first. For table extraction, use pdf_extract_tables.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the PDF file.' },
        page_range: { type: 'string', description: 'Optional page range like "1-5" or "3". Default: all pages.' },
        max_chars: { type: 'number', description: 'Maximum characters to return total (default 50000, max 100000). Prevents context overflow.' },
      },
      required: ['file_path'],
    },
  },
  handler: async (args) => {
    const filePath = path.resolve(args.file_path)
    if (!fs.existsSync(filePath)) {
      return { content: [{ type: 'text', text: `File not found: ${filePath}` }], isError: true }
    }
    if (!filePath.toLowerCase().endsWith('.pdf')) {
      return { content: [{ type: 'text', text: 'File must be a PDF.' }], isError: true }
    }

    const pdfParse = require('pdf-parse')
    const buffer = fs.readFileSync(filePath)

    const maxChars = Math.min(Number(args.max_chars) || 50000, 100000)
    let pageStart = 1
    let pageEnd = Infinity

    if (args.page_range) {
      const rangeMatch = args.page_range.match(/^(\d+)(?:-(\d+))?$/)
      if (rangeMatch) {
        pageStart = parseInt(rangeMatch[1])
        pageEnd = rangeMatch[2] ? parseInt(rangeMatch[2]) : pageStart
      }
    }

    const pages = []
    let totalChars = 0
    let truncated = false

    const data = await pdfParse(buffer, {
      pagerender: (pageData) => {
        return pageData.getTextContent().then((textContent) => {
          const pageNum = pageData.pageNumber
          if (pageNum < pageStart || pageNum > pageEnd) return ''

          const items = textContent.items
          let lastY = null
          let text = ''
          for (const item of items) {
            if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
              text += '\n'
            }
            text += item.str
            if (item.hasEOL) text += '\n'
            lastY = item.transform[5]
          }
          return text.trim()
        })
      },
    }).catch(async () => {
      return await pdfParse(buffer)
    })

    const rawText = data.text || ''
    const allLines = rawText.split('\n')
    const pageTexts = splitIntoPages(allLines, data.numpages, pageStart, pageEnd)

    for (const { page, text } of pageTexts) {
      if (totalChars >= maxChars) { truncated = true; break }
      const remaining = maxChars - totalChars
      const trimmed = text.length > remaining ? text.slice(0, remaining) + '…[truncated]' : text
      pages.push({ page, text: trimmed, chars: trimmed.length })
      totalChars += trimmed.length
    }

    const stat = fs.statSync(filePath)
    const result = {
      file: filePath,
      file_size_kb: Math.round(stat.size / 1024),
      total_pages: data.numpages,
      pages_returned: pages.length,
      page_range: args.page_range || `1-${data.numpages}`,
      total_chars: totalChars,
      truncated,
      pages,
      tip: data.numpages > 0 && totalChars < 100 ? 'Very little text extracted — this may be a scanned PDF. Try ocr_image tool on individual pages.' : undefined,
    }

    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  },
}

function splitIntoPages(lines, totalPages, pageStart, pageEnd) {
  const linesPerPage = Math.max(1, Math.floor(lines.length / Math.max(1, totalPages)))
  const pages = []
  for (let p = pageStart; p <= Math.min(pageEnd, totalPages); p++) {
    const start = (p - 1) * linesPerPage
    const end = p === totalPages ? lines.length : p * linesPerPage
    pages.push({ page: p, text: lines.slice(start, end).join('\n').trim() })
  }
  return pages
}
