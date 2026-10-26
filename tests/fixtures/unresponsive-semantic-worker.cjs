// Controlled faults only; never imported by product code or installed servers.
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
const wt = require("node:worker_threads")
const directory = process.env.ARKTS_LSP_LOG_DIR && path.dirname(process.env.ARKTS_LSP_LOG_DIR)
if (directory && path.basename(directory).startsWith("arkts-semantic-ready-")) {
  const control = path.join(directory, "unresponsive-fault.json")
  const read = () => { try { return JSON.parse(fs.readFileSync(control, "utf8")) } catch { return {} } }
  if (wt.isMainThread) {
    if (process.env.ARKTS_RECOVERY_EVIDENCE_DIR) process.on("exit", () => {
      const destination = path.join(process.env.ARKTS_RECOVERY_EVIDENCE_DIR, path.basename(directory))
      fs.mkdirSync(destination, { recursive: true })
      for (const name of ["unresponsive-fault.json", "unresponsive-entered.json", "worker-lifetime.ndjson", "logs"])
        if (fs.existsSync(path.join(directory, name))) fs.cpSync(path.join(directory, name), path.join(destination, name), { recursive: true })
    })
    const original = wt.Worker
    wt.Worker = class extends original {
      constructor(file, options) {
        super(file, options)
        const id = this.threadId
        const record = (event, fields = {}) => fs.appendFileSync(path.join(directory, "worker-lifetime.ndjson"),
          JSON.stringify({ event, threadId: id, at: Date.now(), rss: process.memoryUsage().rss, ...fields }) + "\n")
        record("created", { file: String(file) })
        this.on("exit", code => record("exited", { code }))
      }
    }
    const now = Date.now
    Date.now = () => now() + (read().clockOffset ?? 0)
  } else {
    const consume = stage => {
      const fault = read()
      if (fault.stage !== stage || !(fault.remaining > 0)) return false
      fs.writeFileSync(control, JSON.stringify({ ...fault,
        stage: fault.then ?? fault.stage, remaining: fault.then ? 1 : fault.remaining - 1, then: undefined }))
      return true
    }
    let currentCell
    const block = stage => {
      if (stage === "checker" && read().stage === "corrupt" && read().remaining > 0) {
        Atomics.store(new Int32Array(currentCell), 0, 99)
        stage = "corrupt"
      }
      if (!consume(stage)) return
      fs.writeFileSync(path.join(directory, "unresponsive-entered.json"), JSON.stringify({ stage, threadId: wt.threadId }))
      const cell = new Int32Array(new SharedArrayBuffer(4))
      for (;;) {
        Atomics.wait(cell, 0, 0, 50)
        if (stage === "startup" && fs.existsSync(path.join(directory, "unresponsive-release"))) return
      }
    }
    setInterval(() => { if (consume("exit")) process.exit(17) }, 10).unref()
    const post = wt.parentPort.postMessage.bind(wt.parentPort)
    wt.parentPort.postMessage = function(message, ...args) {
      if (message?.appliedRevision && !("id" in message) && consume("mutation")) {
        fs.writeFileSync(path.join(directory, "unresponsive-entered.json"), JSON.stringify({
          stage: "mutation", threadId: wt.threadId }))
        for (;;) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
      }
      return post(message, ...args)
    }
    const on = wt.parentPort.on.bind(wt.parentPort)
    wt.parentPort.on = function(event, listener) {
      return on(event, event !== "message" ? listener : function(message) {
        if (message?.cancelCell) currentCell = message.cancelCell
        return listener.apply(this, arguments)
      })
    }
    globalThis.__unresponsiveTest = {
      block,
      service(host, run) {
        for (const [name, stage] of [["getScriptFileNames", "roots"], ["getScriptSnapshot", "snapshot"],
          ["resolveModuleNames", "resolution"]]) {
          const original = host[name]
          if (original) host[name] = function(...args) { block(stage); return original.apply(this, args) }
        }
        return run()
      },
    }
    const compile = Module.prototype._compile
    Module.prototype._compile = function(source, file) {
      if (path.basename(file) === "semantic-worker.cjs") {
        block("startup")
        const replace = (needle, replacement) => {
          if (source.split(needle).length !== 2) throw Error("Unique unresponsive hook required: " + needle)
          source = source.replace(needle, replacement)
        }
        const service = "function createLanguageService(host, documentRegistry = createDocumentRegistry(host.useCaseSensitiveFileNames && host.useCaseSensitiveFileNames(), host.getCurrentDirectory()), syntaxOnlyOrLanguageServiceMode) {"
        replace(service, service + "return globalThis.__unresponsiveTest.service(host,()=>__unresponsiveCreateService(...arguments)); } function __unresponsiveCreateService(host, documentRegistry, syntaxOnlyOrLanguageServiceMode) {")
        const bind = "function bindSourceFile(file, options) {"
        replace(bind, bind + " globalThis.__unresponsiveTest.block('checker');")
      }
      return compile.call(this, source, file)
    }
  }
}
