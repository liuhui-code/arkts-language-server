const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const { AsyncLocalStorage } = require("node:async_hooks")
const { isMainThread, threadId, parentPort } = require("node:worker_threads")

if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw new Error("private source-evidence fixture required")
  const marker = path.join(directory, "source-read-phase")
  const phases = new Map()
  const hostPhases = new Map()
  const identityPhases = new Map()
  const rawIdentityPhases = new Map()
  const referenceIdentityPhases = new Map()
  globalThis.__residentEvidenceRequest = new AsyncLocalStorage()
  const lstat = fs.lstatSync
  fs.lstatSync = function(file, ...args) {
    const result = Reflect.apply(lstat, this, [file, ...args])
    if (/^@ohos\.sourceevidence\d+\.d\.ts$/.test(path.basename(String(file)))
      && new Error().stack.includes('at diskIdentity (')) {
      const phase = fs.existsSync(marker) ? fs.readFileSync(marker, "utf8") : "unarmed"
      if (!rawIdentityPhases.has(phase)) rawIdentityPhases.set(phase, {})
      const counts = rawIdentityPhases.get(phase)
      counts[file] = (counts[file] ?? 0) + 1
      if (globalThis.__residentEvidenceRequest.getStore()?.method === "references") {
        if (!referenceIdentityPhases.has(phase)) referenceIdentityPhases.set(phase, {})
        const references = referenceIdentityPhases.get(phase)
        references[file] = (references[file] ?? 0) + 1
      }
    }
    return result
  }
  globalThis.__observeResidentIdentity = (stage, file) => {
    if (!/^@ohos\.sourceevidence\d+\.d\.ts$/.test(path.basename(file))) return
    const phase = fs.existsSync(marker) ? fs.readFileSync(marker, "utf8") : "unarmed"
    if (!identityPhases.has(phase)) identityPhases.set(phase, { before: {}, after: {} })
    const counts = identityPhases.get(phase)[stage]
    counts[file] = (counts[file] ?? 0) + 1
  }
  globalThis.__observeResidentSourceRead = file => {
    if (!/^@ohos\.sourceevidence\d+\.d\.ts$/.test(path.basename(file))) return
    const phase = fs.existsSync(marker) ? fs.readFileSync(marker, "utf8") : "unarmed"
    if (!phases.has(phase)) phases.set(phase, new Map())
    const counts = phases.get(phase)
    counts.set(file, (counts.get(file) ?? 0) + 1)
  }
  globalThis.__observeHostSdkRead = (file, read) => {
    const result = read()
    if (/^@ohos\.sourceevidence\d+\.d\.ts$/.test(path.basename(file)) && result !== null) {
      const phase = fs.existsSync(marker) ? fs.readFileSync(marker, "utf8") : "unarmed"
      if (!hostPhases.has(phase)) hostPhases.set(phase, {})
      const rows = hostPhases.get(phase), row = rows[file] ?? { reads: 0, bytes: 0 }
      row.reads++; row.bytes += Buffer.byteLength(result); rows[file] = row
    }
    return result
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const dispatch = "async function dispatch(message, receivedAt) {"
      if (source.split(dispatch).length !== 2) throw Error("one actual worker dispatch required")
      source = source.replace(dispatch, dispatch
        + " return globalThis.__residentEvidenceRequest.run(message, () => __evidenceDispatch(message, receivedAt)); }"
        + " async function __evidenceDispatch(message, receivedAt) {")
      const snapshotHeader = "function compilerScriptSnapshot("
      if (source.split(snapshotHeader).length !== 2) throw Error("one actual compiler snapshot function required")
      const snapshotStart = source.indexOf(snapshotHeader), snapshotEnd = source.indexOf("\n}", snapshotStart) + 2
      if (snapshotEnd <= snapshotStart) throw Error("actual compiler snapshot function boundary required")
      const snapshot = source.slice(snapshotStart, snapshotEnd)
      const hostReads = ["safeRead", "readSourceFile"].map(reader => ({ reader,
        site: `const content = ${reader}(filePath);` })).filter(({ site }) => snapshot.includes(site))
      if (hostReads.length !== 1 || snapshot.split(hostReads[0].site).length !== 2) throw Error("one actual host fallback source read required")
      source = source.slice(0, snapshotStart) + snapshot.replace(hostReads[0].site,
        `const content = globalThis.__observeHostSdkRead(filePath, () => ${hostReads[0].reader}(filePath));`) + source.slice(snapshotEnd)
      const hook = "const currentText = this.readSourceFile(filePath);"
      if (source.split(hook).length !== 2) throw new Error("one actual resident source-read site required")
      source = source.replace(hook, "globalThis.__observeResidentSourceRead(filePath);\n" + hook)
      const beforeSites = ["const before = diskIdentity(filePath);",
        "const before = requestFileIdentity(filePath, () => diskIdentity(filePath));"].filter(site => source.includes(site))
      if (beforeSites.length !== 1) throw new Error("one actual before identity site required")
      for (const [stage, site] of [["before", beforeSites[0]],
        ["after", 'if (diskIdentity(filePath)?.stamp !== before.stamp)']]) {
        if (source.split(site).length !== 2) throw new Error("one actual observation identity site required")
        source = source.replace(site, `globalThis.__observeResidentIdentity(${JSON.stringify(stage)}, filePath);\n` + site)
      }
    }
    return Reflect.apply(compile, this, [source, file])
  }
  const post = parentPort.postMessage
  parentPort.postMessage = function(message, ...args) {
    if (message?.workerEvent !== "log") fs.writeFileSync(path.join(directory, `resident-source-reads-${threadId}.json`),
      JSON.stringify({ pid: process.pid, threadId, referenceIdentityPhases: Object.fromEntries(referenceIdentityPhases), hostPhases: Object.fromEntries(hostPhases), rawIdentityPhases: Object.fromEntries(rawIdentityPhases), identityPhases: Object.fromEntries(identityPhases), phases: Object.fromEntries(
        [...phases].map(([phase, counts]) => [phase, Object.fromEntries(counts)])) }))
    return post.call(this, message, ...args)
  }
}
