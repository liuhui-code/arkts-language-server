import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { LspSession } from "../support/lsp-session.mjs"
import { makeQueryLayerFixture } from "../support/query-layer-fixture.mjs"

test("explicit READY lets the first never-opened reference use the existing complete Program",
  { timeout: 60_000 }, async t => {
    for (const includeDeclaration of [false, true]) {
      const fixture = await makeQueryLayerFixture(t, {
        files: { "Query.ets": "export const unused = 1\n", "Target.ets": "export class TargetThing {}\n",
          "Use.ets": 'import { TargetThing } from "./Target"\nexport const thing = new TargetThing()\n' },
        target: { kind: "references", file: "Use.ets", symbol: "TargetThing",
          position: { line: 1, character: 26 }, includeDeclaration },
        oracle: { schemaVersion: 1, locations: [{ file: "Use.ets", range: {
          start: { line: 0, character: 9 }, end: { line: 0, character: 20 },
        } }, { file: "Use.ets", range: {
          start: { line: 1, character: 25 }, end: { line: 1, character: 36 },
        } }, ...(includeDeclaration ? [{ file: "Target.ets", range: {
          start: { line: 0, character: 13 }, end: { line: 0, character: 24 },
        } }] : [])] },
      })
      const rootUri = pathToFileURL(fixture.suite.workspace).href
      const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
      const logs = path.join(fixture.directory, "logs")
      const events = () => fs.readFileSync(path.join(logs, "server.log"), "utf8").trim().split("\n").map(JSON.parse)
      const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"], rootUri,
        env: { ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"), ARKTS_LSP_LOG_DIR: logs,
          ARKTS_REFERENCES_TRACE: "1", ARKTS_BENCHMARK_CONTROL: "0" },
      })
      t.after(() => session.close().catch(() => {}))
      await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
      const prepared = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
      assert.equal(prepared.error, undefined, JSON.stringify(prepared))
      assert.equal(prepared.result?.semanticState, "ready", JSON.stringify(prepared))
      assert.equal(prepared.result.coverage.dependenciesComplete, true)
      assert.ok(prepared.result.readyCapabilities.includes(`references:includeDeclaration=${includeDeclaration}`))
      assert.match(prepared.result.inputIdentity.sha256, /^[a-f0-9]{64}$/)
      assert.ok(!events().some(event => event.event.endsWith("compiler-query.start")), "no target prequery")
      const response = await session.request("textDocument/references", { textDocument: { uri: uri("Use.ets") },
        position: { line: 1, character: 26 }, context: { includeDeclaration } }, { timeoutMs: 20_000 })
      assert.equal(response.error, undefined, JSON.stringify(response))
      const expected = [{ uri: uri("Use.ets"), range: {
        start: { line: 0, character: 9 }, end: { line: 0, character: 20 },
      } }, { uri: uri("Use.ets"), range: {
        start: { line: 1, character: 25 }, end: { line: 1, character: 36 },
      } }, ...(includeDeclaration ? [{ uri: uri("Target.ets"), range: {
        start: { line: 0, character: 13 }, end: { line: 0, character: 24 },
      } }] : [])]
      const sorted = locations => [...locations].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      assert.deepEqual(sorted(response.result), sorted(expected))
      const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
      assert.equal(current.error, undefined, JSON.stringify(current))
      assert.deepEqual(current.result, prepared.result, "the same complete proof must remain current")
      assert.equal(session.documentVersions.size, 0)
      assert.ok(!session.transport.messages.some(message => message.method === "textDocument/publishDiagnostics"),
        "a disk reference must not create an implicit didOpen or version-zero overlay")
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
      const runtime = events()
      t.diagnostic(JSON.stringify({ includeDeclaration, route: runtime.filter(event =>
        ["references.resident.proof.rejected", "references.resident.hit", "references.resident.miss",
          "references.batch.start", "semantic.context.create"].includes(event.event)) }))
      const hits = runtime.filter(event => event.event === "references.resident.hit")
      assert.equal(hits.length, 1, "explicit READY already proved the resident Program; do not rebuild it in a verifier")
      assert.equal(hits[0].programBuilds, 0)
      assert.equal(hits[0].verifierWorkerStarts, 0)
      assert.equal(runtime.filter(event => event.event === "references.batch.start").length, 0)
      assert.equal(runtime.filter(event => event.event === "semantic.context.create").length, 1)
    }
  })

