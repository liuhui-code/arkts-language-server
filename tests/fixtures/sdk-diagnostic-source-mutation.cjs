const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const { isMainThread, threadId } = require("node:worker_threads")

if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private SDK witness fixture required")
  const source = path.join(directory, "workspace", "ZZModel.ets")
  const arm = path.join(directory, "arm-sdk-mutation.json")
  const observed = path.join(directory, "sdk-mutated.json")
  let pendingLateMutation = false, failConstruction = false
  const mutateSdk = () => {
    const metadata = path.join(directory, "sdk", "ets", "oh-uni-package.json")
    const before = fs.readFileSync(metadata, "utf8"), after = before.replace('"24"', '"25"')
    if (before === after) throw Error("SDK mutation was not armed against API24")
    fs.writeFileSync(metadata, after)
  }
  const lstat = fs.lstatSync
  fs.lstatSync = function(file, ...args) {
    if ((pendingLateMutation || fs.existsSync(path.join(directory, "arm-late-sdk.json")))
      && !fs.existsSync(path.join(directory, "late-sdk-read.json"))
      && String(file) === path.join(directory, "sdk", "ets", "oh-uni-package.json")) {
      const previousLimit = Error.stackTraceLimit
      let caller
      try { Error.stackTraceLimit = 60; caller = new Error().stack }
      finally { Error.stackTraceLimit = previousLimit }
      if (caller.includes("loadCompilerSdk")) {
        pendingLateMutation = false
        mutateSdk()
        fs.writeFileSync(path.join(directory, "late-sdk-read.json"), JSON.stringify({ pid: process.pid, threadId, caller }))
      }
    }
    return Reflect.apply(lstat, this, [file, ...args])
  }
  globalThis.__sdkResetConstructionFault = () => {
    if (!failConstruction || pendingLateMutation) return
    failConstruction = false
    fs.writeFileSync(path.join(directory, "sdk-construction-failed.json"), JSON.stringify({ pid: process.pid, threadId }))
    throw Error("test: source replacement constructor failure")
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(sourceText, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const needle = "function createOfficialSemanticService(host, sdk, observe, invalidate, programReturned) {"
      if (sourceText.split(needle).length !== 2) throw Error("unique SDK replacement constructor hook required")
      sourceText = sourceText.replace(needle, needle + "globalThis.__sdkResetConstructionFault();")
    }
    return compile.call(this, sourceText, file)
  }
  const stat = fs.statSync
  fs.statSync = function(file, ...args) {
    if (String(file) === source && fs.existsSync(arm) && !fs.existsSync(observed)) {
      const previousLimit = Error.stackTraceLimit
      let caller
      try { Error.stackTraceLimit = 60; caller = new Error().stack }
      finally { Error.stackTraceLimit = previousLimit }
      if (caller.includes("collectDependencyClosure") && caller.includes("diagnose")) {
        const { sdkMutation } = JSON.parse(fs.readFileSync(arm, "utf8"))
        const before = fs.readFileSync(source, "utf8")
        const after = before.replaceAll("markerOld", "markerNew")
        if (before === after) throw Error("source mutation was not armed against old bytes")
        fs.writeFileSync(source, after)
        if (sdkMutation === "late" || sdkMutation === "late-construction-failure") {
          pendingLateMutation = true
          failConstruction = sdkMutation === "late-construction-failure"
        } else if (sdkMutation) mutateSdk()
        fs.writeFileSync(observed, JSON.stringify({ pid: process.pid, threadId, caller, sdkMutation }), { flag: "wx" })
      }
    }
    // Return the actual post-mutation filesystem observation, never a fabricated stat or response.
    return Reflect.apply(stat, this, [file, ...args])
  }
}
