const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
const threads = require("node:worker_threads")
const directory = process.env.ARKTS_LSP_LOG_DIR && path.dirname(process.env.ARKTS_LSP_LOG_DIR)
if (directory && path.basename(directory).startsWith("arkts-semantic-ready-")) {
  const arm = path.join(directory, "arm-role-catalog.json"), compile = Module.prototype._compile
  const write = (name, text) => fs.writeFileSync(path.join(directory, name), text)
  if (threads.isMainThread) {
    Module.prototype._compile = function(source, file) {
      if (path.basename(file) === "server.cjs") {
        if (source.split("function cancelSemanticWorkerRequest(").length !== 2) throw Error("unique cancellation setter required")
        source += `\n{const original=cancelSemanticWorkerRequest;cancelSemanticWorkerRequest=function(...args){const result=Reflect.apply(original,this,args);if(require('node:fs').existsSync(${JSON.stringify(arm)}))require('node:fs').writeFileSync(${JSON.stringify(path.join(directory, "role-cancel-observed"))},String(result));return result}}\n`
      }
      return Reflect.apply(compile, this, [source, file])
    }
  } else {
    globalThis.__roleCatalogAfterFact = file => {
      if (globalThis.__roleCatalogMethod !== "typeDefinitions" || !fs.existsSync(arm)
        || fs.existsSync(path.join(directory, "role-catalog-paused"))) return
      if (file !== JSON.parse(fs.readFileSync(arm, "utf8")).file) return
      write("role-catalog-paused", "actual changed fact committed before catalog publication")
      const cell = new Int32Array(new SharedArrayBuffer(4)), until = Date.now() + 5000
      while (!fs.existsSync(path.join(directory, "resume-role-catalog"))) {
        if (Date.now() > until) throw Error("controlled role cancellation not acknowledged")
        Atomics.wait(cell, 0, 0, 5)
      }
    }
    Module.prototype._compile = function(source, file) {
      if (path.basename(file) === "semantic-worker.cjs") {
        const signature = "async function answerRequest(request) {"
        if (source.split(signature).length !== 2) throw Error("unique request boundary required")
        source = source.replace(signature, "async function answerRequest(request) {const previous=globalThis.__roleCatalogMethod;globalThis.__roleCatalogMethod=request.method;try{return await roleCatalogRequest(request)}finally{globalThis.__roleCatalogMethod=previous}} async function roleCatalogRequest(request) {")
        source += `\n{
          const ensure = ProjectOperationScopes.prototype.ensure;
          ProjectOperationScopes.prototype.ensure = function(...args) {
            const facts = this.facts, descriptor = Object.getOwnPropertyDescriptor(facts, 'set'), set = facts.set;
            facts.set = function(file, fact) { const result = Reflect.apply(set, this, [file, fact]); globalThis.__roleCatalogAfterFact(file); return result };
            try { return Reflect.apply(ensure, this, args) }
            finally { if (descriptor) Object.defineProperty(facts, 'set', descriptor); else delete facts.set }
          };
        }\n`
      }
      return Reflect.apply(compile, this, [source, file])
    }
  }
}
