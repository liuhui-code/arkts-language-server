const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const { isMainThread, threadId } = require("node:worker_threads")

if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private late dependency fixture required")
  const output = path.join(directory, "group-late-inputs.jsonl")
  const owners = new WeakMap()
  let nextOwner = 0, tokenCollisionReads = 0
  const target = process.env.ARKTS_TEST_LATE_TOKEN_COLLISION_FILE
  const initial = target ? fs.statSync(path.join(directory, "workspace", target)) : undefined
  const token = stat => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(":")
  const frozenToken = initial && token(initial)
  globalThis.__lateDependencyToken = stat => {
    if (!initial || stat.dev !== initial.dev || stat.ino !== initial.ino) return undefined
    if (token(stat) !== frozenToken) tokenCollisionReads++
    return frozenToken
  }
  globalThis.__observeGroupLateInputs = (workspace, engine) => {
    if (!workspace.semanticRootPaths) return
    if (!owners.has(engine)) owners.set(engine, ++nextOwner)
    fs.appendFileSync(output, JSON.stringify({ pid: process.pid, threadId,
      owner: owners.get(engine), tokenCollisionReads,
      roots: workspace.semanticRootPaths, documents: workspace.documents.map(document => document.path) }) + "\n")
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function (source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      if (process.env.ARKTS_TEST_LATE_DISABLE_LAZY_CACHE === "1") {
        const capacity = /var MAX_LAZY_SNAPSHOTS = \d+;/g
        if ([...source.matchAll(capacity)].length !== 1) throw Error("one actual lazy snapshot capacity required")
        source = source.replace(capacity, "var MAX_LAZY_SNAPSHOTS = 0;")
      }
      const hook = "this.updateSemanticRootPaths(workspace.semanticRootPaths);"
      if (source.split(hook).length !== 2) throw Error("one actual compiler workspace preparation required")
      source = source.replace(hook, hook + "\nglobalThis.__observeGroupLateInputs(workspace, this);")
      if (target) {
        const identity = "function sourceStatIdentity(stat) {"
        if (source.split(identity).length !== 2) throw Error("one actual source admission identity required")
        // Freeze only the admission token, retaining real physical identities and current byte reads.
        source = source.replace(identity, identity
          + "\nconst collision = globalThis.__lateDependencyToken(stat); if (collision !== undefined) return collision;")
      }
    }
    return Reflect.apply(compile, this, [source, file])
  }
}
