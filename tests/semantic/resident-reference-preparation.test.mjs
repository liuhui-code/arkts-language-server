import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

for (const resident of [false, true]) test(`reference preparation has one independent final fence (resident=${resident})`,
  { timeout: 40_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: resident ? "1" : "0",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-directory-resolution-count.cjs"))}` }, { serverPath: process.env.ARKTS_TEST_SERVER_PATH })
    const noise = path.join(f.workspace, "noise")
    fs.mkdirSync(noise)
    for (let i = 0; i < 64; i++) fs.writeFileSync(path.join(noise, `Unused${i}.ts`), "export {}\n")
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const progress = await f.session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
    f.session.transport.send({ jsonrpc: "2.0", id: progress.id, result: null })
    const ready = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    assert.equal(ready.params.report.semanticState, "ready")
    const uri = f.uri("Main.ets")
    f.session.openDocument({ uri, version: 1, text: f.sources["Main.ets"] })
    const definition = await f.session.request("textDocument/definition", {
      textDocument: { uri }, position: { line: 1, character: 25 } })
    assert.equal(definition.error, undefined)
    const response = await f.session.request("textDocument/references", {
      textDocument: { uri }, position: { line: 1, character: 25 }, context: { includeDeclaration: true } })
    assert.equal(response.error, undefined, JSON.stringify(response))
    const location = (uri, line, start, end) => ({ uri, range: {
      start: { line, character: start }, end: { line, character: end } } })
    const sorted = rows => rows.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    assert.deepEqual(sorted(response.result), sorted([
      location(uri, 0, 9, 21), location(uri, 1, 22, 34), location(f.uri("Unopened.ets"), 0, 16, 28),
    ]))
    const observed = fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse).filter(row => row.method === "references").at(-1)
    t.diagnostic(JSON.stringify({ resident, observed }))
    assert.equal(Object.entries(observed.membershipRawPassesByPhase).filter(([phase]) => phase !== "outside").reduce((sum, [, count]) => sum + count, 0), 2,
      "the real resident query must consume the preparation's original inputs and keep its final raw fence")
    if (!resident) {
      assert.equal(observed.leafStats, 192, "entry admission shares original preparation; post-search raw guard stays")
      assert.equal(observed.leafStatsByPhase.outside, 64, "only the post-search guard runs outside the preparation fence")
      assert.equal(observed.membershipRawPassesByPhase.outside, 1, "post-search now validates original namespaces as well as leaves")
    }
    if (resident) assert.ok(f.events().some(row => row.event === "references.resident.hit"))
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
  })

for (const kind of ["source", "created", "sdk", "sdk-metadata", "prepared-sdk"]) test(`resident references reject a ${kind} change after the actual lookup and then recover`,
  { timeout: 40_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1", ARKTS_TEST_MEMBER_RACE_AFTER_RESIDENT: "1",
      ARKTS_TEST_MEMBER_RACE_PREPARED_REFERENCE: kind === "prepared-sdk" ? "1" : "0",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/final-member-input-race.cjs"))}` },
    { serverPath: process.env.ARKTS_TEST_SERVER_PATH })
    fs.writeFileSync(path.join(f.workspace, "Unused0.ts"), "export {}\n")
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const progress = await f.session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
    f.session.transport.send({ jsonrpc: "2.0", id: progress.id, result: null })
    const ready = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    assert.equal(ready.params.report.semanticState, "ready")
    const uri = f.uri("Main.ets")
    f.session.openDocument({ uri, version: 1, text: f.sources["Main.ets"] })
    const params = { textDocument: { uri }, position: { line: 1, character: 25 } }
    assert.equal((await f.session.request("textDocument/definition", params)).error, undefined)
    const file = kind === "sdk-metadata" ? path.join(f.sdk, "ets/oh-uni-package.json")
      : kind === "sdk" || kind === "prepared-sdk" ? path.join(f.sdk, "ets/component/common.d.ts")
      : path.join(f.workspace, kind === "created" ? "NewGlobal.ts" : "Unused0.ts")
    fs.writeFileSync(path.join(f.directory, "arm-final-member.json"), JSON.stringify({ kind: kind === "sdk-metadata" ? "sdk" : kind === "sdk" || kind === "prepared-sdk" ? "source" : kind, stage: "entry", file }))
    const response = await f.session.request("textDocument/references", { ...params, context: { includeDeclaration: true } })
    assert.equal(response.error?.code, -32801, "a computed result invalidated by its final input fence is stale: " + JSON.stringify(response))
    assert.equal(response.result, undefined)
    const rows = fs.readFileSync(path.join(f.directory, "final-member-events.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
    assert.equal(rows.filter(row => row.event === "mutated").length, 1)
    if (kind === "prepared-sdk") assert.equal(rows.filter(row => row.event === "forced-resident-miss").length, 1)
    if (kind === "sdk-metadata") {
      f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
        params: { settings: { arkts: { sdk: { path: f.sdk } } } } })
    }
    const recovered = await f.session.request("textDocument/references", { ...params, context: { includeDeclaration: true } })
    assert.equal(recovered.error, undefined, JSON.stringify(recovered))
    assert.equal(recovered.result.length, 3)
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
  })

for (const stage of ["before-dispatch", "after-verifier"]) test(`isolated references refuse changed inputs ${stage} and recover`,
  { timeout: 40_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/reference-dispatch-input-race.cjs"))}` },
    { serverPath: process.env.ARKTS_TEST_SERVER_PATH })
    const file = path.join(f.workspace, "Unused0.ts")
    fs.writeFileSync(file, "export {}\n")
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const progress = await f.session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
    f.session.transport.send({ jsonrpc: "2.0", id: progress.id, result: null })
    const ready = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    assert.equal(ready.params.report.semanticState, "ready")
    const uri = f.uri("Main.ets"), params = { textDocument: { uri }, position: { line: 1, character: 25 } }
    f.session.openDocument({ uri, version: 1, text: f.sources["Main.ets"] })
    assert.equal((await f.session.request("textDocument/definition", params)).error, undefined)
    fs.writeFileSync(path.join(f.directory, "arm-reference-dispatch.json"), JSON.stringify({ stage, file }))
    const response = await f.session.request("textDocument/references", { ...params, context: { includeDeclaration: true } })
    assert.equal(response.error?.code, stage === "after-verifier" ? -32801 : -32803, JSON.stringify(response))
    assert.equal(response.result, undefined)
    const events = fs.readFileSync(path.join(f.directory, "reference-dispatch-events.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
    assert.equal(events.filter(row => row.event === "mutated").length, 1)
    assert.equal(events.filter(row => row.event === "dispatched").length, stage === "before-dispatch" ? 0 : 1)
    const recovered = await f.session.request("textDocument/references", { ...params, context: { includeDeclaration: true } })
    assert.equal(recovered.error, undefined, JSON.stringify(recovered))
    assert.equal(recovered.result.length, 3)
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
  })
