// Isolated public-LSP fixture: suspend a real source Host read until the
// supervisor's actual shared cancellation token changes. No fabricated reply.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module')
const workers = require('node:worker_threads'), { threadId } = workers
const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR || '')
if (!path.basename(directory).startsWith('arkts-semantic-ready-')) throw Error('private fixture required')
if (workers.isMainThread) {
  const Worker = workers.Worker
  workers.Worker = class extends Worker {
    constructor(...args) {
      super(...args)
      this.on('error', error => fs.appendFileSync(path.join(directory, 'source-loader-errors.ndjson'),
        JSON.stringify({ name: error.name, message: error.message, stack: error.stack }) + '\n'))
    }
  }
}
const arm = path.join(directory, 'source-cancel-arm'), entered = path.join(directory, 'source-cancel-entered')
let consumed = false, cancellation
const load = Atomics.load
Atomics.load = function(view, index) {
  const value = Reflect.apply(load, Atomics, [view, index])
  if (view instanceof Int32Array && view.length === 1 && view.buffer instanceof SharedArrayBuffer) cancellation = view
  return value
}
const compile = Module.prototype._compile
Module.prototype._compile = function(source, file) {
  if (path.basename(file) === 'semantic-worker.cjs') {
    const seam = 'function createLanguageService(host, documentRegistry = createDocumentRegistry(host.useCaseSensitiveFileNames && host.useCaseSensitiveFileNames(), host.getCurrentDirectory()), syntaxOnlyOrLanguageServiceMode) {'
    if (source.split(seam).length !== 2) throw Error('source owner compiler seam changed')
    source = source.replace(seam, seam + 'globalThis.__sourceCancellationHost(host, documentRegistry);')
  }
  return compile.call(this, source, file)
}
globalThis.__sourceCancellationHost = (host, registry) => {
  const settings = host.getCompilationSettings()
  if (!settings.noResolve || !settings.noLib) return
  const release = registry.releaseDocumentWithKey
  registry.releaseDocumentWithKey = function(...args) {
    const fault = path.join(directory, 'source-release-fault')
    if (!fs.existsSync(fault)) return release.apply(this, args)
    fs.unlinkSync(fault)
    const count = () => registry.getLanguageServiceRefCounts(args[0], args[2])
      .reduce((sum, [, refs]) => sum + (refs ?? 0), 0)
    const before = count()
    const value = release.apply(this, args)
    fs.writeFileSync(fault + '.fired', JSON.stringify({ domain: 'source', before, after: count(), caller: new Error().stack }))
    throw Error('test: source Registry release threw after effect')
  }
  const snapshot = host.getScriptSnapshot
  host.getScriptSnapshot = function(...args) {
    if (!consumed && fs.existsSync(arm)) {
      consumed = true
      fs.unlinkSync(arm)
      const temporary = entered + '.tmp'
      fs.writeFileSync(temporary, JSON.stringify({ pid: process.pid, threadId, file: args[0] }))
      fs.renameSync(temporary, entered)
      if (!cancellation || Reflect.apply(load, Atomics, [cancellation, 0]) !== 0) throw Error('active real cancellation cell required')
      const current = cancellation, deadline = Date.now() + 5000, sleep = new Int32Array(new SharedArrayBuffer(4))
      while (Reflect.apply(load, Atomics, [current, 0]) === 0) {
        if (Date.now() > deadline) throw Error('actual cancel did not reach the source Host')
        Atomics.wait(sleep, 0, 0, 2)
      }
      // Finish the bounded actual synchronization. The central factory's
      // post-sync checkpoint must observe cancellation before semantic results.
      const masked = host.getCancellationToken().isCancellationRequested()
      fs.writeFileSync(path.join(directory, 'source-cancel-observed'), JSON.stringify({ masked }))
    }
    return snapshot.apply(this, args)
  }
}
