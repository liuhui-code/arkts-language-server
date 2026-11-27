// Simulate one unavailable Host snapshot in the tiny private source domain.
// The real compiler still creates/updates its actual Program and versions.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module')
const dir = path.dirname(process.env.ARKTS_LSP_LOG_DIR || '')
if (!path.basename(dir).startsWith('arkts-semantic-ready-')) throw Error('private fixture required')
let failed = false
const compile = Module.prototype._compile
Module.prototype._compile = function(source, file) {
  if (path.basename(file) === 'semantic-worker.cjs') {
    const seam = 'function createLanguageService(host, documentRegistry = createDocumentRegistry(host.useCaseSensitiveFileNames && host.useCaseSensitiveFileNames(), host.getCurrentDirectory()), syntaxOnlyOrLanguageServiceMode) {'
    if (source.split(seam).length !== 2) throw Error('source compiler seam changed')
    source = source.replace(seam, seam + 'globalThis.__sourceUnavailableHost(host);')
  }
  return compile.call(this, source, file)
}
globalThis.__sourceUnavailableHost = host => {
  const settings = host.getCompilationSettings()
  if (!settings.noLib || !settings.noResolve) return
  const snapshot = host.getScriptSnapshot
  host.getScriptSnapshot = function(...args) {
    if (!failed) {
      failed = true
      fs.writeFileSync(path.join(dir, 'source-unavailable-observed'), String(args[0]))
      return undefined
    }
    return snapshot.apply(this, args)
  }
}
