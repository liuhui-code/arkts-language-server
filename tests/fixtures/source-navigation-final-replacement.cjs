// Public transcript fixture: replace the named target between source admission
// and its independent final observation, preserving bytes, size and mtime.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module')
const { isMainThread } = require('node:worker_threads')
const dir = path.dirname(process.env.ARKTS_LSP_LOG_DIR || '')
if (!path.basename(dir).startsWith('arkts-semantic-ready-')) throw Error('private fixture required')
let captures = 0
const compile = Module.prototype._compile
Module.prototype._compile = function(source, file) {
  if (!isMainThread && path.basename(file) === 'semantic-worker.cjs') {
    const seam = 'function sourceReferenceInputKey(query) {'
    if (source.split(seam).length !== 2) throw Error('source admission seam changed')
    source = source.replace(seam, seam + 'globalThis.__sourceFinalReplacement(query);')
  }
  return compile.call(this, source, file)
}
globalThis.__sourceFinalReplacement = query => {
  const plan = path.join(dir, 'source-final-replacement')
  if (!fs.existsSync(plan) || ++captures !== 2) return
  const file = require('node:url').fileURLToPath(query.document.uri), before = fs.statSync(file)
  const bytes = fs.readFileSync(file)
  fs.renameSync(file, file + '.previous')
  fs.writeFileSync(file, bytes)
  fs.utimesSync(file, before.atime, before.mtime)
  const after = fs.statSync(file)
  fs.writeFileSync(plan + '.fired', JSON.stringify({ before: { ino: before.ino, size: before.size, mtimeMs: before.mtimeMs },
    after: { ino: after.ino, size: after.size, mtimeMs: after.mtimeMs } }))
  fs.unlinkSync(plan)
}
