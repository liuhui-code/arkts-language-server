const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
const threads = require("node:worker_threads")
if (!threads.isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private verifier fixture required")
  const output = path.join(directory, "verifier-jobs.jsonl")
  const record = data => fs.appendFileSync(output, JSON.stringify({ ...data, pid: process.pid, threadId: threads.threadId }) + "\n")
  const Worker = threads.Worker
  threads.Worker = class extends Worker {
    constructor(file, options) {
      if (path.basename(String(file)) === "reference-verifier-worker.cjs") {
        const control = path.join(directory, "verifier-controls.json")
        const value = JSON.parse(fs.readFileSync(control, "utf8"))
        if (value.mode === "spawn" && value.crashRemaining > 0) {
          fs.writeFileSync(control, JSON.stringify({ ...value, crashRemaining: value.crashRemaining - 1 }))
          record({ event: "verifier-fatal-injected", stage: "construction" })
          throw Error("controlled verifier Worker construction failure")
        }
      }
      super(file, options)
      if (path.basename(String(file)) === "reference-verifier-worker.cjs") {
        this.verifier = true
        record({ event: "verifier-created", verifierThreadId: this.threadId })
        this.once("exit", code => record({ event: "verifier-exited", code }))
      }
    }
    postMessage(input, ...args) {
      const control = path.join(directory, "verifier-controls.json")
      const value = this.verifier && JSON.parse(fs.readFileSync(control, "utf8"))
      if (value?.mode === "send" && value.armedSend && value.crashRemaining > 0) {
        fs.writeFileSync(control, JSON.stringify({ ...value, crashRemaining: value.crashRemaining - 1 }))
        record({ event: "verifier-fatal-injected", stage: "send" })
        throw Error("controlled verifier transport failure")
      }
      return super.postMessage(input, ...args)
    }
  }
  globalThis.__verifierJobGate = async executor => {
    record({ event: "fallback-gate" })
    // The public client sends a real cancellation only after seeing this gate.
    // Observe the existing request token outside an already completed verifier job.
    await new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        try { executor.options.checkpoint() }
        catch (error) { clearInterval(timer); record({ event: "cancellation-observed" }); reject(error) }
      }, 5)
    })
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "reference-verifier-worker.cjs") {
      const controlsFile = path.join(directory, "verifier-controls.json")
      const controls = JSON.parse(fs.readFileSync(controlsFile, "utf8"))
      if ((controls.mode === "exit" || !controls.mode) && controls.crashRemaining > 0) {
        fs.writeFileSync(controlsFile, JSON.stringify({ ...controls, crashRemaining: controls.crashRemaining - 1 }))
        record({ event: "verifier-fatal-injected", remaining: controls.crashRemaining - 1 })
        process.exit(41)
      }
      const port = threads.parentPort, send = port.postMessage.bind(port), on = port.on.bind(port)
      let previous, injected = false
      port.postMessage = function(message, ...args) {
        if (message.ok === true) previous = structuredClone(message)
        return send(message, ...args)
      }
      port.on = function(event, listener) {
        return on(event, event !== "message" ? listener : input => {
          if (previous && !injected && JSON.parse(fs.readFileSync(path.join(directory, "verifier-controls.json"))).lateTerminal) {
            injected = true; record({ event: "late-terminal-injected" }); send(previous)
          }
          listener(input)
        })
      }
    }
    if (path.basename(file) === "semantic-worker.cjs") {
      source += `\n{
        const original = ReferenceSearchExecutor.prototype.executeAdmitted;
        let entries = 0;
        ReferenceSearchExecutor.prototype.executeAdmitted = async function(...args) {
          if (++entries === 2 && globalThis.__verifierGateEnabled()) await globalThis.__verifierJobGate(this);
          return Reflect.apply(original, this, args);
        };
      }\n`
    }
    return Reflect.apply(compile, this, [source, file])
  }
  globalThis.__verifierGateEnabled = () => JSON.parse(fs.readFileSync(path.join(directory, "verifier-controls.json"))).gateFallback !== false
}
