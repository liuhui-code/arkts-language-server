import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

for (const mutation of [null, "sdk-config", "read-window", "read-window-drift", "read-window-drift-sdk-config", "read-window-namespace"]) {
  test(`a retained source delta replaces only its actual read fact (mutation=${mutation})`,
    { timeout: 30_000 }, async t => {
      const readWindow = mutation?.startsWith("read-window")
      const drift = mutation?.includes("drift")
      const namespace = mutation === "read-window-namespace"
      const { session, sdk, workspace, directory, rootUri, uri, events } = createReadinessFixture(t, {
        ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
        ...(drift || namespace ? { ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "5000" } : {}),
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
        assert.equal(contexts(), beforeContexts, "known semantic source changes update the original LS")
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
