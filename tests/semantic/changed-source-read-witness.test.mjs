import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { withContextFailureEvidence } from "../support/context-failure-evidence.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

for (const mutation of [null, "sdk-config", "read-window", "read-window-drift", "read-window-drift-sdk-config", "read-window-namespace"]) {
  test(`a retained source delta replaces only its actual read fact (mutation=${mutation})`,
    { timeout: 30_000 }, async t => {
      const readWindow = mutation?.startsWith("read-window")
      const drift = mutation?.includes("drift")
      const namespace = mutation === "read-window-namespace"
      const { session, sdk, workspace, directory, rootUri, uri, events } = createReadinessFixture(t, {
        ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
        // The target completion must consume the injected read window before automatic diagnosis.
        ...(readWindow ? { ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "5000" } : {}),
        ...(readWindow ? { NODE_OPTIONS: `--require=${path.resolve("tests/fixtures/changed-source-read-window.cjs")}` } : {}) })
      const main = marker => `import { Model } from './ZZModel'\nconst model = new Model()\nexport const current = model.${marker}\n`
      const model = marker => `export class Model { ${marker}: number = 1 }\n`
      fs.writeFileSync(path.join(workspace, "Main.ets"), main("markerOld"))
      fs.writeFileSync(path.join(workspace, "ZZModel.ets"), model("markerOld"))
      for (let index = 0; index < 400; index++) fs.writeFileSync(path.join(workspace,
        `Filler${String(index).padStart(4, "0")}.ets`), `export const filler${index} = ${index}\n`)
      await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
      const initialized = await session.transport.notification("arkts/semanticPreparation",
        message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
      assert.equal(initialized.params.report.semanticState, "ready")
      const target = uri("Main.ets")
      session.openDocument({ uri: target, version: 1, text: main("markerOld") })
      const complete = text => session.request("textDocument/completion", { textDocument: { uri: target },
        position: positionAt(text, text.indexOf("model.marker") + "model.mar".length), context: { triggerKind: 1 } })
      const assertMarker = (response, marker, absent) => {
        assert.equal(response.error, undefined, JSON.stringify(response))
        assert.ok(response.result.items.some(item => item.label === marker), JSON.stringify(response.result))
        assert.ok(!response.result.items.some(item => item.label === absent), JSON.stringify(response.result))
      }
      assertMarker(await complete(main("markerOld")), "markerOld", "markerNew")
      const contexts = () => events().filter(event => event.event === "semantic.context.create").length
      const beforeContexts = contexts()
      fs.writeFileSync(path.join(workspace, "ZZModel.ets"), model("markerNew"))
      const mutateSdk = () => {
        const file = path.join(sdk, "ets/oh-uni-package.json")
        const before = fs.readFileSync(file, "utf8"), after = before.replace('"24"', '"25"')
        assert.notEqual(before, after); fs.writeFileSync(file, after)
      }
      if (mutation === "sdk-config") mutateSdk()
      if (readWindow) fs.writeFileSync(path.join(directory, "arm-changed-source-read.json"),
        JSON.stringify({ text: model("markerEnd"), mtimeOffsetMs: drift ? 2000 : 0, namespace }))
      const watched = () => session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
        params: { changes: [{ uri: uri("ZZModel.ets"), type: 2 }] } })
      watched(); session.changeDocument({ uri: target, version: 2, text: main("markerNew") })
      const response = await complete(main("markerNew"))
      if (mutation === null) {
        assertMarker(response, "markerNew", "markerOld")
        withContextFailureEvidence(t, events, () =>
          assert.equal(contexts(), beforeContexts, "known semantic source changes update the original LS"))
      } else {
        assert.equal(response.error?.code, -32803, JSON.stringify(response))
        if (readWindow) {
          const witness = JSON.parse(fs.readFileSync(path.join(directory, "changed-source-read-mutated.json"), "utf8"))
          assert.equal(witness.pid, session.transport.child.pid); assert.ok(witness.threadId > 0)
          assert.match(witness.caller, /observeChangedSourceRead/)
          if (namespace) {
            assert.equal(witness.currentDirectory, true)
            const observed = fs.readFileSync(path.join(directory, "changed-source-namespace-observed.jsonl"), "utf8")
              .trim().split("\n").map(JSON.parse)
            assert.ok(observed.some(row => row.pid === session.transport.child.pid && row.threadId > 0
              && /lookupIdentity/.test(row.caller) && /observeChangedSourceRead/.test(row.caller)))
            t.diagnostic(JSON.stringify({ namespaceObservations: observed.map(row => ({ ...row,
              caller: row.caller.split("\n").filter(line => /lookupIdentity|observeChangedSourceRead/.test(line)) })) }))
            fs.rmdirSync(path.join(workspace, "ZZModel.ets"))
            fs.writeFileSync(path.join(workspace, "ZZModel.ets"), model("markerEnd"))
          } else assert.equal(witness.originalSize, witness.currentSize)
          if (drift) assert.ok(witness.currentMtimeMs - witness.originalMtimeMs > 1999)
          t.diagnostic(JSON.stringify({ mutation, rejectedRequestId: response.id, ...witness, caller: undefined }))
          if (mutation === "read-window-drift-sdk-config") mutateSdk()
          watched(); session.changeDocument({ uri: target, version: 3, text: main("markerEnd") })
          const recovered = await complete(main("markerEnd"))
          t.diagnostic(JSON.stringify({ mutation, recovery: recovered, beforeContexts, afterContexts: contexts(),
            proofEvents: events().filter(event => /proof|context|prepare/.test(event.event)).map(event => ({
              event: event.event, reason: event.reason, stage: event.stage, contextSequence: event.contextSequence,
              source: event.sourcePath && path.basename(event.sourcePath),
              resetReason: event.resetReason, newEntry: event.newEntry, ts: event.ts })) }))
          if (drift || namespace) assert.equal(contexts(), beforeContexts, "recovery must retain its original LS")
          if (mutation === "read-window-drift-sdk-config" || namespace) assert.equal(recovered.error?.code, -32803, JSON.stringify(recovered))
          else assertMarker(recovered, "markerEnd", "markerOld")
        }
      }
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    })
}

