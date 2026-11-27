// Admission-only pressure observation; does not allocate or change Worker limits.
const fs = require('node:fs'), path = require('node:path')
const { isMainThread } = require('node:worker_threads')
const dir = path.dirname(process.env.ARKTS_LSP_LOG_DIR || '')
if (!path.basename(dir).startsWith('arkts-semantic-ready-')) throw Error('private fixture required')
if (isMainThread) {
  const usage = process.memoryUsage
  process.memoryUsage = Object.assign(function(...args) {
    const measured = usage.apply(this, args)
    if (fs.existsSync(path.join(dir, 'source-cache-pressure'))) return { ...measured, rss: 2 * 1024 ** 3 }
    return measured
  }, { rss: usage.rss })
}
