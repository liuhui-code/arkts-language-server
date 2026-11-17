import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { auditFixture, until, rows, workerLifetime, exactDefinition } from "../support/worker-recovery-audit.mjs"
import { initializeReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("complete reference input admission can probe the shared circuit after authoritative repair",
  { timeout: 30_000 }, async t => {
    const f = await auditFixture(t, "references-input-admission-recovery", {
      loader: "registry-release-audit.cjs", env: { ARKTS_MEMORY_BUDGET_MB: undefined },
    })
    fs.writeFileSync(path.join(f.workspace, "Spare.ets"), "export const spare = 1\n")
    f.write("build-fault.json", { stage: "snapshot", remaining: 4 })
    f.write("audit-release.json", { mode: "before", remaining: 4 })
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "failed", 10_000)
    for (let i = 1; i <= 3; i++) {
      await until(() => f.events().filter(e => e.event === "semantic.worker.recovery.complete").length === i, "recovery " + i)
      assert.equal((await f.readiness()).error?.code, -32803)
    }
    await until(() => f.events().some(e => e.event === "semantic.worker.recovery.stopped"), "shared circuit open")
    assert.equal(rows(f).filter(r => r.event === "created").length, 4)
    const blocked = await f.request("textDocument/references", { textDocument: { uri: f.uri("Main.ets") },
      position: { line: 1, character: 25 }, context: { includeDeclaration: true } }, { timeoutMs: 10_000 })
    assert.equal(blocked.error?.code, -32803, "an open circuit remains a typed unavailable result")
    assert.equal(blocked.error?.data?.reason, "worker-unavailable")
    assert.equal(rows(f).filter(r => r.event === "created").length, 4)
    f.write("unresponsive-fault.json", { remaining: 0, clockOffset: 200000 })
    const elapsedOnly = await f.request("textDocument/references", { textDocument: { uri: f.uri("Main.ets") },
      position: { line: 1, character: 25 }, context: { includeDeclaration: true } }, { timeoutMs: 10_000 })
    assert.equal(elapsedOnly.error?.code, -32803, "time alone cannot grant a reference-input recovery probe")
    assert.equal(rows(f).filter(r => r.event === "created").length, 4)
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: "// fixed input\n" + f.sources["Main.ets"] })
    await f.barrier()
    assert.equal((await f.readiness(false)).error?.code, -32803, "pure status must not consume the explicit probe")
    assert.equal(rows(f).filter(r => r.event === "created").length, 4)
    const params = { textDocument: { uri: f.uri("Main.ets") }, position: { line: 2, character: 25 },
      context: { includeDeclaration: true } }
    const response = await f.request("textDocument/references", params, { timeoutMs: 10_000 })
    f.report.observations.references = response
    assert.equal(response.error, undefined, JSON.stringify(response))
    const location = (name, line, character) => ({ uri: f.uri(name), range: {
      start: { line, character }, end: { line, character: character + 12 },
    } })
    const order = items => [...items].sort((a, b) => a.uri.localeCompare(b.uri)
      || a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character)
    assert.deepEqual(order(response.result), order([location("Main.ets", 1, 9),
      location("Main.ets", 2, 22), location("Unopened.ets", 0, 16)]))
    const repeated = await f.request("textDocument/references", params, { timeoutMs: 10_000 })
    assert.deepEqual(repeated.result, response.result)
    assert.equal(rows(f).filter(r => r.event === "created").length, 5)
    assert.equal(workerLifetime(f).peak, 1)
  })

test("cleanup fault, duplicate fault and late old-Worker signal own one recovery", { timeout: 30000 }, async t => {
  const f = await auditFixture(t, "cleanup-fault-dedup", { loader: "registry-release-audit.cjs" })
  fs.writeFileSync(path.join(f.workspace, "Spare.ets"), "export const spare = 1\n")
  f.write("build-fault.json", { stage: "snapshot", remaining: 1 })
  f.write("audit-release.json", { mode: "after", remaining: 1 })
  f.write("audit-controls.json", { duplicateFault: true })
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
  await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "failed", 10000)
  assert.equal((await f.readiness()).result?.semanticState, "ready")
  await until(() => rows(f).filter(r => r.event === "fault-copy").length === 2, "two fault copies including retired instance")
  assert.deepEqual((await f.definition("Main.ets", 1)).result, exactDefinition(f, "neverQueried", 0))
  assert.equal(rows(f).filter(r => r.event === "created").length, 2)
  assert.equal(f.events().filter(r => r.event === "semantic.worker.recovery.complete").length, 1)
  assert.equal(workerLifetime(f).peak, 1)
})

