import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import vm from "node:vm"

import { readClosureObservation, comparableClosureVariant, snapshotClosureArtifacts,
  closureArtifactsUnchanged, closureBaselineStatus } from "../scripts/bench/closure-observation-report.mjs"

const require = createRequire(import.meta.url)
const observerFile = path.resolve("scripts/bench/closure-observer.cjs")
const artifactNames = ["fixture", "observedWorker", "observer", "preload", "reportHelper", "runner",
  "server", "sidecar", "transform", "worker"]

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-closure-report-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

function event(kind, fields = {}) {
  return { schema: 1, pid: 1, threadId: 1, epoch: 1, commandId: 1, buildId: 1, kind, ...fields }
}

function healthyVariant(mode = "on") {
  const readiness = { rootUri: "file:///synthetic/workspace", semanticState: "ready",
    semanticGeneration: "epoch:original", unavailableReasons: [],
    inputIdentity: { sha256: "a".repeat(64) }, coverage: { projectSources: 8 } }
  const payload = { jsonrpc: "2.0", id: 3, result: [{ uri: "file:///synthetic/workspace/Target.ets",
    range: { start: { line: 0, character: 13 }, end: { line: 0, character: 19 } } }] }
  return { mode, preparation: structuredClone(readiness), preparationMs: 100,
    status: { jsonrpc: "2.0", id: 2, result: structuredClone(readiness) },
    definitions: [3, 4].map(id => ({ elapsedMs: 10, payload: { ...structuredClone(payload), id }, exact: true })),
    closed: { shutdown: { jsonrpc: "2.0", id: 5, result: null }, exit: { code: 0, signal: null } },
    observation: { status: "complete", events: [] }, workerStarts: 1, watchdog: [] }
}

function healthyReport() {
  return { inputUnchanged: true, artifactsUnchanged: true, payloadParity: true,
    variants: [healthyVariant("off"), healthyVariant("on")] }
}

test("closure receipts require matching command and Program terminals, retaining interrupted calls", t => {
  const trace = path.join(temporary(t), "trace.jsonl")
  const read = events => {
    fs.writeFileSync(trace, events.map(item => typeof item === "string" ? item : JSON.stringify(item)).join("\n") + "\n")
    return readClosureObservation(trace)
  }
  assert.equal(readClosureObservation(trace).status, "unavailable")
  const marker = trace + ".status"
  for (const invalid of [{ status: "complete" }, { status: "unavailable", reason: "private-unknown-reason" },
    { status: "unavailable", reason: "sink-error", extra: true }, null, []]) {
    fs.rmSync(trace, { force: true })
    fs.writeFileSync(marker, JSON.stringify(invalid))
    const missing = readClosureObservation(trace)
    assert.equal(missing.status, "incomplete", "a status marker cannot certify missing receipts")
    assert.equal(missing.reason, "invalid-status-marker")
    const readyOnly = read([event("observer-ready")])
    assert.equal(readyOnly.status, "incomplete", "a status marker cannot certify ready-only receipts")
    assert.equal(readyOnly.reason, "invalid-status-marker")
  }
  fs.writeFileSync(marker, JSON.stringify({ status: "unavailable", reason: "sink-error" }) + " ".repeat(1024))
  assert.equal(readClosureObservation(trace).reason, "invalid-status-marker", "status markers have a bounded read")
  fs.unlinkSync(marker)
  fs.mkdirSync(marker)
  assert.equal(readClosureObservation(trace).reason, "invalid-status-marker", "status markers must be regular files")
  fs.rmdirSync(marker)
  for (const reason of ["sink-error", "observer-error", "event-capacity"]) {
    fs.writeFileSync(marker, JSON.stringify({ status: "unavailable", reason }))
    const unavailable = readClosureObservation(trace)
    assert.equal(unavailable.status, "unavailable")
    assert.equal(unavailable.reason, reason)
  }
  fs.unlinkSync(marker)
  assert.notEqual(read([event("observer-ready")]).status, "complete")
  for (const invalid of ["{invalid-json", event("command-start", { schema: 2 }),
    event("command-start", { commandId: "1" }), event("not-a-closure-event")]) {
    assert.notEqual(read([event("observer-ready"), invalid]).status, "complete")
  }
  assert.notEqual(read([event("observer-ready"), event("command-start"),
    event("command-return", { commandId: 2 })]).status, "complete")
  const interrupted = read([event("observer-ready"), event("command-start"), event("program-start")])
  assert.equal(interrupted.status, "interrupted")
  assert.equal(interrupted.openPrograms, 1)
  assert.equal(interrupted.openCommands, 1)
  const complete = [event("observer-ready"), event("command-start"), event("program-start"),
    event("program-throw", { errorName: "Error" }), event("command-return")]
  assert.equal(read(complete).status, "complete", "an observed real throw is a terminal, not a fabricated return")
  assert.notEqual(read([...complete.slice(0, -1), event("program-throw"), complete.at(-1)]).status, "complete")
  assert.notEqual(read([...complete, event("command-return")]).status, "complete")
  assert.notEqual(read([event("observer-ready"), event("command-start"), event("program-start"),
    event("command-start", { commandId: 2 }), event("program-return", { commandId: 2 }),
    event("command-return", { commandId: 2 }), event("command-return")]).status, "complete")
})

