const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const { isMainThread, threadId, parentPort } = require("node:worker_threads")

// Observe physical metadata reads reached through the real request-sharing path.
// Direct read-before/read-after guards remain independent and are counted apart.
// A completed Native receipt is counted separately from executing a new read callback.
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private input budget fixture required")
  const marker = path.join(directory, "arm-input-identity-budget")
  const output = path.join(directory, `input-identity-budget-${threadId}.json`)
  const shared = new Map(), borrowed = new Map(), actual = new Map(), identityBytes = new Map()
  const count = (values, file) => {
    if (!/^Filler\d+\.ets$/.test(path.basename(file)) || !fs.existsSync(marker)) return
    values.set(file, (values.get(file) ?? 0) + 1)
  }
  const phaseRaw = new Map(), phaseCalls = new Map(), phaseReads = new Map()
  const observePhase = (table, file, kind) => {
    const name = path.basename(String(file))
    if (!/^Filler\d+\.ets$/.test(name) || !fs.existsSync(marker)) return
    const phase = globalThis.__budgetPhase?.() ?? "outside", command = globalThis.__budgetCommand ?? "outside"
    const key = command + ":" + phase, row = table.get(name) ?? {}
    row[key] = (row[key] ?? 0) + 1; table.set(name, row)
  }
  const lstat = fs.lstatSync
  fs.lstatSync = function(file, ...args) { const value = Reflect.apply(lstat, this, [file, ...args]); observePhase(phaseRaw, file, "raw"); return value }
  globalThis.__observeBudgetIdentityCall = file => observePhase(phaseCalls, file, "call")
  const phaseHistogram = table => {
    const phases = new Set([...table.values()].flatMap(row => Object.keys(row))), output = {}
    for (const phase of phases) {
      const counts = {}; for (const file of shared.keys()) { const value = table.get(path.basename(file))?.[phase] ?? 0; counts[value] = (counts[value] ?? 0) + 1 }
      output[phase] = counts
    }
    return output
  }
  globalThis.__observeSharedIdentityRead = (file, identity) => {
    observePhase(phaseReads, file, "read")
    count(shared, file)
    if (shared.has(file) && identity) identityBytes.set(file,
      128 + 2 * (file.length + identity.physicalPath.length + identity.stamp.length))
  }
  globalThis.__observeBorrowedInput = file => count(borrowed, file)
  globalThis.__observeActualIdentityRead = file => count(actual, file)
  const compile = Module.prototype._compile
  Module.prototype._compile = function (source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const sharedHook = "function requestFileIdentity(filePath, read) {"
      const actualHook = "function diskIdentity(filePath) {"
      if (source.split(sharedHook).length !== 2 || source.split(actualHook).length !== 2) {
        throw Error("one actual request sharing and physical identity function required")
      }
      source = source.replace(sharedHook, sharedHook + `globalThis.__observeBudgetIdentityCall(filePath);
        const observedRead = read;
        read = () => { const value = observedRead(); globalThis.__observeSharedIdentityRead(filePath, value); return value; };`)
      source = source.replace(actualHook, actualHook + "\nglobalThis.__observeActualIdentityRead(filePath);")
      const start = source.indexOf(sharedHook), end = source.indexOf("\nfunction ", start + sharedHook.length)
      const body = source.slice(start, end), handoffs = [...body.matchAll(/  ([A-Za-z_$][\w$]*) \?\?= read\(\);/g)]
      if (handoffs.length !== 1) throw Error("unique completed-Native identity handoff required")
      const [borrowedHook, current] = handoffs[0]
      source = source.slice(0, start) + body.replace(borrowedHook,
        `  if (${current}) globalThis.__observeBorrowedInput(filePath);\n` + borrowedHook) + source.slice(end)
      source += "\nglobalThis.__budgetPhase=()=>finalizing?'final':active?'query':preparation?'preparation':'outside';"
      const answer = "async function answerRequest(request) {"
      if (source.split(answer).length !== 2) throw Error("unique budget diagnostic request required")
      source = source.replace(answer, `async function answerRequest(request) {
        globalThis.__budgetCommand=request.method;
        try{return await budgetObservedAnswer(request)}finally{globalThis.__budgetCommand=undefined}
      } async function budgetObservedAnswer(request) {`)

    }
    return Reflect.apply(compile, this, [source, file])
  }
  const post = parentPort.postMessage
  parentPort.postMessage = function (message, ...args) {
    if (message?.workerEvent !== "log") fs.writeFileSync(output, JSON.stringify({
      phaseRaw: phaseHistogram(phaseRaw), phaseCalls: phaseHistogram(phaseCalls), phaseReads: phaseHistogram(phaseReads), borrowed: Object.fromEntries(borrowed),
      pid: process.pid, threadId, shared: Object.fromEntries(shared), actual: Object.fromEntries(actual),
      observedIdentityBytes: [...identityBytes.values()].reduce((sum, bytes) => sum + bytes, 0) }))
    return post.call(this, message, ...args)
  }
}