for (const sdkMutation of [false, true, "source-reset-control", "late", "late-construction-failure"]) {
  const scenario = typeof sdkMutation === "string" ? "source-forced replacement retains constructor-window SDK proof"
    : "diagnostic-discovered source changes cannot recertify SDK configuration"
  test(`${scenario} (mutation=${sdkMutation})`,
    { timeout: 30_000 }, async t => {
      const { session, sdk, workspace, directory, rootUri, uri, events } = createReadinessFixture(t, {
        ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
        NODE_OPTIONS: `--require=${path.resolve("tests/fixtures/sdk-diagnostic-source-mutation.cjs")}`,
      })
      const main = marker => `import { Model } from './ZZModel'\nconst model = new Model()\nexport const current = model.${marker}\n`
      fs.writeFileSync(path.join(workspace, "Main.ets"), main("markerOld"))
      fs.writeFileSync(path.join(workspace, "ZZModel.ets"), "export class Model { markerOld: number = 1 }\n")
      for (let index = 0; index < 400; index++) fs.writeFileSync(path.join(workspace,
        `Filler${String(index).padStart(4, "0")}.ets`), `export const filler${index} = ${index}\n`)
      await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
      const prepared = await session.transport.notification("arkts/semanticPreparation",
        message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
      assert.equal(prepared.params.report.semanticState, "ready")
      const target = uri("Main.ets")
      session.openDocument({ uri: target, version: 1, text: main("markerOld") })
      const complete = text => session.request("textDocument/completion", { textDocument: { uri: target },
        position: positionAt(text, text.indexOf("model.marker") + "model.mar".length), context: { triggerKind: 1 } })
      const initial = await complete(main("markerOld"))
      assert.ok(initial.result?.items.some(item => item.label === "markerOld"), JSON.stringify(initial))
      fs.writeFileSync(path.join(directory, "arm-sdk-mutation.json"), JSON.stringify({ sdkMutation: sdkMutation === "source-reset-control" ? false : sdkMutation }))
      session.changeDocument({ uri: target, version: 2, text: main("markerOld") })
      const observed = path.join(directory, "sdk-mutated.json")
      const deadline = performance.now() + 5_000
      while (!fs.existsSync(observed) && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
      assert.ok(fs.existsSync(observed), "the real background diagnostic must encounter the source mutation")
      const witness = JSON.parse(fs.readFileSync(observed, "utf8"))
      assert.equal(witness.pid, session.transport.child.pid)
      assert.ok(witness.threadId > 0)
      assert.match(witness.caller, /collectDependencyClosure/)
      assert.match(witness.caller, /diagnose/)
      // Constructor-window cases require a replacement, not a racing in-place source delta.
      // A real watched source deletion makes that precondition independent of diagnosis scheduling.
      const changes = [{ uri: uri("ZZModel.ets"), type: 2 }]
      if (typeof sdkMutation === "string") {
        fs.unlinkSync(path.join(workspace, "Filler0399.ets"))
        changes.push({ uri: uri("Filler0399.ets"), type: 3 })
      }
      session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: { changes } })
      session.changeDocument({ uri: target, version: 3, text: main("markerNew") })
      const response = await complete(main("markerNew"))
      if (sdkMutation && sdkMutation !== "source-reset-control") {
        if (sdkMutation === "late-construction-failure") {
          assert.ok(response.error, "the replacement constructor failure must not publish completion")
          assert.ok(fs.existsSync(path.join(directory, "sdk-construction-failed.json")))
        } else assert.equal(response.error?.code, -32803, JSON.stringify(response))
        if (typeof sdkMutation === "string") {
          const late = JSON.parse(fs.readFileSync(path.join(directory, "late-sdk-read.json"), "utf8"))
          assert.equal(late.pid, session.transport.child.pid)
          assert.ok(late.threadId > 0)
          assert.match(late.caller, /loadCompilerSdk/)
          if (sdkMutation === "late") assert.ok(events().some(event => event.event === "semantic.context.evict"
            && event.reason === "prepare-failed" && event.leaseCount === 0), "failed replacement releases its lease and context")
        }
        assert.equal((await complete(main("markerNew"))).error?.code, -32803,
          "a later request must not certify the silently changed SDK either")
        session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
          params: { settings: { arkts: { sdk: { path: sdk } } } } })
      } else assert.equal(response.error, undefined, JSON.stringify(response))
      const recovered = await complete(main("markerNew"))
      assert.equal(recovered.error, undefined, JSON.stringify(recovered))
      assert.ok(recovered.result.items.some(item => item.label === "markerNew"))
      assert.ok(!recovered.result.items.some(item => item.label === "markerOld"))
      t.diagnostic(JSON.stringify({ sdkMutation, contexts: events().filter(e => e.event === "semantic.context.create").length }))
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    })
}