test("closure parity compares preparation, readonly status, exact payloads, failures and shutdown", () => {
  const original = healthyVariant()
  const equivalent = structuredClone(original)
  equivalent.mode = "off"
  equivalent.preparationMs = 999
  equivalent.definitions[0].elapsedMs = 999
  equivalent.preparation.semanticGeneration = "epoch:new-preparation"
  equivalent.status.result.semanticGeneration = "epoch:new-status"
  equivalent.observation = { status: "disabled", events: [] }
  assert.deepEqual(comparableClosureVariant(original), comparableClosureVariant(equivalent))
  for (const mutate of [
    variant => { variant.preparation.semanticState = "degraded" },
    variant => { variant.preparation.coverage.projectSources++ },
    variant => { variant.status.result.semanticState = "degraded" },
    variant => { variant.status.result.inputIdentity.sha256 = "b".repeat(64) },
    variant => { variant.status = { jsonrpc: "2.0", id: 2, error: { code: -32603, message: "status failed" } } },
    variant => { variant.definitions[0].payload.result[0].range.end.character++ },
    variant => { variant.definitions[0].payload.id++ },
    variant => { variant.failure = { name: "Error", message: "request failed" } },
    variant => { variant.closed.shutdown = { jsonrpc: "2.0", id: 5, error: { code: -32603, message: "shutdown failed" } } },
    variant => { variant.closed.exit.code = 1 },
  ]) {
    const changed = structuredClone(original)
    mutate(changed)
    assert.notDeepEqual(comparableClosureVariant(original), comparableClosureVariant(changed))
  }
})

