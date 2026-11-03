import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { groupInputWorkspace } from "../fixtures/semantic-group-input-workspace.mjs"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

for (const mode of ["resident", "mixed", "pending", "pending-copy"]) test(`${mode} evidence budget exhaustion cannot authorize source-driven input renewal`,
  { timeout: 40_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      ARKTS_TEST_WITNESS_BUDGET_MODE: mode,
      NODE_OPTIONS: `--require=${path.resolve("tests/fixtures/witness-budget-limit.cjs")}` })
    const target = "export class Target {}\n"
    const main = (imports = "") => imports + "import { Target } from './Target'\nexport const value = new Target()\n"
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), main())
    fs.writeFileSync(path.join(f.workspace, "Target.ets"), target)
    const pending = mode.startsWith("pending")
    const count = pending ? 0 : 400
    const imports = []
    for (let index = 0; index < count; index++) {
      fs.writeFileSync(path.join(f.workspace, `File${index}.ets`), `export class Value${index} {}\n`)
      imports.push(`import { Value${index} } from './File${index}'`)
    }
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const prepared = await f.session.transport.notification("arkts/semanticPreparation",
      message => message.params.phase === "complete", 15_000)
    assert.equal(prepared.params.report.semanticState, "ready", JSON.stringify(prepared.params.report))
    const query = line => f.session.request("textDocument/definition", { textDocument: { uri: f.uri("Main.ets") },
      position: { line, character: 26 } }, { timeoutMs: 15_000 })
    const exact = response => {
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [{ uri: f.uri("Target.ets"), range: {
        start: { line: 0, character: 13 }, end: { line: 0, character: 19 } } }])
    }
    exact(await query(1))
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: main() })
    const contexts = f.events().filter(event => event.event === "semantic.context.create").length
    if (!pending) {
      if (mode === "mixed") fs.writeFileSync(path.join(f.directory, "arm-witness-change"), "")
      f.session.changeDocument({ uri: f.uri("Main.ets"), version: 2, text: main(imports.join("\n") + "\n") })
      assert.equal((await query(count + 1)).error?.code, -32803)
      const evidence = fs.readFileSync(path.join(f.directory, "witness-capacity.jsonl"), "utf8")
        .trim().split("\n").map(line => JSON.parse(line))
      t.diagnostic(JSON.stringify({ mode, evidence }))
      assert.ok(evidence.some(row => row.reason === "witness-capacity" && row.limit === 32768
        && row.accountedBytes <= row.limit && row.retainedPaths < 4096), JSON.stringify(evidence))
      if (mode === "mixed") {
        assert.ok(fs.existsSync(path.join(f.directory, "witness-source-changed")), "the source changes in an actual lookup window")
        const first = evidence.findIndex(row => row.reason === "changed-during-load")
        assert.ok(first >= 0 && evidence.slice(first + 1).some(row => row.reason === "witness-capacity"
          && row.owner === evidence[first].owner), "a recoverable source failure precedes capacity failure in the same witness")
      }
      f.session.changeDocument({ uri: f.uri("Main.ets"), version: 3, text: main() })
    }
    fs.unlinkSync(path.join(f.workspace, "Unopened.ets"))
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: f.uri("Unopened.ets"), type: 3 }] } })
    for (let repeat = 0; repeat < 2; repeat++) {
      const response = await query(1)
      assert.equal(response.error?.code, -32803, JSON.stringify(response))
    }
    if (pending) assert.equal(f.events().filter(event => event.event === "semantic.context.create").length,
      contexts, "pending capacity must reject before replacing the old owner")
    if (mode === "pending-copy") {
      const copies = fs.readFileSync(path.join(f.directory, "witness-copy-overflow.jsonl"), "utf8")
        .trim().split("\n").map(line => JSON.parse(line))
      assert.ok(copies.length >= 2, "each rejected request must reach actual capsule construction")
      assert.ok(copies.every(row => row.factCount > 0 && row.accountedBytes <= row.limit
        && row.accountedBytes + row.nextFactBytes > row.limit && row.limit > 128), JSON.stringify(copies))
      t.diagnostic(JSON.stringify({ mode, copies }))
    }
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
      params: { settings: { arkts: { sdk: { path: f.sdk } } } } })
    exact(await query(1))
    exact(await query(1))
    assert.equal(f.events().filter(event => event.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
  })

