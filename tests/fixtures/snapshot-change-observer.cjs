const fs = require("node:fs")
const Module = require("node:module")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

// Observe the genuine bundled compiler call in memory; never replace its result.
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-prepared-suite-")) {
    throw new Error("snapshot observer requires its private fixture")
  }
  const armed = path.join(directory, "arm-snapshot-observation")
  const output = path.join(directory, "snapshot-change-observation.jsonl")
  const compile = Module.prototype._compile
  const call = "scriptSnapshot.getChangeRange(entry.sourceFile.scriptSnapshot)"
  const updateCall = /updateLanguageServiceSourceFile\(\s*entry\.sourceFile,/gu
  let ancestor
  globalThis.__arktsObserveSnapshotChange = (current, previous) => {
    const change = current.getChangeRange(previous)
    if (fs.existsSync(armed)) {
      const text = current.getText(0, current.getLength())
      if (text.startsWith("// op04-snapshot ")) {
        const old = previous.getText(0, previous.getLength())
        const reconstructed = change === undefined ? null
          : old.slice(0, change.span.start)
            + text.slice(change.span.start, change.span.start + change.newLength)
            + old.slice(change.span.start + change.span.length)
        fs.appendFileSync(output, JSON.stringify({ kind: "compiler-change-range", pid: process.pid,
          threadId, timestamp: Date.now(), oldLength: old.length, newLength: text.length,
          change: change ?? null, reconstructsCurrentText: reconstructed === null ? null : reconstructed === text,
        }) + "\n")
        if (JSON.parse(fs.readFileSync(armed, "utf8")).probeAncestors === true) {
          ancestor ??= previous
          const range = current.getChangeRange(ancestor)
          const original = ancestor.getText(0, ancestor.getLength())
          const restored = range === undefined ? null
            : original.slice(0, range.span.start)
              + text.slice(range.span.start, range.span.start + range.newLength)
              + original.slice(range.span.start + range.span.length)
          fs.appendFileSync(output, JSON.stringify({ kind: "snapshot-ancestor-probe", pid: process.pid,
            threadId, timestamp: Date.now(), oldLength: original.length, newLength: text.length,
            change: range ?? null, reconstructsCurrentText: restored === null ? null : restored === text,
          }) + "\n")
        }
      }
    }
    return change
  }
  globalThis.__arktsObserveSnapshotUpdate = (nativeUpdate, previous, current, ...args) => {
    const observed = fs.existsSync(armed)
      && current.getText(0, current.getLength()).startsWith("// op04-snapshot ")
    const statements = observed ? [...previous.statements] : []
    const oldLength = previous.text.length
    const result = nativeUpdate(previous, current, ...args)
    if (observed) {
      const next = new Set(result.statements)
      fs.appendFileSync(output, JSON.stringify({ kind: "compiler-source-update", pid: process.pid,
        threadId, timestamp: Date.now(), oldLength, newLength: result.text.length,
        change: args[1] ?? null, sourceFileChanged: result !== previous,
        oldStatements: statements.length, newStatements: result.statements.length,
        reusedStatements: statements.filter(statement => next.has(statement)).length,
      }) + "\n")
    }
    return result
  }
  Module.prototype._compile = function (content, filename) {
    if (["semantic-worker.cjs", "reference-verifier-worker.cjs", "diagnostic-verifier-worker.cjs"]
      .includes(path.basename(filename))) {
      if (content.split(call).length !== 2) throw new Error("locked compiler snapshot call unavailable")
      if ([...content.matchAll(updateCall)].length !== 1) throw new Error("locked compiler parser call unavailable")
      content = content.replace(call,
        "globalThis.__arktsObserveSnapshotChange(scriptSnapshot, entry.sourceFile.scriptSnapshot)")
      content = content.replace(updateCall,
        "globalThis.__arktsObserveSnapshotUpdate(updateLanguageServiceSourceFile, entry.sourceFile,")
    }
    return Reflect.apply(compile, this, [content, filename])
  }
}
