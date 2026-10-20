import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

for (const mutation of [null, "sdk-config", "read-window"]) {
  test(`a retained source delta replaces only its actual read fact (mutation=${mutation})`,
    { timeout: 30_000 }, async t => {
      const { session, sdk, workspace, directory, rootUri, uri, events } = createReadinessFixture(t, {
        ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
        ...(mutation === "read-window" ? { NODE_OPTIONS: `--require=${path.resolve("tests/fixtures/changed-source-read-window.cjs")}` } : {}) })
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
      if (mutation === "sdk-config") {
        const file = path.join(sdk, "ets/oh-uni-package.json")
        const before = fs.readFileSync(file, "utf8"), after = before.replace('"24"', '"25"')
        assert.notEqual(before, after); fs.writeFileSync(file, after)
      }
      if (mutation === "read-window") fs.writeFileSync(path.join(directory, "arm-changed-source-read.json"),
        JSON.stringify({ text: model("markerEnd") }))
      const watched = () => session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
        params: { changes: [{ uri: uri("ZZModel.ets"), type: 2 }] } })
      watched(); session.changeDocument({ uri: target, version: 2, text: main("markerNew") })
      const response = await complete(main("markerNew"))
      if (mutation === null) {
        assertMarker(response, "markerNew", "markerOld")
        assert.equal(contexts(), beforeContexts, "known semantic source changes update the original LS")
      } else {
        assert.equal(response.error?.code, -32803, JSON.stringify(response))
        if (mutation === "read-window") {
          const witness = JSON.parse(fs.readFileSync(path.join(directory, "changed-source-read-mutated.json"), "utf8"))
          assert.equal(witness.pid, session.transport.child.pid); assert.ok(witness.threadId > 0)
          assert.match(witness.caller, /observeChangedSourceRead/); assert.equal(witness.originalSize, witness.currentSize)
          watched(); session.changeDocument({ uri: target, version: 3, text: main("markerEnd") })
          assertMarker(await complete(main("markerEnd")), "markerEnd", "markerOld")
        }
      }
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    })
}
