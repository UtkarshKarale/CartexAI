const path = require('path')
const https = require('https')
const http = require('http')
const fs = require('fs')

function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(destPath)
    client.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error(`Chart API returned ${res.statusCode}`))
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
    }).on('error', err => { fs.unlink(destPath, () => {}); reject(err) })
  })
}

function buildChartConfig(type, labels, datasets, title) {
  const colors = ['rgba(54,96,146,0.8)', 'rgba(230,108,55,0.8)', 'rgba(68,144,74,0.8)', 'rgba(189,60,60,0.8)', 'rgba(124,91,166,0.8)']
  return {
    type: type === 'column' ? 'bar' : type,
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label: ds.label || `Series ${i + 1}`,
        data: ds.data,
        backgroundColor: type === 'line' ? colors[i % colors.length] : ds.data.map((_, j) => colors[j % colors.length]),
        borderColor: colors[i % colors.length],
        fill: type === 'line' ? false : undefined,
      })),
    },
    options: {
      title: { display: !!title, text: title || '' },
      legend: { display: datasets.length > 1 },
      plugins: { datalabels: { display: false } },
    },
  }
}

module.exports = {
  name: 'excel_add_charts',
  definition: {
    name: 'excel_add_charts',
    description: 'Generate a chart image (bar, line, pie, column) from data and embed it into an Excel file. Uses QuickChart API to render — requires internet. Accepts inline data or reads from an existing Excel sheet.',
    inputSchema: {
      type: 'object',
      properties: {
        output_path: { type: 'string', description: 'Absolute path for the output .xlsx file.' },
        chart_type: { type: 'string', enum: ['bar', 'line', 'pie', 'column', 'doughnut'], description: 'Chart type. Default: bar.' },
        title: { type: 'string', description: 'Chart title.' },
        labels: { type: 'array', items: { type: 'string' }, description: 'X-axis labels or pie slice labels. E.g. ["Jan","Feb","Mar"].' },
        datasets: {
          type: 'array',
          description: 'One or more data series. E.g. [{"label":"Sales","data":[100,200,150]}].',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              data: { type: 'array', items: { type: 'number' } },
            },
            required: ['data'],
          },
        },
        source_file: { type: 'string', description: 'Optional: read data from this Excel file instead of inline datasets.' },
        source_sheet: { type: 'string', description: 'Sheet name when using source_file.' },
        label_column: { type: 'string', description: 'Column to use as labels when reading from Excel.' },
        value_column: { type: 'string', description: 'Column to use as values when reading from Excel.' },
        width: { type: 'number', description: 'Chart width in pixels. Default: 800.' },
        height: { type: 'number', description: 'Chart height in pixels. Default: 400.' },
      },
      required: ['output_path'],
    },
  },
  handler: async (args) => {
    try {
      const outputPath = path.resolve(args.output_path)
      const chartType = args.chart_type || 'bar'
      const width = Math.min(1600, Math.max(200, Number(args.width) || 800))
      const height = Math.min(1200, Math.max(100, Number(args.height) || 400))

      let labels = args.labels || []
      let datasets = args.datasets || []

      if (args.source_file && (!labels.length || !datasets.length)) {
        const XLSX = require('xlsx')
        const wb = XLSX.readFile(path.resolve(args.source_file))
        const ws = wb.Sheets[args.source_sheet || wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: null })
        const lCol = args.label_column || Object.keys(rows[0] || {})[0]
        const vCol = args.value_column || Object.keys(rows[0] || {})[1]
        labels = rows.map(r => String(r[lCol] ?? ''))
        datasets = [{ label: vCol, data: rows.map(r => Number(r[vCol]) || 0) }]
      }

      if (!labels.length || !datasets.length) throw new Error('Provide labels + datasets or source_file with label_column + value_column')

      const chartConfig = buildChartConfig(chartType, labels, datasets, args.title)
      const chartUrl = `https://quickchart.io/chart?w=${width}&h=${height}&c=${encodeURIComponent(JSON.stringify(chartConfig))}`

      const tmpImg = path.join(require('os').tmpdir(), `jifiles_chart_${Date.now()}.png`)
      await downloadImage(chartUrl, tmpImg)

      const ExcelJS = require('exceljs')
      const wb = new ExcelJS.Workbook()
      wb.creator = 'JiFiles Chart Engine'

      const dataSheet = wb.addWorksheet('Data')
      dataSheet.addRow(['Label', ...datasets.map(d => d.label || 'Value')])
      labels.forEach((label, i) => dataSheet.addRow([label, ...datasets.map(d => d.data[i] ?? 0)]))

      const chartSheet = wb.addWorksheet('Chart')
      const imgId = wb.addImage({ filename: tmpImg, extension: 'png' })
      chartSheet.addImage(imgId, { tl: { col: 0, row: 0 }, br: { col: Math.round(width / 64), row: Math.round(height / 20) } })

      if (fs.existsSync(outputPath)) {
        const existing = new ExcelJS.Workbook()
        await existing.xlsx.readFile(outputPath)
        existing.addWorksheet('Chart').addImage(existing.addImage({ filename: tmpImg, extension: 'png' }), { tl: { col: 0, row: 0 }, br: { col: Math.round(width / 64), row: Math.round(height / 20) } })
        await existing.xlsx.writeFile(outputPath)
      } else {
        await wb.xlsx.writeFile(outputPath)
      }

      fs.unlink(tmpImg, () => {})

      const result = { output_path: outputPath, chart_type: chartType, labels_count: labels.length, series_count: datasets.length, title: args.title || null }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true }
    }
  },
}
