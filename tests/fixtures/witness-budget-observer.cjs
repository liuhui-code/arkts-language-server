// Private fixture-only metadata observation. It does not validate proofs or load compiler inputs.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module')
const { isMainThread } = require('node:worker_threads')
if (!isMainThread) {
  const seen = new WeakMap()
  globalThis.__measureWitness = witness => {
    if ((seen.get(witness) ?? -1) >= witness.budget.bytes) return
    seen.set(witness, witness.budget.bytes)
    let facts = 0, pathUnits = 0, identityUnits = 0, longestPath = 0
    for (const records of [witness.identities, witness.pathIdentities]) for (const [file, fact] of records) {
      facts++; pathUnits += file.length; identityUnits += fact.identity.length; longestPath = Math.max(longestPath, file.length)
    }
    fs.appendFileSync(path.join(path.dirname(process.env.ARKTS_LSP_LOG_DIR), 'witness-measure.jsonl'),
      JSON.stringify({ facts, pathUnits, identityUnits, longestPath, bytes: witness.budget.bytes, limit: witness.budget.limit }) + '\n')
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, filename) {
    if (path.basename(filename) === 'semantic-worker.cjs') {
      const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR ?? '')
      if (!path.basename(directory).startsWith('arkts-semantic-ready-')) throw Error('private fixture required')
      const matches = source.match(/freshness\(checkpoint\d*, mode = "validate"\) \{/g) ?? []
      if (matches.length !== 1) throw Error('unique witness freshness required')
      const needle = matches[0]
      if (source.split(needle).length !== 2) throw Error('unique witness freshness required')
      source = source.replace(needle, needle + ' globalThis.__measureWitness(this);')
    }
    return compile.call(this, source, filename)
  }
}