test("cleanup quarantine consumes the shared bounded recovery budget", { timeout: 30000 }, async t => {
  const f = await auditFixture(t, "cleanup-shared-budget", { loader: "registry-release-audit.cjs" })
  fs.writeFileSync(path.join(f.workspace, "Spare.ets"), "export const spare = 1\n")
  f.write("build-fault.json", { stage: "snapshot", remaining: 4 })
  f.write("audit-release.json", { mode: "before", remaining: 4 })
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
  await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "failed", 10000)
  for (let i = 1; i <= 3; i++) {
    await until(() => f.events().filter(e => e.event === "semantic.worker.recovery.complete").length === i, "recovery " + i)
    assert.equal((await f.readiness()).error?.code, -32803)
  }
  await until(() => f.events().some(e => e.event === "semantic.worker.recovery.stopped"), "shared circuit open")
  assert.equal(f.read("audit-release.json").remaining, 0)
  f.configure()
  assert.equal((await f.readiness()).error?.code, -32803, "identical configuration cannot bypass the circuit")
  assert.equal(rows(f).filter(r => r.event === "created").length, 4)
  f.write("unresponsive-fault.json", { remaining: 0, clockOffset: 200000 })
  assert.equal((await f.readiness()).error?.code, -32803, "time alone cannot repair quarantined input")
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: "// fixed input\n" + f.sources["Main.ets"] })
  assert.equal((await f.readiness()).result?.semanticState, "ready")
  assert.deepEqual((await f.definition()).result, exactDefinition(f, "neverQueried", 0))
  assert.equal(rows(f).filter(r => r.event === "created").length, 5)
  assert.equal(workerLifetime(f).peak, 1)
})

test("cleanup uncertainty during shutdown still completes graceful shutdown once", { timeout: 15000 }, async t => {
  const f = await auditFixture(t, "cleanup-during-shutdown", { loader: "registry-release-audit.cjs" })
  await f.initialize()
  f.write("audit-release.json", { mode: "after", remaining: 1 })
  const closed = await f.session.close({ timeoutMs: 5000 })
  assert.deepEqual(closed.exit, { code: 0, signal: null })
  assert.equal(f.read("audit-release.json").remaining, 0)
  assert.equal(rows(f).filter(r => r.event === "receive" && r.message.workerEvent === "shutdownComplete").length, 1)
  assert.equal(rows(f).filter(r => r.event === "created").length, 1, "closing never initiates a replacement")
  assert.equal(workerLifetime(f).active, 0)
})

