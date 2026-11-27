const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
const threads = require("node:worker_threads")
const directory = process.env.ARKTS_LSP_LOG_DIR && path.dirname(process.env.ARKTS_LSP_LOG_DIR)
if (directory && path.basename(directory).startsWith("arkts-semantic-ready-")) {
  const record = row => fs.appendFileSync(path.join(directory, "scope-retry.jsonl"), JSON.stringify(row) + "\n")
  if (threads.isMainThread) {
    const Worker = threads.Worker
    threads.Worker = class extends Worker {
      constructor(...args) {
        super(...args)
        this.on("message", message => {
          if (message?.ok === false) record({ kind: "worker-error", threadId: this.threadId, id: message.id, error: message.error })
        })
      }
    }
  } else {
    let seen = 0, bindingCount = 0
    const phase = process.env.ARKTS_TEST_SCOPE_RETRY_PHASE ?? "roles"
    const pause = value => {
      fs.writeFileSync(path.join(directory, "scope-paused"), value)
      const until = Date.now() + 5000, cell = new Int32Array(new SharedArrayBuffer(4))
      while (!fs.existsSync(path.join(directory, "scope-resume"))) {
        if (Date.now() > until) throw Error("controlled initialization cancellation was not acknowledged")
        Atomics.wait(cell, 0, 0, 5)
      }
    }
    globalThis.__initialScopeCancellation = file => {
      if (!/[\\/]Unused\d+\.ts$/.test(file)) return
      record({ kind: "role", file, threadId: threads.threadId })
      if (++seen === 50 && phase === "roles" && !fs.existsSync(path.join(directory, "scope-resume"))) pause(file)
    }
    globalThis.__initialBindingCancellation = () => {
      if (++bindingCount === 50 && phase === "bindings" && !fs.existsSync(path.join(directory, "scope-resume"))) pause("bindings")
    }
    const compile = Module.prototype._compile
    Module.prototype._compile = function(source, file) {
      if (path.basename(file) === "semantic-worker.cjs") {
        // The fixed function/arity are authoritative; bundler-local parameter
        // names may change without changing the production boundary.
        const signatures = [...source.matchAll(/function projectSourceRole\(([A-Za-z_$][\w$]*), [A-Za-z_$][\w$]*, [A-Za-z_$][\w$]*\) \{/g)]
        if (signatures.length !== 1) throw Error("unique actual project-role boundary required")
        const signature = signatures[0][0], fileParameter = signatures[0][1]
        source = source.replace(signature, signature + "globalThis.__initialScopeCancellation(" + fileParameter + ");")
        source += `\n{const resolve = ScopeModuleBindings.prototype.resolve;ScopeModuleBindings.prototype.resolve = function(...args) {globalThis.__initialBindingCancellation();return Reflect.apply(resolve,this,args)}}\n`

      }
      return Reflect.apply(compile, this, [source, file])
    }
  }
}
