// Private fault/observation seam; only loaded by isolated public LSP tests.
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
const { isMainThread, threadId } = require("node:worker_threads")
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("isolated readiness fixture required")
  const registries = [], workspace = path.join(directory, "workspace")
  let attempts = 0, completed = 0
  const controlFile = path.join(directory, "build-fault.json")
  const fault = stage => {
    let value
    try { value = JSON.parse(fs.readFileSync(controlFile, "utf8")) } catch { return false }
    if (value.stage !== stage || !(value.remaining > 0)) return false
    fs.writeFileSync(controlFile, JSON.stringify({ ...value, remaining: value.remaining - 1 }))
    return true
  }
  const publish = (name, value) => {
    const output = path.join(directory, name), temporary = `${output}.${threadId}.tmp`
    try {
      fs.writeFileSync(temporary, JSON.stringify(value))
      fs.renameSync(temporary, output)
    } finally { fs.rmSync(temporary, { force: true }) }
  }
  const sample = () => {
    let projectRefs = 0, sdkRefs = 0
    for (const row of registries) {
      const registry = row.ref.deref()
      if (!registry) continue
      for (const input of row.inputs.values()) {
        const refs = registry.getLanguageServiceRefCounts(input.path, input.kind)
          .reduce((n, [, count]) => n + (count ?? 0), 0)
        if (input.project) projectRefs += refs
        else if (input.sdk) sdkRefs += refs
      }
    }
    const state = { attempts, completed, projectRefs, sdkRefs, threadId }
    publish("build-state.json", state)
    return state
  }
  setInterval(() => { if (registries.length && fault("exit-idle")) process.exit(17) }, 10).unref()
  const summarize = error => ({ type: error?.constructor?.name, message: error?.message,
    ...(error?.cause ? { cause: summarize(error.cause) } : {}),
    ...(error instanceof AggregateError ? { errors: error.errors.map(summarize) } : {}) })
  globalThis.__failedBuildTest = {
    afterSdkWarmup(program, host) {
      if (!fault("sdk-warmup-pause")) return program
      if (!program) throw Error("SDK warmup must have returned a real Program")
      const getToken = host.getCancellationToken, token = getToken.call(host)
      const started = performance.now(), deadline = Date.now() + 5_000
      publish("build-entered.json", { stage: "sdk-warmup", ...sample(),
        roots: program.getRootFileNames(), sources: program.getSourceFiles().map(file => file.fileName) })
      const wait = new Int32Array(new SharedArrayBuffer(4))
      while (!token.isCancellationRequested()) {
        if (Date.now() > deadline) throw Error("SDK warmup fixture did not observe real cancellation")
        Atomics.wait(wait, 0, 0, 10)
      }
      publish("sdk-warmup-cancel-observed.json", { cancelled: true, threadId, waitedMs: performance.now() - started })
      // Observe separately when production current() reads the same original token.
      host.getCancellationToken = function() {
        return { isCancellationRequested() {
          const cancelled = getToken.call(host).isCancellationRequested()
          publish("sdk-warmup-checkpoint.json", { cancelled, threadId })
          host.getCancellationToken = getToken
          return cancelled
        } }
      }
      return program
    },
    warmupError(error) {
      if (fs.existsSync(path.join(directory, "sdk-warmup-checkpoint.json"))) {
        publish("sdk-warmup-error.json", { ...sample(), error: summarize(error) })
      }
    },
    program(input, run) {
      const roots = Array.isArray(input) ? input : input?.rootNames ?? []
      const project = roots.some(file => path.resolve(file).startsWith(workspace + path.sep))
      let target
      try { target = JSON.parse(fs.readFileSync(controlFile, "utf8")).target } catch {}
      if (project === (target === "sdk-index")) return run()
      attempts++; sample()
      if (fault("exit")) process.exit(17)
      if (fault("before")) throw Error("test: before Program")
      const result = run(); completed++; sample()
      if (fault("after")) throw Error("test: after Program")
      if (fault("checker")) result.getTypeChecker = () => { throw Error("test: checker construction") }
      return result
    },
    service(host, run) {
      const snapshot = host.getScriptSnapshot
      host.getScriptSnapshot = function(file, ...args) {
        if (path.basename(file) === "Main.ets" && fault("pause-main")) {
          fs.writeFileSync(path.join(directory, "build-entered.json"), JSON.stringify({ file, threadId }))
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300)
        }
        if (path.basename(file) === "Spare.ets") {
          if (fault("snapshot")) throw Error("test: partial Program")
          const failAfterPause = fault("pause-failure")
          if (fault("pause") || failAfterPause) {
            fs.writeFileSync(path.join(directory, "build-entered.json"), JSON.stringify({ file, threadId }))
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300)
            if (failAfterPause) throw Error("test: snapshot failure after the cancellation window")
          }
        }
        return snapshot.call(this, file, ...args)
      }
      const service = run(), define = service.getDefinitionAtPosition
      service.getDefinitionAtPosition = function(...args) {
        if (fault("query-pause")) {
          fs.writeFileSync(path.join(directory, "build-entered.json"), JSON.stringify({ stage: "query", threadId }))
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300)
        }
        return define.apply(this, args)
      }
      return service
    },
    registry(registry) {
      if (registries.some(row => row.ref.deref() === registry)) return
      const row = { ref: new WeakRef(registry), inputs: new Map() }; registries.push(row)
      for (const method of ["acquireDocumentWithKey", "updateDocumentWithKey"]) {
        const original = registry[method]
        registry[method] = function(...args) {
          const result = original.apply(this, args)
          row.inputs.set(args[1], { path: args[1], kind: args[6] ?? result.scriptKind,
            project: path.resolve(args[0]).startsWith(workspace + path.sep),
            sdk: path.resolve(args[0]).startsWith(path.join(directory, "sdk") + path.sep) })
          sample(); return result
        }
      }
      const release = registry.releaseDocumentWithKey
      registry.releaseDocumentWithKey = function(...args) {
        let value
        try { value = JSON.parse(fs.readFileSync(controlFile, "utf8")) } catch {}
        const uncertain = value?.releaseAfterEffect && value.remaining === 0 && row.inputs.get(args[0])?.sdk
        if (uncertain) fs.writeFileSync(controlFile, JSON.stringify({ ...value, releaseAfterEffect: false }))
        const result = release.apply(this, args); sample()
        if (uncertain) throw Error("test: SDK Registry release after effect")
        return result
      }
    },
    observe(source) {
      if (path.resolve(source.fileName).startsWith(workspace + path.sep) && fault("observe")) {
        throw Error("test: SourceFile observation after acquire")
      }
    },
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      if (fs.existsSync(path.join(directory, "hold-startup"))) {
        fs.writeFileSync(path.join(directory, "startup-entered"), "entered")
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300)
      }
      const replace = (needle, value) => {
        if (source.split(needle).length !== 2) throw Error("unique failed-build hook required: " + needle)
        source = source.replace(needle, value)
      }
      const warmup = source.match(/  if \(initialPreparationActive\(\)\) \{[\s\S]*?\n  \}\n  return service;/g)
      if (warmup?.length !== 1 || warmup[0].split("index.getProgram();").length !== 2) {
        throw Error("unique SDK construction warmup hook required")
      }
      const body = warmup[0].slice("  if (initialPreparationActive()) {".length, -"\n  }\n  return service;".length)
        .replace("index.getProgram();", "globalThis.__failedBuildTest.afterSdkWarmup(index.getProgram(), enriched);")
      replace(warmup[0], "  if (initialPreparationActive()) { try {" + body
        + "\n  } catch (error) { globalThis.__failedBuildTest.warmupError(error); throw error; } }\n  return service;")
      const program = "function createProgram(rootNamesOrOptions, _options, _host, _oldProgram, _configFileParsingDiagnostics) {"
      replace(program, program + "return globalThis.__failedBuildTest.program(rootNamesOrOptions,()=>__testCreateProgram(...arguments)); } function __testCreateProgram(rootNamesOrOptions, _options, _host, _oldProgram, _configFileParsingDiagnostics) {")
      const service = "function createLanguageService(host, documentRegistry = createDocumentRegistry(host.useCaseSensitiveFileNames && host.useCaseSensitiveFileNames(), host.getCurrentDirectory()), syntaxOnlyOrLanguageServiceMode) {"
      replace(service, service + "return globalThis.__failedBuildTest.service(host,()=>__testCreateService(...arguments)); } function __testCreateService(host, documentRegistry, syntaxOnlyOrLanguageServiceMode) {")
      const registry = "return observe ? observedDocumentRegistry(registry, observe) : registry;"
      replace(registry, "globalThis.__failedBuildTest.registry(registry); " + registry)
      replace("    observe(source);", "    globalThis.__failedBuildTest.observe(source); observe(source);")
    }
    return compile.call(this, source, file)
  }
}