for (const change of ["delete", "overflow"]) for (const sdkMutation of [false, true]) {
  test(`source ${change} cannot authorize SDK reloading (mutation=${sdkMutation})`, { timeout: 30_000 }, async t => {
    const { session, sdk, workspace, rootUri, uri } = createReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    })
    const main = "import { Model } from './ZZModel'\nconst model = new Model()\nexport const value = model.markerOld\n"
    const model = "export class Model { markerOld: number = 1 }\n"
    fs.writeFileSync(path.join(workspace, "Main.ets"), main)
    fs.writeFileSync(path.join(workspace, "ZZModel.ets"), model)
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const prepared = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
    assert.equal(prepared.params.report.semanticState, "ready")
    const target = uri("Main.ets")
    session.openDocument({ uri: target, version: 1, text: main })
    const complete = () => session.request("textDocument/completion", { textDocument: { uri: target },
      position: positionAt(main, main.indexOf("model.marker") + "model.mar".length), context: { triggerKind: 1 } })
    assert.ok((await complete()).result.items.some(item => item.label === "markerOld"))
    if (sdkMutation) {
      const metadata = path.join(sdk, "ets", "oh-uni-package.json")
      const before = fs.readFileSync(metadata, "utf8"), after = before.replace('"24"', '"25"')
      assert.notEqual(before, after); fs.writeFileSync(metadata, after)
    }
    const watched = changes => session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: { changes } })
    if (change === "delete") {
      fs.unlinkSync(path.join(workspace, "ZZModel.ets"))
      watched([{ uri: uri("ZZModel.ets"), type: 3 }])
    } else watched(Array.from({ length: 1025 }, (_, index) => ({ uri: uri(`Overflow${index}.ets`), type: 2 })))
    session.changeDocument({ uri: target, version: 2, text: main })
    const response = await complete()
    if (sdkMutation) {
      assert.equal(response.error?.code, -32803, JSON.stringify(response))
      assert.equal((await complete()).error?.code, -32803, "consuming the reset flag must not erase the retained denial")
    } else {
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.equal(response.result.items.some(item => item.label === "markerOld"), change !== "delete")
    }
    if (change === "delete") {
      fs.writeFileSync(path.join(workspace, "ZZModel.ets"), model)
      watched([{ uri: uri("ZZModel.ets"), type: 1 }])
    }
    if (sdkMutation) session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
      params: { settings: { arkts: { sdk: { path: sdk } } } } })
    const recovered = await complete()
    assert.equal(recovered.error, undefined, JSON.stringify(recovered))
    assert.ok(recovered.result.items.some(item => item.label === "markerOld"))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
}

