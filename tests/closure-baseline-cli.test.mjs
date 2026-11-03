import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

const runner = path.resolve("scripts/bench/measure-compiler-closure.mjs")
const hashes = ["fixture", "observedWorker", "observer", "preload", "reportHelper", "runner",
  "server", "sidecar", "transform", "worker"]

function invoke(output, options) {
  return spawnSync(process.execPath, [runner, "--out", output,
    ...Object.entries(options).flatMap(([name, value]) => [`--${name}`, String(value)])], {
    encoding: "utf8", timeout: 230_000, maxBuffer: 4 * 1024 * 1024,
  })
}

function run(t, options, expectedExit = 0) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-closure-cli-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const output = path.join(directory, "run")
  const result = invoke(output, options)
  assert.equal(result.status, expectedExit, `${result.error ?? ""}\n${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(path.join(output, "report.json"), "utf8"))
  assert.equal(report.schema, "arkts.compiler-closure-baseline")
  assert.equal(report.schemaVersion, 1)
  assert.equal(report.releaseEligible, false)
  assert.equal(report.syntheticSdk, true)
  assert.equal(report.inputUnchanged, true)
  assert.equal(report.artifactsUnchanged, true)
  assert.deepEqual(report.deadlines, { request: 30_000, preparation: 180_000, global: 120_000 })
  return { directory, output, report }
}

function fixtureWorkspace(output) {
  if (fs.existsSync(path.join(output, "workspace"))) return path.join(output, "workspace")
  for (const entry of fs.readdirSync(output, { withFileTypes: true })) {
    const workspace = path.join(output, entry.name, "workspace")
    if (entry.isDirectory() && fs.existsSync(workspace)) return workspace
  }
  assert.fail("runner must retain its private synthetic workspace for input verification")
}

function exactDefinitions(variant, workspace, relative = "Target.ets") {
  assert.equal(variant.definitions.length, 2)
  assert.ok(fs.existsSync(path.join(workspace, relative)), "the exact definition must name a real fixture source")
  const expected = [{ uri: `<workspace>/${relative}`,
    range: { start: { line: 0, character: 13 }, end: { line: 0, character: 19 } } }]
  for (const definition of variant.definitions) {
    assert.equal(definition.exact, true)
    assert.equal(definition.payload.error, undefined)
    assert.deepEqual(definition.payload.result, expected)
  }
  assert.equal(variant.workerStarts, 1, "observe one real semantic Worker, not an extra observer compiler")
  assert.equal(variant.failure, undefined)
  assert.deepEqual(variant.closed.exit, { code: 0, signal: null })
  assert.equal(variant.closed.shutdown.error, undefined)
  assert.equal(variant.closed.shutdown.result, null)
  assert.deepEqual(variant.watchdog, [])
}

function programs(variant, role) {
  return variant.observation.events.filter(event => event.kind === "program-return" && event.role === role)
}

test("closure baseline compares exact public definitions and observed compiler ownership", { timeout: 240_000 }, t => {
  const options = { files: 96, imports: 64, mode: "pair", io: "on" }
  const { directory, output, report } = run(t, options)
  assert.equal(report.status, "PASS")
  assert.equal(report.payloadParity, true)
  assert.equal(report.ioObservation, true)
  assert.deepEqual(report.variants.map(variant => variant.mode), ["off", "on"])
  const workspace = fixtureWorkspace(output)
  for (const variant of report.variants) {
    exactDefinitions(variant, workspace)
    assert.equal(variant.preparation.semanticState, "ready")
    assert.equal(variant.preparation.coverage.projectSources, 96)
    assert.equal(variant.status.result.semanticState, "ready")
    assert.equal(variant.status.result.coverage.projectSources, 96)
  }
  for (const name of hashes) assert.match(report.artifacts[`${name}Sha256`], /^[a-f0-9]{64}$/u, name)
  const observed = report.variants[1]
  assert.equal(observed.observation.status, "complete")
  assert.ok(programs(observed, "main").some(event => event.roots.project === 96 && event.sources.project === 96))
  const sdkPrograms = programs(observed, "sdk-export")
  assert.ok(sdkPrograms.length > 0)
  assert.ok(sdkPrograms.every(event => event.sources.project === 0))
  for (const event of programs(observed, "main")) {
    for (const name of ["epoch", "commandId", "ownerId", "buildId"]) {
      assert.ok(Number.isSafeInteger(event[name]) && event[name] > 0, `${name}: ${JSON.stringify(event)}`)
    }
  }
  const events = observed.observation.events
  assert.ok(events.some(event => event.kind === "phase-return" && event.phase === "final-fence"))
  const readonly = events.filter(event => event.kind === "command-return"
    && event.method === "semanticReadiness" && event.prepare === false)
  assert.ok(readonly.length > 0)
  assert.ok(readonly.every(event => event.programStarts === 0), "readonly status cannot secretly prepare")
  assert.ok(events.some(event => event.io?.["load-guard"]?.realpathNative > 0), "observe actual native realpath guard calls")
  const aggregate = JSON.stringify(events)
  assert.equal(aggregate.includes(directory), false, "aggregate trace must not contain local fixture paths")
  assert.equal(aggregate.includes("neverLogThisSourceMarker"), false, "aggregate trace must not contain source text")
  const before = fs.readFileSync(path.join(output, "report.json"), "utf8")
  const duplicate = invoke(output, options)
  assert.notEqual(duplicate.status, 0, "refuse an existing output rather than overwriting evidence")
  assert.equal(fs.readFileSync(path.join(output, "report.json"), "utf8"), before)
})

test("closure observation sink failure preserves real payload parity and reports incomplete evidence", { timeout: 240_000 }, t => {
  const { output, report } = run(t, { files: 8, imports: 2, mode: "pair", "trace-sink": "directory" }, 2)
  assert.equal(report.status, "INCOMPLETE_OBSERVATION")
  assert.equal(report.payloadParity, true)
  for (const variant of report.variants) exactDefinitions(variant, fixtureWorkspace(output))
  assert.equal(report.variants[1].observation.status, "unavailable")
  assert.equal(report.variants[1].observation.reason, "sink-error")
})

test("closure baseline separates partial catalog membership from actual imported Program closure", { timeout: 240_000 }, t => {
  const { output, report } = run(t, { files: 20_001, imports: 8, mode: "on" })
  assert.equal(report.status, "PASS")
  assert.equal(report.variants.length, 1)
  const observed = report.variants[0]
  exactDefinitions(observed, fixtureWorkspace(output))
  assert.equal(observed.preparation.semanticState, "degraded")
  assert.ok(observed.preparation.unavailableReasons.includes("project-membership-incomplete"))
  assert.equal(observed.observation.status, "complete")
  assert.ok(observed.observation.events.some(event => event.kind === "prepare"
    && event.membership === "partial" && event.membershipCount === 20_000 && event.semanticRoots === 0))
  const events = observed.observation.events
  const main = programs(observed, "main")
  const preparation = events.find(event => event.kind === "command-start"
    && event.method === "semanticReadiness" && event.prepare === true)
  assert.ok(preparation)
  assert.ok(main.some(event => event.commandId === preparation.commandId
    && event.epoch === preparation.epoch && event.roots.project === 0 && event.sources.project === 0),
    "partial preparation retains its SDK-only Program")
  const firstDefine = events.find(event => event.kind === "command-start" && event.method === "define")
  assert.ok(firstDefine)
  const queried = main.filter(event => event.commandId === firstDefine.commandId && event.epoch === firstDefine.epoch)
  assert.equal(queried.length, 1)
  assert.equal(queried[0].sources.project, 10, "first define builds Main + Target + eight imports, not 20k membership")
})

test("closure baseline observes five configured owners and root without rebuilding definition Programs", { timeout: 240_000 }, t => {
  const { output, report } = run(t, { groups: 5, files: 10, imports: 0, mode: "pair" })
  assert.equal(report.status, "PASS")
  assert.equal(report.ioObservation, false)
  assert.equal(report.payloadParity, true)
  for (const variant of report.variants) exactDefinitions(variant, fixtureWorkspace(output), "module4/src/main/ets/Target.ets")
  const observed = report.variants[1]
  assert.equal(observed.observation.status, "complete")
  const owners = observed.observation.events.filter(event => event.kind === "owner-create")
  assert.equal(owners.length, 6)
  assert.equal(owners.filter(event => event.ownerRole === "group").length, 5)
  assert.equal(owners.filter(event => event.ownerRole === "root").length, 1)
  const definitions = observed.observation.events.filter(event => event.kind === "command-return" && event.method === "define")
  assert.equal(definitions.length, 2)
  assert.ok(definitions.every(event => event.programStarts === 0))
})
