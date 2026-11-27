// Private public-LSP fixture only: attribute real FS guards to actual Worker jobs.
require('./partial-reference-owner-audit.cjs')
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module')
const { AsyncLocalStorage } = require('node:async_hooks')
const { threadId } = require('node:worker_threads')
const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
const context = new AsyncLocalStorage()
globalThis.__sourceReferenceAudit = (method, task) => context.run(method, task)
const lstat = fs.lstatSync
fs.lstatSync = function(file, ...args) {
  const method = context.getStore()
  if (method === 'define'
    && /^Unused\d+\.ts$/.test(path.basename(String(file)))
    && fs.existsSync(path.join(directory, 'source-reference-audit-on'))) {
    fs.appendFileSync(path.join(directory, 'source-reference-guards.ndjson'),
      JSON.stringify({ method, threadId, file: String(file) }) + '\n')
  }
  return lstat.call(this, file, ...args)
}
const compile = Module.prototype._compile
Module.prototype._compile = function(source, file) {
  if (path.basename(file) === 'semantic-worker.cjs') {
    const seam = 'async function answerRequest(request) {'
    if (source.split(seam).length !== 2) throw Error('actual Worker job audit seam changed')
    source = source.replace(seam, 'function answerRequest(request) { return globalThis.__sourceReferenceAudit(request.method, () => __sourceAuditedRequest(request)); }\nasync function __sourceAuditedRequest(request) {')
  }
  return compile.call(this, source, file)
}