for (const sdkMutation of [false, true]) {
  test(`unnotified source namespace recovery retains SDK proof across commands (mutation=${sdkMutation})`,
    { timeout: 30_000 }, async t => {
      const { session, sdk, workspace, directory, uri, rootUri } = createReadinessFixture(t, {
        ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
        ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "5000",
        NODE_OPTIONS: `--require=${path.resolve("tests/fixtures/sdk-diagnostic-source-mutation.cjs")}`,
      })
      const text = "export const instance = {} as import('./Created').Created\ninstance.value\n"
      fs.writeFileSync(path.join(workspace, "Main.ets"), text)
      await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
      await session.transport.notification("arkts/semanticPreparation",
        message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
      session.openDocument({ uri: uri("Main.ets"), version: 1, text })
      const complete = () => session.request("textDocument/completion", { textDocument: { uri: uri("Main.ets") },
        position: { line: 1, character: 12 }, context: { triggerKind: 1 } })
      assert.equal((await complete()).error, undefined)
      if (sdkMutation) fs.writeFileSync(path.join(directory, "arm-late-sdk.json"), "{}")
      fs.writeFileSync(path.join(workspace, "Created.ets"), "export class Created { value: number = 1 }\n")
      assert.equal((await complete()).error?.code, -32803, "the source namespace repair rejects its discovering command")
      const next = await complete()
      if (sdkMutation) {
        assert.equal(next.error?.code, -32803, JSON.stringify(next))
        const late = JSON.parse(fs.readFileSync(path.join(directory, "late-sdk-read.json"), "utf8"))
        assert.equal(late.pid, session.transport.child.pid)
        assert.ok(late.threadId > 0)
        assert.match(late.caller, /loadCompilerSdk/)
        assert.equal((await complete()).error?.code, -32803, "a failed replacement cannot erase the original SDK facts")
        session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
          params: { settings: { arkts: { sdk: { path: sdk } } } } })
      } else {
        assert.equal(next.error, undefined, JSON.stringify(next))
        assert.ok(next.result.items.some(item => item.label === "value"))
      }
      const recovered = await complete()
      assert.equal(recovered.error, undefined, JSON.stringify(recovered))
      assert.ok(recovered.result.items.some(item => item.label === "value"))
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    })
}

