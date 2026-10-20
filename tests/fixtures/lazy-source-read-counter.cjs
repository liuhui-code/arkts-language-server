const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const { isMainThread, threadId, parentPort } = require("node:worker_threads")

if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private fixture required")
  const marker = path.join(directory, "lazy-read-phase"), phases = new Map()
  globalThis.__observeActualLazyRead = (file, content, durationMs) => {
    if (!/^Filler\d+\.ets$/.test(path.basename(file))) return
    const phase = fs.existsSync(marker) ? fs.readFileSync(marker, "utf8") : "unarmed"
    if (!phases.has(phase)) phases.set(phase, new Map())
    const files = phases.get(phase)
    const row = files.get(file) ?? { attempts: 0, successes: 0, bytes: 0, durationMs: 0 }
    row.attempts++; row.successes += content !== null ? 1 : 0
    row.bytes += content === null ? 0 : Buffer.byteLength(content)
    row.durationMs += durationMs
    files.set(file, row)
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const start = "const sourceContent = this.projectFileAccess ? this.projectFileAccess.read("
      const end = "if (sourceContent === null) {"
      for (const site of [start, end]) if (source.split(site).length !== 2) throw Error("one actual lazy read site required")
      source = source.replace(start, "const __lazyReadStarted = performance.now();\n" + start)
      source = source.replace(end,
        "globalThis.__observeActualLazyRead(filePath, sourceContent, performance.now() - __lazyReadStarted);\n" + end)
    }
    return Reflect.apply(compile, this, [source, file])
  }
  const post = parentPort.postMessage
  parentPort.postMessage = function(message, ...args) {
    if (message?.workerEvent !== "log") fs.writeFileSync(path.join(directory, `lazy-source-reads-${threadId}.json`),
      JSON.stringify({ pid: process.pid, threadId, phases: Object.fromEntries(
        [...phases].map(([phase, files]) => [phase, Object.fromEntries(files)])) }))
    return Reflect.apply(post, this, [message, ...args])
  }
}