test("failed module capsules share pending capacity and configuration releases it", { timeout: 40_000 }, async t => {
  const files = {}
  for (const module of ["a", "b"]) {
    files[`${module}/src/main/ets/Query.ets`] = 'import { Target } from "./Target"\nexport const value = new Target()\n'
    files[`${module}/src/main/ets/Target.ets`] = "export class Target {}\n"
    files[`${module}/src/main/ets/Disposable.ets`] = "export const removable = 1\n"
  }
  const f = await groupInputWorkspace(t, files, { ARKTS_TEST_WITNESS_BUDGET_MODE: "pending-aggregate",
    NODE_OPTIONS: `--require=${path.resolve("tests/fixtures/witness-budget-limit.cjs")}` })
  const query = module => f.define(`${module}/src/main/ets/Query.ets`, files[`${module}/src/main/ets/Query.ets`], "Target")
  const exact = (response, module) => {
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [{ uri: f.uri(`${module}/src/main/ets/Target.ets`), range: {
      start: { line: 0, character: 13 }, end: { line: 0, character: 19 } } }])
  }
  for (const module of ["a", "b"]) exact(await query(module), module)
  const lifecycle = path.join(f.directory, "witness-pending-lifecycle.jsonl")
  if (fs.existsSync(lifecycle)) fs.writeFileSync(lifecycle, "")
  const metadata = path.join(f.sdk, "ets", "oh-uni-package.json")
  fs.writeFileSync(metadata, fs.readFileSync(metadata, "utf8").replace('"24"', '"25"'))
  fs.unlinkSync(path.join(f.workspace, "Unopened.ets"))
  f.watch("Unopened.ets", 3)
  for (const module of ["a", "b", "a", "b"]) assert.equal((await query(module)).error?.code, -32803)
  const read = () => fs.readFileSync(lifecycle, "utf8").trim().split("\n").map(line => JSON.parse(line))
  const pending = read()
  t.diagnostic(JSON.stringify({ pending }))
  const retained = pending.find(row => row.event === "retain" && row.bytes > 0)
  assert.ok(retained)
  const competing = pending.find(row => row.event === "capture" && row.bytes === retained.bytes
    && row.contextId !== retained.contextId)
  assert.ok(competing, "a distinct real module context competes with retained denial evidence")
  assert.equal(competing.bytes + competing.entryBytes + competing.available, 12288)
  const copies = fs.readFileSync(path.join(f.directory, "witness-copy-overflow.jsonl"), "utf8")
    .trim().split("\n").map(line => JSON.parse(line))
  assert.ok(copies.some(row => row.factCount > 0 && row.limit === competing.available
    && row.accountedBytes <= row.limit && row.accountedBytes + row.nextFactBytes > row.limit))
  f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
    params: { settings: { arkts: { sdk: { path: f.sdk } } } } })
  for (const module of ["a", "b", "a", "b"]) exact(await query(module), module)
  for (const module of ["a", "b"]) {
    fs.unlinkSync(path.join(f.workspace, `${module}/src/main/ets/Disposable.ets`))
    f.watch(`${module}/src/main/ets/Disposable.ets`, 3)
  }
  for (const module of ["a", "b"]) exact(await query(module), module)
  const finalLifecycle = read()
  t.diagnostic(JSON.stringify({ lifecycle: finalLifecycle.map(({ event, bytes, cost, available, count }) =>
    ({ event, bytes, cost, available, count })), copies }))
  assert.ok(finalLifecycle.filter(row => row.event === "retain").length >= 3,
    "released capacity admits both healthy replacement capsules")
  assert.ok(finalLifecycle.some(row => row.event === "clear" && row.bytes === 0 && row.count === 0),
    "explicit SDK configuration clears pending capsule accounting")
  assert.ok(finalLifecycle.filter(row => row.event === "release" && row.bytes === 0).length >= 2,
    "each successful source replacement releases its capsule accounting")
  assert.equal(f.events().filter(event => event.event === "semantic.worker.started").length, 1)
  assert.deepEqual((await f.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
})
