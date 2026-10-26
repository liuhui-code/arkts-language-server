// Independent audit seam; never loaded by a production installation.
const fs = require("node:fs"), path = require("node:path"), wt = require("node:worker_threads")
const root = process.env.ARKTS_AUDIT_RUNTIME_ROOT
if (!root) throw Error("audit runtime root required")
require(path.join(root, "tests/fixtures/unresponsive-semantic-worker.cjs"))
const directory = process.env.ARKTS_LSP_LOG_DIR && path.dirname(process.env.ARKTS_LSP_LOG_DIR)
if (directory && path.basename(directory).startsWith("arkts-semantic-ready-")) {
  const control = path.join(directory, "audit-controls.json")
  const read = () => { try { return JSON.parse(fs.readFileSync(control, "utf8")) } catch { return {} } }
  const log = value => fs.appendFileSync(path.join(directory, "audit-worker.ndjson"), JSON.stringify({
    at: Date.now(), ...value }) + "\n")
  if (wt.isMainThread) {
    const Original = wt.Worker
    const uncertain = new Set()
    setInterval(() => {
      const lateExit = fs.existsSync(path.join(directory, "audit-late-exit"))
      if (!lateExit && !fs.existsSync(path.join(directory, "audit-cleanup-orphans"))) return
      for (const worker of uncertain) {
        uncertain.delete(worker)
        log({ event: lateExit ? "controlled-late-exit" : "audit-forced-orphan-cleanup", threadId: worker.auditId })
        void Original.prototype.terminate.call(worker)
      }
    }, 20).unref()
    wt.Worker = class extends Original {
      constructor(file, options) {
        super(file, options)
        const id = this.threadId
        this.auditId = id
        let copiedFault = false
        log({ event: "created", threadId: id, file: String(file) })
        this.on("exit", code => { uncertain.delete(this); log({ event: "exited", threadId: id, code }) })
        this.on("message", message => {
          if (message && ("id" in message || "appliedRevision" in message
            || ["fault", "shutdownComplete"].includes(message.workerEvent))) log({
            event: "receive", threadId: id, message })
          if (message?.workerEvent === "fault" && read().duplicateFault && !copiedFault) {
            copiedFault = true
            for (const delay of [0, 2000]) setTimeout(() => {
              log({ event: "fault-copy", threadId: id })
              this.emit("message", message)
            }, delay).unref()
          }
        })
      }
      postMessage(message, ...args) {
        log({ event: "send", threadId: this.auditId, message })
        return super.postMessage(message, ...args)
      }
      terminate() {
        const value = read()
        const fault = value.terminate
        if (!(fault?.remaining > 0)) return super.terminate()
        fs.writeFileSync(control, JSON.stringify({ ...value, terminate: { ...fault, remaining: fault.remaining - 1 } }))
        log({ event: "terminate-fault", mode: fault.mode, threadId: this.auditId })
        if (fault.mode === "before") {
          uncertain.add(this)
          return Promise.reject(Error("audit: terminate rejected before effect"))
        }
        if (fault.mode === "after") return super.terminate().then(() => {
          throw Error("audit: terminate rejected after confirmed exit")
        })
        if (fault.mode === "delay") return new Promise(resolve => {
          const timer = setInterval(() => {
            if (!fs.existsSync(path.join(directory, "audit-terminate-release"))) return
            clearInterval(timer)
            resolve(super.terminate())
          }, 10)
        })
        throw Error("unknown audit terminate mode")
      }
    }
  } else {
    const block = globalThis.__unresponsiveTest.block
    globalThis.__unresponsiveTest.block = stage => {
      const value = read()
      if (value.gate?.stage === stage && value.gate.remaining > 0) {
        fs.writeFileSync(control, JSON.stringify({ ...value, gate: { ...value.gate, remaining: value.gate.remaining - 1 } }))
        fs.writeFileSync(path.join(directory, "audit-gate-entered.json"), JSON.stringify({ stage, threadId: wt.threadId }))
        while (!fs.existsSync(path.join(directory, "audit-gate-release"))) {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
        }
      }
      return block(stage)
    }
  }
}
