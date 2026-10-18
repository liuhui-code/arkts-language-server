const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const { isMainThread, threadId, workerData, parentPort } = require("node:worker_threads")

// Observe genuine parser calls, without replacing compiler results or input reads.
if (!isMainThread && ["definition", "references"].includes(workerData?.operation)) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR ?? "")
  if (!path.basename(directory).startsWith("arkts-prepared-suite-")) throw new Error("private SDK parse fixture required")
  globalThis.__observeSdkParse = file => {
    const resolved = path.resolve(file)
    if (/^lib\..*\.d\.ts$/u.test(path.basename(resolved))) fs.appendFileSync(path.join(directory, "stdlib-parses.jsonl"),
      JSON.stringify({ pid: process.pid, threadId, file: resolved }) + "\n")
    if (resolved.startsWith(directory + path.sep)) fs.appendFileSync(path.join(directory, "sdk-parses.jsonl"),
      JSON.stringify({ pid: process.pid, threadId, file: resolved }) + "\n")
  }
  const post = parentPort.postMessage
  parentPort.postMessage = function (message, ...args) {
    if (message?.phase === "runtime-ready") fs.appendFileSync(path.join(directory, "cache-jobs.jsonl"),
      JSON.stringify({ pid: process.pid, threadId }) + "\n")
    if (typeof message?.ok === "boolean") fs.appendFileSync(path.join(directory, "cache-completions.jsonl"),
      JSON.stringify({ pid: process.pid, threadId, ok: message.ok }) + "\n")
    return Reflect.apply(post, this, [message, ...args])
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function (source, file) {
    if (path.basename(file) === "reference-verifier-worker.cjs") {
      const pattern = /(function createLanguageServiceSourceFile\(fileName[^\n]*\) \{)/g
      let count = 0
      source = source.replace(pattern, match => { count++; return match + "\nglobalThis.__observeSdkParse(fileName);" })
      if (count !== 1) throw new Error(`expected one real compiler parse entrypoint, got ${count}`)
    }
    return Reflect.apply(compile, this, [source, file])
  }
}