for (const sdkMutation of [false, true]) {
  test(`repairing an unavailable source lookup preserves original SDK facts (mutation=${sdkMutation})`,
    { timeout: 30_000 }, async t => {
      const { session, sdk, workspace, rootUri, uri } = createReadinessFixture(t, {
        ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      })
      const text = "import './Poison'\nexport class Model { markerOld: number = 1 }\nconst model = new Model()\nmodel.markerOld\n"
      fs.writeFileSync(path.join(workspace, "Main.ets"), text)
      fs.symlinkSync(path.join(workspace, "Repaired.ts"), path.join(workspace, "Poison.ts"), "file")
      await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
      await session.transport.notification("arkts/semanticPreparation",
        message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
      session.openDocument({ uri: uri("Main.ets"), version: 1, text })
      const complete = () => session.request("textDocument/completion", { textDocument: { uri: uri("Main.ets") },
        position: { line: 3, character: 9 }, context: { triggerKind: 1 } })
      assert.equal((await complete()).error?.code, -32803, "the old owner must reject the unprovable source lookup")
      if (sdkMutation) {
        const metadata = path.join(sdk, "ets", "oh-uni-package.json")
        const before = fs.readFileSync(metadata, "utf8"), after = before.replace('"24"', '"25"')
        assert.notEqual(before, after); fs.writeFileSync(metadata, after)
      }
      fs.writeFileSync(path.join(workspace, "Repaired.ts"), "export const restored = 1\n")
      session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: { changes: [
        { uri: uri("Repaired.ts"), type: 1 }, { uri: uri("Poison.ts"), type: 2 },
      ] } })
      session.changeDocument({ uri: uri("Main.ets"), version: 2, text })
      const repaired = await complete()
      if (sdkMutation) {
        assert.equal(repaired.error?.code, -32803, JSON.stringify(repaired))
        assert.equal((await complete()).error?.code, -32803, "source repair must not erase SDK denial")
        session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
          params: { settings: { arkts: { sdk: { path: sdk } } } } })
      } else {
        assert.equal(repaired.error, undefined, JSON.stringify(repaired))
        assert.ok(repaired.result.items.some(item => item.label === "markerOld"))
      }
      const recovered = await complete()
      assert.equal(recovered.error, undefined, JSON.stringify(recovered))
      assert.ok(recovered.result.items.some(item => item.label === "markerOld"))
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    })
}


// Failure observability only: these tiny contracts do not launch an LSP child.
const ownerAssertionError = () => {
  try { assert.equal(2, 1, "known semantic source changes update the original LS") }
  catch (error) { return error }
}

test("context failure evidence emits bounded allowlisted events and preserves the original error", () => {
  const original = ownerAssertionError(), diagnostics = []
  const events = Array.from({ length: 100 }, (_, index) => ({
    event: "semantic.context.create", contextSequence: index, reason: "missing", ts: "2026-11-02T00:00:00Z",
    sourcePath: "/private/source.ets", content: "PRIVATE_SOURCE", env: "PRIVATE_ENV",
  }))
  events[97].event = "semantic.context.evict"
  events[98].event = "semantic.prepare.complete"
  events[99] = { ...events[99], event: "references.resident.proof.rejected", reason: "x".repeat(500),
    resetReason: null, newEntry: false, leaseCount: Infinity, stage: { content: "PRIVATE_SOURCE" },
    pid: 42, monotonicNs: "123456789", residentScriptsBefore: 256, residentScriptsAfter: 257 }
  events.push({ event: "unrelated", content: "PRIVATE_SOURCE" })
  assert.throws(() => withContextFailureEvidence({ diagnostic: text => diagnostics.push(text) }, () => events,
    () => { throw original }), error => error === original)
  assert.equal(diagnostics.length, 1)
  const report = JSON.parse(diagnostics[0])
  assert.equal(report.event, "test.context-retention.failure")
  assert.equal(report.matchedEvents, 100)
  assert.equal(report.omittedEvents, 20)
  assert.equal(report.events.length, 80)
  assert.equal(report.events[0].contextSequence, 20)
  assert.equal(report.events.at(-1).reason.length, 160)
  assert.equal(report.events.at(-1).resetReason, null)
  assert.equal(report.events.at(-1).newEntry, false)
  assert.equal(report.events.at(-1).leaseCount, undefined)
  assert.equal(report.events.at(-1).stage, undefined)
  assert.deepEqual(report.events.slice(-3).map(row => row.event), [
    "semantic.context.evict", "semantic.prepare.complete", "references.resident.proof.rejected"])
  assert.ok(!diagnostics[0].includes("PRIVATE"))
  assert.ok(!diagnostics[0].includes("/private/source.ets"))
  assert.equal(report.events.at(-1).sourcePath, undefined)
  assert.equal(report.events.at(-1).sourcePathSha256, createHash("sha256").update("/private/source.ets").digest("hex"))
  assert.equal(report.events.at(-1).pid, 42)
  assert.equal(report.events.at(-1).monotonicNs, "123456789")
  assert.equal(report.events.at(-1).residentScriptsBefore, 256)
  assert.equal(report.events.at(-1).residentScriptsAfter, 257)
  assert.equal(report.events[0].sourcePathSha256, undefined)
  assert.equal(original.actual, 2); assert.equal(original.expected, 1)
  assert.equal(original.code, "ERR_ASSERTION")
})