test("uncertain cleanup quarantines a Registry shared with a healthy semantic group", { timeout: 30000 }, async t => {
  const f = await auditFixture(t, "cleanup-shared-owner", { loader: "registry-release-audit.cjs" })
  const modules = ["Alpha", "Beta"]
  fs.writeFileSync(path.join(f.workspace, "build-profile.json5"), JSON.stringify({
    app: { products: [{ name: "default" }] }, modules: modules.map(name => ({ name, srcPath: "./" + name,
      targets: [{ name: "default", applyToProducts: ["default"] }] })) }))
  for (const name of modules) {
    const directory = path.join(f.workspace, name)
    fs.mkdirSync(path.join(directory, "src/main/ets"), { recursive: true })
    fs.writeFileSync(path.join(directory, "build-profile.json5"), "{targets:[{name:'default'}]}")
    fs.writeFileSync(path.join(directory, "oh-package.json5"), JSON.stringify({ name,
      main: "./src/main/ets/A.ets", dependencies: {} }))
    fs.writeFileSync(path.join(directory, "src/main/ets/A.ets"), "export function chosen() { return 1 }\nexport const use = chosen()\n")
    if (name === "Beta") fs.writeFileSync(path.join(directory, "src/main/ets/Spare.ets"), "export const spare = 1\n")
  }
  f.write("build-fault.json", { stage: "snapshot", remaining: 1 })
  f.write("audit-release.json", { mode: "after", remaining: 1 })
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
  await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "failed", 10000)
  const fault = rows(f, "audit-release.ndjson")[0]
  assert.equal(fault.physical, fs.realpathSync(path.join(f.workspace, "Beta/src/main/ets/A.ets")))
  assert.ok(fault.projectBefore.some(row => row.physical === fs.realpathSync(path.join(f.workspace, "Alpha/src/main/ets/A.ets")) && row.refs === 1))
  assert.equal((await f.readiness()).result?.semanticState, "ready")
  for (const name of modules) {
    const response = await f.definition(name + "/src/main/ets/A.ets", 1, 20)
    assert.deepEqual(response.result, [{ uri: f.uri(name + "/src/main/ets/A.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 22 } } }])
  }
  f.configure(); await f.readiness(false)
  assert.equal(f.read("build-state.json").projectRefs, 0)
  assert.equal(rows(f).filter(r => r.event === "created").length, 2)
  assert.equal(workerLifetime(f).peak, 1)
})


test("warm answer and qualified Native candidates cannot bypass a later recovery circuit",
  { timeout: 40_000 }, async t => {
    const f = await auditFixture(t, "warm-references-recovery-circuit", {
      loader: "registry-release-audit.cjs", env: { ARKTS_MEMORY_BUDGET_MB: undefined,
        ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0", ARKTS_INDEX_CATALOG_TRACE: "1" },
    })
    await initializeReadinessFixture(f)
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
    assert.equal((await f.readiness()).result?.semanticState, "ready", "warm cache history requires an actual complete Program")
    assert.ok(f.initialIndexQualification?.currentInput, "the starting Native token is observed, never invented")
    const references = (line, character = 25) => f.request("textDocument/references", {
      textDocument: { uri: f.uri("Main.ets") }, position: { line, character },
      context: { includeDeclaration: true },
    }, { timeoutMs: 10_000 })
    const first = await references(1)
    assert.equal(first.error, undefined, JSON.stringify(first))
    assert.equal(first.result.length, 3)
    await until(() => f.events().some(e => e.event === "index.maintenance.phase"
      && e.outcome === "qualified" && e.currentInput
      && e.inputRevision === f.initialIndexQualification.inputRevision
      && e.head === f.initialIndexQualification.head), "qualified current Native input")
    const narrowed = await references(1, 26)
    assert.deepEqual(narrowed.result, first.result)
    assert.ok(f.events().some(e => e.event === "references.index.accepted" && e.candidateFiles === 2),
      "the pre-failure history must actually include qualified Native narrowing")
    await references(1, 26)
    assert.ok(f.events().some(e => e.event === "references.cache.hit"),
      "the pre-failure history must actually include a result-cache hit")

    f.write("build-fault.json", { stage: "snapshot", remaining: 4 })
    f.write("audit-release.json", { mode: "before", remaining: 4 })
    // The controlled snapshot fault is specifically at Spare.ets, which was
    // absent from the successful two-file cache/Native history above.
    fs.writeFileSync(path.join(f.workspace, "Spare.ets"), "export const spare = 1\n")
    f.session.openDocument({ uri: f.uri("Spare.ets"), version: 1, text: "export const spare = 1\n" })
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 2,
      text: "// changed after warm queries\n" + f.sources["Main.ets"] })
    assert.equal((await f.readiness()).error?.code, -32803)
    for (let i = 1; i <= 3; i++) {
      await until(() => f.events().filter(e => e.event === "semantic.worker.recovery.complete").length === i,
        "warm recovery " + i)
      assert.equal((await f.readiness()).error?.code, -32803)
    }
    await until(() => f.events().some(e => e.event === "semantic.worker.recovery.stopped"), "warm circuit open")
    const blocked = await references(2, 26)
    assert.equal(blocked.error?.code, -32803)
    assert.equal(blocked.error?.data?.reason, "worker-unavailable")
    assert.equal(rows(f).filter(e => e.event === "created").length, 4)
    // A warm Host can retire during pre-build membership synchronization:
    // Registry release uncertainty consumes recovery without consuming the
    // later snapshot hook. Repair removes any remaining injected cause too.
    f.report.observations.faultAtRepair = f.read("build-fault.json")
    f.write("build-fault.json", { stage: "snapshot", remaining: 0 })
    f.write("audit-release.json", { mode: "before", remaining: 0 })
    f.write("unresponsive-fault.json", { remaining: 0, clockOffset: 200000 })
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 3,
      text: "// authoritative repaired input\n// changed after warm queries\n" + f.sources["Main.ets"] })
    await f.barrier()
    assert.equal((await f.readiness(false)).error?.code, -32803)
    const repaired = await references(3, 26)
    assert.equal(repaired.error, undefined, JSON.stringify(repaired))
    const expected = first.result.map(location => location.uri === f.uri("Main.ets")
      ? { ...location, range: { start: { ...location.range.start, line: location.range.start.line + 2 },
        end: { ...location.range.end, line: location.range.end.line + 2 } } } : location)
    assert.deepEqual(repaired.result, expected, "a repaired response must use the newest unsaved version")
    assert.deepEqual((await references(3, 26)).result, expected)
    assert.equal(rows(f).filter(e => e.event === "created").length, 5)
    assert.equal(workerLifetime(f).peak, 1)
    f.report.observations.warm = first
    f.report.observations.blocked = blocked
    f.report.observations.repaired = repaired
  })
