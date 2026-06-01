const start = Date.now()

export function log(tag: string, msg: string, extra?: Record<string, unknown>) {
  const elapsed = ((Date.now() - start) / 1000).toFixed(2)
  const extraStr = extra ? ' ' + JSON.stringify(extra) : ''
  console.log(`[cartex +${elapsed}s] [${tag}] ${msg}${extraStr}`)
}

export function timer(tag: string, label: string) {
  const t0 = Date.now()
  return () => {
    const ms = Date.now() - t0
    log(tag, `${label} — ${ms}ms`)
    return ms
  }
}
