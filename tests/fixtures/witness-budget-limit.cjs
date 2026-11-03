const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const { isMainThread } = require("node:worker_threads")

if (!isMainThread) {
  const observed = new Set(), owners = new WeakMap()
  let nextOwner = 1
  globalThis.__recordWitnessBudget = (witness, directory, reason, retainedPaths, accountedBytes, limit) => {
    if (!owners.has(witness)) owners.set(witness, nextOwner++)
    const owner = owners.get(witness), key = `${owner}:${reason}`
    if (observed.has(key)) return
    observed.add(key)
    fs.appendFileSync(path.join(directory, "witness-capacity.jsonl"),
      JSON.stringify({ owner, reason, retainedPaths, accountedBytes, limit }) + "\n")
  }
  if (process.env.ARKTS_TEST_WITNESS_BUDGET_MODE === "mixed") {
    const stat = fs.statSync, directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR ?? "")
    const marker = path.join(directory, "arm-witness-change"), observed = path.join(directory, "witness-source-changed")
    fs.statSync = function (filename, ...args) {
      const result = Reflect.apply(stat, this, [filename, ...args])
      if (/File\d+\.ets$/.test(String(filename)) && fs.existsSync(marker) && !fs.existsSync(observed)) {
        const caller = new Error().stack ?? ""
        if (caller.includes("lookupIdentity") && caller.includes("observeSourceNamespace")) {
          fs.appendFileSync(filename, "\n ")
          fs.writeFileSync(observed, JSON.stringify({ filename: String(filename), caller }))
        }
      }
      return result
    }
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function (source, filename) {
    if (path.basename(filename) === "semantic-worker.cjs") {
      const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR ?? "")
      if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private witness fixture required")
      const mode = process.env.ARKTS_TEST_WITNESS_BUDGET_MODE
      const pending = mode.startsWith("pending")
      const needle = pending ? "var MAX_PENDING_BYTES = MAX_WITNESS_BYTES;" : "constructor(limit = MAX_WITNESS_BYTES) {"
      if (source.split(needle).length !== 2) throw Error("exact witness budget declaration required")
      source = source.replace(needle, pending ? `var MAX_PENDING_BYTES = ${mode === "pending-aggregate" ? 12288 : mode === "pending-copy" ? 4096 : 128};`
        : needle + ' if ((new Error().stack ?? "").includes("createInputWitness")) limit = 32 * 1024;')
      if (mode === "pending-copy" || mode === "pending-aggregate") {
        const overflow = "this.failed = true;\n      throw new ExactEvidenceCapacityError();"
        if (source.split(overflow).length !== 2) throw Error("exact capsule overflow boundary required")
        source = source.replace(overflow, `this.failed = true;
          require("node:fs").appendFileSync(${JSON.stringify(path.join(directory, "witness-copy-overflow.jsonl"))},
            JSON.stringify({ factCount: this.facts.length, accountedBytes: this.budget.bytes,
              limit: this.budget.limit, nextFactBytes: witnessFactBytes(filePath, identity) }) + "\\n");
          throw new ExactEvidenceCapacityError();`)
        if (process.env.ARKTS_TEST_WITNESS_UNMAPPED_CAPACITY === "1") {
          const mapping = "if (error instanceof ExactEvidenceCapacityError) throw new SemanticInputUnavailableError();"
          if (source.split(mapping).length !== 2) throw Error("exact capsule error mapping required")
          source = source.replace(mapping, "/* counterfactual: capacity mapping removed */")
        }
      }
      if (mode === "pending-aggregate") {
        for (const [needle, event, fields] of [
          ["const available = MAX_PENDING_BYTES - this.bytes - entryBytes;", "capture", "contextId, bytes: this.bytes, available, entryBytes"],
          ["this.bytes += cost;", "retain", "contextId, bytes: this.bytes, cost, count: this.pending.size"],
          ["this.bytes -= retained.cost;", "release", "contextId, bytes: this.bytes, cost: retained.cost, count: this.pending.size - 1"],
          ["this.pending.clear();\n    this.bytes = 0;", "clear", "bytes: this.bytes, count: this.pending.size"],
        ]) {
          if (source.split(needle).length !== 2) throw Error("exact pending lifecycle boundary required: " + event)
          source = source.replace(needle, needle + `
            require("node:fs").appendFileSync(${JSON.stringify(path.join(directory, "witness-pending-lifecycle.jsonl"))},
              JSON.stringify({ event: ${JSON.stringify(event)}, ${fields} }) + "\\n");`)
        }
      }
      if (mode === "pending-aggregate" && process.env.ARKTS_TEST_WITNESS_SKIP_RELEASE === "1") {
        const release = "this.bytes -= retained.cost;"
        if (source.split(release).length !== 2) throw Error("exact pending release boundary required")
        source = source.replace(release, "/* counterfactual: byte release removed */")
      }
      const observe = 'markUnprovable(reason2 = "caller-invalidated", sourcePath) {'
      if (source.split(observe).length !== 2) throw Error("exact witness failure boundary required")
      source = source.replace(observe, observe + `
        globalThis.__recordWitnessBudget(this, ${JSON.stringify(directory)}, reason2,
          this.identities.size + this.pathIdentities.size, this.budget.bytes, this.budget.limit);
        ${process.env.ARKTS_TEST_WITNESS_EARLY_RETURN === "1" ? "if (this.unprovable) return;" : ""}`)
    }
    return compile.call(this, source, filename)
  }
}