for (const residentFirst of ["1", "0"]) {
  test(`the first references request joins automatic preparation with resident-first=${residentFirst}`,
    { timeout: 60_000 }, async t => {
      const source = "export class TargetThing {}\n"
      const use = 'import { TargetThing } from "./Target"\nexport const thing = new TargetThing()\n'
      const fixture = await makeQueryLayerFixture(t, {
        files: { "Target.ets": source, "Use.ets": use },
        target: { kind: "references", file: "Target.ets", symbol: "TargetThing",
          position: { line: 0, character: 14 }, includeDeclaration: false },
        oracle: { schemaVersion: 1, locations: [{ file: "Use.ets", range: {
          start: { line: 0, character: 9 }, end: { line: 0, character: 20 },
        } }, { file: "Use.ets", range: {
          start: { line: 1, character: 25 }, end: { line: 1, character: 36 },
        } }] },
      })
      const rootUri = pathToFileURL(fixture.suite.workspace).href
      const logs = path.join(fixture.directory, "logs")
      const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
      const session = new LspSession({ command: process.execPath,
        args: [fixture.suite.server, "--stdio"], rootUri,
        env: { ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"), ARKTS_LSP_LOG_DIR: logs,
          ARKTS_REFERENCES_TRACE: "1", ARKTS_BENCHMARK_CONTROL: "0",
          ARKTS_REFERENCES_RESIDENT_FIRST: residentFirst },
      })
      t.after(() => session.close().catch(() => {}))
      await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
      session.openDocument({ uri: uri("Target.ets"), version: 1, text: source })
      const requestStarted = performance.now()
      const response = await session.request("textDocument/references", {
        textDocument: { uri: uri("Target.ets") }, position: { line: 0, character: 14 },
        context: { includeDeclaration: false },
      }, { timeoutMs: 20_000 })
      t.diagnostic(`first complete response including initialization (${residentFirst}): ${performance.now() - requestStarted} ms`)
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      assert.deepEqual(response.result, [{ uri: uri("Use.ets"), range: {
        start: { line: 0, character: 9 }, end: { line: 0, character: 20 },
      } }, { uri: uri("Use.ets"), range: {
        start: { line: 1, character: 25 }, end: { line: 1, character: 36 },
      } }])
      const events = fs.readFileSync(path.join(logs, "server.log"), "utf8").trim().split("\n").map(JSON.parse)
      const selectionAt = events.findIndex(event => event.event === "references.candidate-selection.complete")
      assert.ok(selectionAt >= 0)
      assert.equal(events.slice(0, selectionAt).filter(event => event.event === "references.queue.start").length, 0,
        "a never-queried root cannot have a proved resident; do not delay cold candidate planning")
      assert.equal(events.filter(event => event.event === "references.queue.start").length, 1,
        "the first request dispatches one complete owner query after joining initialization")
      const initializedAt = events.findIndex(event => event.event === "semantic.initialization.complete")
      const queriedAt = events.findIndex(event => event.event === "references.queue.start")
      assert.ok(initializedAt >= 0 && initializedAt < queriedAt,
        "server preparation finishes before the first queued semantic query")
      assert.equal(events.filter(event => event.event === "references.candidate-selection.complete").length, 1)
      assert.ok(events.some(event => event.event === "references.resident.hit"))
      assert.ok(!events.some(event => event.event === "references.batch.start"),
        "a prepared complete owner must not reparse the SDK in another verifier")
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    })
}
