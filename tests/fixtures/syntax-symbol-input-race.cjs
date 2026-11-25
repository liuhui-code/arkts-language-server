const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
if (!require("node:worker_threads").isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const root = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(root).startsWith("arkts-semantic-ready-")) throw Error("private fixture required")
  let nextOwner = 0
  const owners = new WeakMap()
  const ownerId = owner => { if (!owners.has(owner)) owners.set(owner, ++nextOwner); return owners.get(owner) }
  const log = row => fs.appendFileSync(path.join(root, "syntax-symbol-events.jsonl"), JSON.stringify(row) + "\n")
  globalThis.__syntaxSymbolOwner = (owner, document) => log({ event: "symbols", owner: ownerId(owner),
    uri: document.uri, retainedPathFacts: owner.inputs.pathIdentities.size,
    retainedValueFacts: owner.inputs.identities.size })
  globalThis.__syntaxFactoryEvent = row => log(row)
  globalThis.__syntaxSymbolDisposed = owner => log({ event: "disposed", owner: ownerId(owner) })
  globalThis.__syntaxSymbolMutation = stage => {
    const arm = path.join(root, "arm-syntax-symbol.json")
    if (!fs.existsSync(arm)) return
    const spec = JSON.parse(fs.readFileSync(arm, "utf8"))
    if (spec.stage !== stage) return
    fs.unlinkSync(arm)
    if (spec.kind === "replace") {
      const text = fs.readFileSync(spec.file, "utf8"), old = spec.file + ".old-proof"
      fs.renameSync(spec.file, old)
      fs.writeFileSync(spec.file, text)
      fs.unlinkSync(old)
    } else fs.appendFileSync(spec.file, spec.kind === "unrelated" ? "\nclass NewFromSyntaxProbe {}\n" : "\n")
    log({ event: "mutated", ...spec })
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const boundary = "finalizing = true;"
      if (source.split(boundary).length !== 2) throw Error("unique final boundary required")
      source = source.replace(boundary, boundary + " globalThis.__syntaxSymbolMutation('final-entry');")
      const answer = "async function answerRequest(request) {"
      if (source.split(answer).length !== 2) throw Error("unique request cancellation observation required")
      source = source.replace(answer, answer + " globalThis.__syntaxRequestCell = request.cancelCell;")
      source += `\n{
        let syntaxConstruction = false;
        const recoverable = recoverableLanguageService;
        recoverableLanguageService = function(...args) {
          const previous = syntaxConstruction;
          syntaxConstruction = args[5] === 2;
          globalThis.__syntaxFactoryEvent({ event: 'factory', mode: args[5] ?? 0 });
          if (syntaxConstruction) {
            const host = args[0], roots = host.getScriptFileNames;
            host.getScriptFileNames = function(...values) {
              globalThis.__syntaxFactoryEvent({ event: 'syntax-root-enumeration' });
              return Reflect.apply(roots, this, values)
            };
          }
          try { return Reflect.apply(recoverable, this, args) }
          finally { syntaxConstruction = previous }
        };
        const owned = ownedDocumentRegistry;
        ownedDocumentRegistry = function(...args) {
          const owner = Reflect.apply(owned, this, args);
          if (syntaxConstruction) {
            const release = owner.releaseRemaining;
            owner.releaseRemaining = function(...values) {
              globalThis.__syntaxFactoryEvent({ event: 'syntax-registry-owner-released' });
              return Reflect.apply(release, this, values)
            };
          }
          return owner
        };
        const map = navigationSymbols;
        navigationSymbols = function(...args) {
          const arm = ${JSON.stringify(path.join(root, "arm-syntax-cancel"))};
          if (require('node:fs').existsSync(arm)) {
            require('node:fs').unlinkSync(arm);
            require('node:fs').writeFileSync(${JSON.stringify(path.join(root, "syntax-cancel-entered"))}, 'entered');
            const view = new Int32Array(globalThis.__syntaxRequestCell), deadline = Date.now() + 3000;
            while (Atomics.load(view, 0) === 0 && Date.now() < deadline) Atomics.wait(view, 0, 0, 10);
            if (Atomics.load(view, 0) === 0) throw Error('test did not deliver real parent cancellation');
          }
          return Reflect.apply(map, this, args)
        };

        const symbols = SyntaxDocumentSymbolsOwner.prototype.symbols;
        SyntaxDocumentSymbolsOwner.prototype.symbols = function(document, ...args) {
          const value = Reflect.apply(symbols, this, [document, ...args]);
          globalThis.__syntaxSymbolOwner(this, document);
          globalThis.__syntaxSymbolMutation('after-symbols');
          return value
        };
        const dispose = SyntaxDocumentSymbolsOwner.prototype.dispose;
        SyntaxDocumentSymbolsOwner.prototype.dispose = function(...args) {
          globalThis.__syntaxSymbolDisposed(this);
          return Reflect.apply(dispose, this, args)
        };
      }\n`
    }
    return Reflect.apply(compile, this, [source, file])
  }
}
