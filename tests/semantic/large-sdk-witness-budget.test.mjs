import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

test("large SDK proof survives source replacement without laundering silent SDK changes",
  { timeout: 120_000 }, async t => {
    const count = 4200
    const { session, sdk, workspace, directory, rootUri, uri, events } = createReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      NODE_OPTIONS: `--require=${path.resolve("tests/fixtures/large-sdk-capsule-observer.cjs")}` })
    const api = path.join(sdk, "ets", "api")
    fs.mkdirSync(api)
    for (let index = 0; index < count; index++) fs.writeFileSync(path.join(api, `@ohos.budget${index}.d.ts`),
      `export declare class Check${index} { value: number }\n`)
    const selected = `Check${count - 1}`
    const source = Array.from({ length: count }, (_, index) =>
      `import { Check${index} } from '@ohos.budget${index}'`).join("\n")
      + `\nexport const selected = new ${selected}()\n`
    fs.writeFileSync(path.join(workspace, "Main.ets"), source)
    fs.writeFileSync(path.join(workspace, "RemoveLater.ets"), "export const disposable = 1\n")
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 20_000 })
    const prepared = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 40_000)
    t.diagnostic(JSON.stringify({ sdkInputs: count, preparation: prepared.params.report }))
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: source })
    const declaration = path.join(api, `@ohos.budget${count - 1}.d.ts`)
    const query = () => session.request("textDocument/definition", { textDocument: { uri: uri("Main.ets") },
      position: positionAt(source, source.lastIndexOf(selected) + 1) }, { timeoutMs: 30_000 })
    const exact = (response, line = 0) => {
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [{ uri: pathToFileURL(declaration).href,
        range: { start: { line, character: 21 }, end: { line, character: 21 + selected.length } } }])
    }
    exact(await query())
    assert.equal(prepared.params.report.semanticState, "ready", JSON.stringify(prepared.params))
    const contexts = () => events().filter(event => event.event === "semantic.context.create").length
    const before = contexts()
    const removeSource = (name, version) => {
      fs.unlinkSync(path.join(workspace, name))
      session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
        params: { changes: [{ uri: uri(name), type: 3 }] } })
      session.changeDocument({ uri: uri("Main.ets"), version, text: source })
    }
    removeSource("Unopened.ets", 2)
    exact(await query())
    assert.ok(contexts() > before, "the healthy source deletion must actually replace its semantic owner")
    const captures = fs.readFileSync(path.join(directory, "large-sdk-capsules.ndjson"), "utf8")
      .trim().split("\n").map(line => JSON.parse(line))
    assert.ok(captures.some(row => row.factCount > 4096 && Number.isSafeInteger(row.accountedBytes) && row.accountedBytes > 0
      && row.pid === session.transport.child.pid && row.threadId > 0),
      "the real retained non-source capsule, not merely SDK file count, must exceed 4096 facts")
    t.diagnostic(JSON.stringify({ captures: captures.map(({ factCount, accountedBytes }) => ({ factCount, accountedBytes })), contexts: contexts() }))
    exact(await query())
    // A shifted declaration gives configuration recovery an exact observable result.
    fs.writeFileSync(declaration, "// changed SDK declaration\n" + fs.readFileSync(declaration, "utf8"))
    removeSource("RemoveLater.ets", 3)
    for (let repeat = 0; repeat < 2; repeat++) {
      const rejected = await query()
      assert.equal(rejected.error?.code, -32803, JSON.stringify(rejected))
    }
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
      params: { settings: { arkts: { sdk: { path: sdk } } } } })
    exact(await query(), 1)
    exact(await query(), 1)
    assert.equal(events().filter(event => event.event === "semantic.worker.started").length, 1)
    assert.ok(!events().some(event => event.event === "semantic.worker.unresponsive"))
    assert.deepEqual((await session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
  })