test("context failure evidence leaves successful assertions lazy", () => {
  assert.equal(withContextFailureEvidence({ diagnostic: () => assert.fail("unexpected output") },
    () => assert.fail("unexpected collection"), () => 7), 7)
})

test("context failure evidence retains the assertion when collection fails", () => {
  const original = ownerAssertionError(), diagnostics = []
  assert.throws(() => withContextFailureEvidence({ diagnostic: text => diagnostics.push(text) },
    () => { throw Error("PRIVATE_PATH") }, () => { throw original }), error => error === original)
  assert.deepEqual(JSON.parse(diagnostics[0]), { event: "test.context-retention.failure", evidence: "unavailable" })
})

test("context failure evidence retains the assertion when output fails", () => {
  const original = ownerAssertionError()
  assert.throws(() => withContextFailureEvidence({ diagnostic: () => { throw Error("output failed") } },
    () => [], () => { throw original }), error => error === original)
})


test("context failure evidence correlates only the three known Worker lifecycle events", () => {
  const original = ownerAssertionError(), diagnostics = []
  const context = { event: "semantic.context.create", contextSequence: 1, residentContextCount: 1, pid: 42 }
  const events = [
    { event: "semantic.worker.started", threadId: 1, semanticWorkerCount: 1, pid: 42 }, context,
    { event: "semantic.worker.recovery.retired", oldThreadId: 1, pid: 42 },
    { event: "semantic.worker.started", threadId: 2, semanticWorkerCount: Infinity, pid: 42 },
    { event: "semantic.worker.recovery.complete", oldThreadId: 1, newThreadId: 2, documents: 3, pid: 42,
      ts: "x".repeat(500), reason: "/PRIVATE_ERROR_PATH", error: "PRIVATE_ERROR", sourcePath: "/PRIVATE_SOURCE" },
    context,
    { event: "semantic.worker.failure", reason: "PRIVATE_ERROR" },
    { event: "semantic.worker.recovery.failed", reason: "PRIVATE_ERROR" },
  ]
  assert.throws(() => withContextFailureEvidence({ diagnostic: text => diagnostics.push(text) }, () => events,
    () => { throw original }), error => error === original)
  const report = JSON.parse(diagnostics[0])
  assert.equal(report.matchedEvents, 6)
  assert.equal(report.omittedEvents, 0)
  assert.deepEqual(report.events.filter(row => row.event === "semantic.worker.started").map(row => row.threadId), [1, 2])
  assert.equal(report.events[2].oldThreadId, 1)
  assert.equal(report.events[3].semanticWorkerCount, undefined)
  assert.equal(report.events[4].oldThreadId, 1)
  assert.equal(report.events[4].newThreadId, 2)
  assert.equal(report.events[4].documents, 3)
  assert.equal(report.events[4].ts.length, 160)
  assert.ok(report.events.every(row => row.pid === 42))
  assert.ok(!diagnostics[0].includes("PRIVATE"))
  assert.equal(original.actual, 2); assert.equal(original.expected, 1)
})
