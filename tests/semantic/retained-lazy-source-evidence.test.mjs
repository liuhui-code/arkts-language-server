import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"
import { applyWorkspaceEdit } from "../support/lsp-edits.mjs"

for (const fileCount of [128, 400, 1024]) {
  test(`retained edited Program avoids unchanged project text rereads with ${fileCount} actual roots`,
    { timeout: 30_000 }, async t => {
      const { session, sdk, workspace, directory, rootUri, uri, events } = createReadinessFixture(t, {
        ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_BENCHMARK_CONTROL: "0",
        ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
        NODE_OPTIONS: `--require=${path.resolve("tests/fixtures/lazy-source-read-counter.cjs")}` })
      const source = "export class Target { value: number = 1; read(): number { return this.value } }\n"
        + "export const result = new Target().value\n"
      fs.writeFileSync(path.join(workspace, "Main.ets"), source)
      fs.writeFileSync(path.join(workspace, "Broken.ets"), 'import missing from "@ohos.missing"\nexport { missing }\n')
      for (let index = 0; index < fileCount; index++) fs.writeFileSync(path.join(workspace,
        `Filler${String(index).padStart(4, "0")}.ets`), `export const filler${index} = ${index}\n`)
      await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
      const initialized = await session.transport.notification("arkts/semanticPreparation",
        message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
      assert.equal(initialized.params.report.semanticState, "degraded")
      const target = uri("Main.ets"), position = positionAt(source, source.indexOf("value:") + 1)
      session.openDocument({ uri: target, version: 1, text: source })
      const query = () => session.request("textDocument/references", {
        textDocument: { uri: target }, position, context: { includeDeclaration: true } })
      const before = await query()
      assert.equal(before.error, undefined, JSON.stringify(before)); assert.equal(before.result.length, 3)
      assert.ok(events().some(event => event.event === "semantic.references.complete"
        && event.programProjectFiles >= fileCount + 3), "filler roots actually participate in the searched Program")
      const rename = await session.request("textDocument/rename", {
        textDocument: { uri: target }, position, newName: "probe" })
      assert.equal(rename.error, undefined, JSON.stringify(rename))
      const updated = applyWorkspaceEdit(new Map([[target, source]]), rename.result,
        { documentVersions: new Map([[target, 1]]) }).get(target)
      const contextCount = events().filter(event => event.event === "semantic.context.create").length
      fs.writeFileSync(path.join(directory, "lazy-read-phase"), "edited")
      session.changeDocument({ uri: target, version: 2, text: updated })
      const response = await query()
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [...updated.matchAll(/\bprobe\b/g)].map(match => ({ uri: target, range: {
        start: positionAt(updated, match.index), end: positionAt(updated, match.index + 5) } })))
      assert.equal(events().filter(event => event.event === "semantic.context.create").length, contextCount)
      const observations = fs.readdirSync(directory).filter(file => /^lazy-source-reads-\d+\.json$/.test(file))
        .map(file => JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")))
      assert.equal(observations.length, 1, "one actual initialized semantic owner")
      const reads = Object.values(observations[0].phases.edited ?? {})
      const count = reads.reduce((sum, row) => sum + row.successes, 0)
      t.diagnostic(JSON.stringify({ fileCount, phase: "edited overlay through complete response", actualReadFiles: reads.length,
        actualSuccessfulLazyTextReads: count, actualReadBytes: reads.reduce((sum, row) => sum + row.bytes, 0),
        actualReadDurationMs: reads.reduce((sum, row) => sum + row.durationMs, 0),
        compiler: events().filter(event => event.event === "semantic.references.complete").at(-1), observations }))
      assert.equal(count, 0, "unchanged actual compiler inputs must not reread text because a separate LRU is smaller than the Program")
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    })
}