test("actual closure observer preserves compiler thrown objects and never emits arbitrary error names", t => {
  const directory = temporary(t)
  const trace = path.join(directory, "trace.jsonl")
  const sandbox = { require, performance, process: { pid: 1, env: {
    ARKTS_CLOSURE_TRACE: trace, ARKTS_CLOSURE_WORKSPACE: "/synthetic/workspace", ARKTS_CLOSURE_SDK: "/synthetic/sdk",
  } } }
  vm.runInNewContext(fs.readFileSync(observerFile, "utf8"), sandbox, { filename: observerFile })
  const observer = sandbox.__arktsClosureObservation
  assert.equal(typeof observer.program, "function")
  const privateName = "private-source-never-emit:" + "x".repeat(200_000)
  const inaccessible = Object.defineProperty({}, "name", { get() { throw new Error("private getter failure") } })
  let reads = 0
  const changing = Object.defineProperty({}, "name", { get() { return ++reads === 1 ? "Error" : privateName } })
  for (const error of [inaccessible, { name: privateName }, changing]) {
    assert.throws(() => observer.program([], () => { throw error }), caught => caught === error,
      "observer must rethrow the original object even if inspecting its name throws")
  }
  assert.equal(reads, 1, "read error.name once, rather than validate one value and serialize another")
  const raw = fs.readFileSync(trace, "utf8")
  const throws = raw.trim().split("\n").map(JSON.parse).filter(item => item.kind === "program-throw")
  assert.equal(throws.length, 3)
  assert.deepEqual(throws.map(item => item.errorName), ["unknown", "unknown", "Error"])
  assert.equal(raw.includes("private-source-never-emit"), false)
  assert.equal(raw.includes("private getter failure"), false)
  assert.equal(raw.includes("/synthetic/workspace"), false)
  assert.ok(raw.length < 16_384, "a huge private exception name must not inflate the aggregate receipt")
})

test("closure artifact identity detects every mutated or missing input including diagnostic implementation", t => {
  const directory = temporary(t)
  const paths = Object.fromEntries(artifactNames.map(name => [name, path.join(directory, name)]))
  for (const [name, file] of Object.entries(paths)) fs.writeFileSync(file, name)
  const before = snapshotClosureArtifacts(paths)
  assert.deepEqual(Object.keys(before).sort(), artifactNames.map(name => `${name}Sha256`).sort())
  assert.ok(Object.values(before).every(value => /^[a-f0-9]{64}$/u.test(value)))
  assert.equal(closureArtifactsUnchanged(paths, before), true)
  for (const [name, file] of Object.entries(paths)) {
    fs.writeFileSync(file, `changed:${name}`)
    assert.equal(closureArtifactsUnchanged(paths, before), false, `must detect mutation of ${name}`)
    fs.writeFileSync(file, name)
    assert.equal(closureArtifactsUnchanged(paths, before), true)
    fs.unlinkSync(file)
    assert.equal(closureArtifactsUnchanged(paths, before), false, `must detect missing ${name}`)
    fs.writeFileSync(file, name)
  }
})

test("equal readiness or shutdown failures and empty results never qualify as a passing baseline", () => {
  assert.equal(closureBaselineStatus(healthyReport()), "PASS")
  const degraded = healthyReport()
  for (const variant of degraded.variants) {
    variant.preparation.semanticState = "degraded"
    variant.status.result.semanticState = "degraded"
  }
  assert.equal(closureBaselineStatus(degraded), "PASS", "degraded readiness remains an observable valid baseline")
  for (const mutate of [
    variant => { variant.status = { error: { code: -32603, message: "same readiness error" } } },
    variant => { variant.closed.shutdown = { error: { code: -32603, message: "same shutdown error" } } },
    variant => { variant.closed.shutdown.error = { code: -32603, message: "malformed success plus error" } },
    variant => { variant.closed.exit.code = 1 },
    variant => { variant.closed.exit.signal = "SIGTERM" },
    variant => { delete variant.preparation },
    variant => { variant.definitions = [] },
    variant => { variant.definitions[0].exact = false },
    variant => { variant.failure = { name: "Error", message: "same request error" } },
  ]) {
    const report = healthyReport()
    report.variants.forEach(mutate)
    assert.deepEqual(comparableClosureVariant(report.variants[0]), comparableClosureVariant(report.variants[1]))
    assert.notEqual(closureBaselineStatus(report), "PASS", JSON.stringify(report))
  }
  for (const key of ["inputUnchanged", "artifactsUnchanged", "payloadParity"]) {
    const report = healthyReport()
    report[key] = false
    assert.equal(closureBaselineStatus(report), "INVALID")
  }
  const incomplete = healthyReport()
  incomplete.variants[1].observation.status = "interrupted"
  assert.equal(closureBaselineStatus(incomplete), "INCOMPLETE_OBSERVATION")
})
