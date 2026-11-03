const fs = require("node:fs")
const path = require("node:path")
const { AsyncLocalStorage } = require("node:async_hooks")
const { createHash, randomBytes } = require("node:crypto")
const { threadId } = require("node:worker_threads")
const context = new AsyncLocalStorage()
const originalAppend = fs.appendFileSync.bind(fs)
const originalWrite = fs.writeFileSync.bind(fs)
const ownerIds = new WeakMap(), programIds = new WeakMap()
let nextOwner = 0, nextProgram = 0, events = 0, disabled = false, builds = 0
const counters = Object.create(null)
const salt = randomBytes(16)
const targets = new Set()
let targetOverflow = false, candidateHits = 0, candidateMisses = 0
const MAX_EVENTS = 4096, MAX_TARGETS = 65536
const ioEnabled = process.env.ARKTS_CLOSURE_IO === "1"
const workspace = process.env.ARKTS_CLOSURE_WORKSPACE, sdk = process.env.ARKTS_CLOSURE_SDK
function snapshot() { return JSON.parse(JSON.stringify(counters)) }
function delta(before) {
  return Object.fromEntries(Object.entries(counters).map(([scope, values]) => [scope,
    Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value - (before[scope]?.[key] ?? 0)]))]))
}
function stopObservation(reason) {
  disabled = true
  try { originalWrite(process.env.ARKTS_CLOSURE_TRACE + ".status", JSON.stringify({ status: "unavailable", reason })) } catch {}
}
function observe(run) { if (disabled) return; try { return run() } catch { stopObservation("observer-error") } }
function record(value) {
  if (disabled) return
  if (events >= MAX_EVENTS) { stopObservation("event-capacity"); return }
  const scope = context.getStore() ?? {}
  try {
    originalAppend(process.env.ARKTS_CLOSURE_TRACE, JSON.stringify({ schema: 1, atMs: performance.now(),
      pid: process.pid, threadId, epoch: scope.epoch ?? null, commandId: scope.commandId ?? null,
      ownerId: scope.ownerId ?? null, ownerRole: scope.ownerRole ?? "unassigned", role: scope.role ?? "unassigned", ...value }) + "\n")
    events++
  } catch { stopObservation("sink-error") } // Observation failure never changes the compiler's result or exception.
}
function safeErrorName(error) {
  try {
    const name = error?.name
    return ["Error", "TypeError", "RangeError", "SyntaxError", "OperationCanceledException"].includes(name) ? name : "unknown"
  }
  catch { return "unknown" }
}
function within(root, file) {
  const relative = path.relative(root, path.resolve(file))
  return relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)
}
function classify(files) {
  const counts = { project: 0, sdk: 0, standardLibrary: 0, other: 0 }
  for (const file of files) counts[within(workspace, file) ? "project" : within(sdk, file) ? "sdk"
    : /^lib(?:\.[a-z0-9]+)*\.d\.ts$/i.test(path.basename(file)) ? "standardLibrary" : "other"]++
  return counts
}
function scope(category, run) {
  const previous = context.getStore() ?? {}
  if (category === "load-guard" && ["validation", "final-fence"].includes(previous.io)) return run()
  return context.run({ ...previous, io: category }, run)
}
if (ioEnabled) for (const name of ["statSync", "lstatSync", "openSync", "readSync", "fstatSync", "closeSync", "readFileSync", "readdirSync"]) {
  const original = fs[name]
  fs[name] = function (...args) {
    const label = context.getStore()?.io ?? "other"
    const counts = counters[label] ??= Object.create(null)
    counts[name] = (counts[name] ?? 0) + 1
    return Reflect.apply(original, this, args)
  }
}
const realpathNative = fs.realpathSync.native
if (ioEnabled) fs.realpathSync.native = function (...args) {
  const label = context.getStore()?.io ?? "other"
  const counts = counters[label] ??= Object.create(null)
  counts.realpathNative = (counts.realpathNative ?? 0) + 1
  return Reflect.apply(realpathNative, this, args)
}
globalThis.__arktsClosureObservation = {
  scope,
  command(command, run) {
    return context.run({ epoch: command.epoch, commandId: command.id ?? -command.revision, role: "unassigned" }, async () => {
      const started = builds, time = performance.now()
      record({ kind: "command-start", method: command.method ?? "mutation", prepare: command.args?.prepare === true })
      try { return await run() }
      finally { record({ kind: "command-return", method: command.method ?? "mutation", prepare: command.args?.prepare === true,
        elapsedMs: performance.now() - time, programStarts: builds - started }) }
    })
  },
  prepare(workspaceView, contextId, run) {
    const ownerRole = contextId.startsWith('["module",') ? "group" : "root"
    return context.run({ ...context.getStore(), ownerRole }, () => {
      record({ kind: "prepare", membership: workspaceView.projectMembership?.status ?? "absent",
        membershipCount: workspaceView.projectMembership?.paths.length ?? null,
        semanticRoots: workspaceView.semanticRootPaths?.length ?? null, documents: workspaceView.documents.length })
      return run()
    })
  },
  owner(host, sdkSelection, run) {
    if (!ownerIds.has(host)) ownerIds.set(host, ++nextOwner)
    const fields = { ownerId: ownerIds.get(host), ownerRole: context.getStore()?.ownerRole ?? "unassigned", role: "main" }
    return context.run({ ...context.getStore(), ...fields }, () => {
      record({ kind: "owner-create" })
      const service = run()
      for (const key of Object.keys(service)) {
        const original = service[key]
        if (typeof original !== "function") continue
        service[key] = function (...args) {
          return context.run({ ...context.getStore(), ...fields }, () => Reflect.apply(original, this, args))
        }
      }
      return service
    })
  },
  role(role, run) { return context.run({ ...context.getStore(), role }, run) },
  program(input, run) {
    const roots = observe(() => classify(Array.isArray(input) ? input : input.rootNames))
    const before = snapshot(), started = performance.now(), id = ++builds
    const hitsBefore = candidateHits, missesBefore = candidateMisses
    record({ kind: "program-start", buildId: id, roots })
    let program
    try { program = run() }
    catch (error) { record({ kind: "program-throw", buildId: id, roots, errorName: safeErrorName(error),
      elapsedMs: performance.now() - started, io: delta(before) }); throw error }
    const returnedAt = performance.now()
    observe(() => {
      if (!programIds.has(program)) programIds.set(program, ++nextProgram)
      const sources = program.getSourceFiles()
      record({ kind: "program-return", buildId: id, programId: programIds.get(program), roots,
        sources: classify(sources.map(source => source.fileName)), textCodeUnits: sources.reduce((n, source) => n + source.text.length, 0),
        elapsedMs: returnedAt - started, io: delta(before), candidateHits: candidateHits - hitsBefore, candidateMisses: candidateMisses - missesBefore,
        distinctInstalledCandidatesWorkerCumulative: targets.size, distinctInstalledCandidatesOverflow: targetOverflow })
    })
    return program
  },
  phase(phase, run) {
    const before = snapshot(), started = performance.now()
    return scope(phase === "final-fence" ? phase : context.getStore()?.io ?? "other", () => {
      let returned = false
      try { const result = run(); returned = true; return result }
      finally { record({ kind: returned ? "phase-return" : "phase-throw", phase, elapsedMs: performance.now() - started, io: delta(before) }) }
    })
  },
  installed(candidate, run) {
    observe(() => { if (!targetOverflow) {
      const key = createHash("sha256").update(salt).update(candidate).digest("base64")
      if (targets.size < MAX_TARGETS) targets.add(key)
      else if (!targets.has(key)) targetOverflow = true
    } })
    return scope("installed-source", run)
  },
  candidate(hit, run) { if (hit) candidateHits++; else candidateMisses++; return run() },
}
record({ kind: "observer-ready", ioEnabled, limits: { events: MAX_EVENTS, distinctTargets: MAX_TARGETS }, pathsRecorded: false })
