import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

for (const method of ["textDocument/definition", "textDocument/completion"]) test(
  `cancelled ${method} preparation after editing and undo keeps the Worker available for definitions`,
  { timeout: 25_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "5000",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/cancellable-workspace-preparation.cjs"))}` })
    try {
      await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
      await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
      const uri = f.uri("Main.ets"), original = f.sources["Main.ets"]
      const params = { textDocument: { uri }, position: { line: 1, character: 23 } }
      f.session.openDocument({ uri, version: 1, text: original })
      const initial = await f.session.request("textDocument/definition", params)
      assert.equal(initial.result?.[0]?.uri, f.uri("Unopened.ets"), JSON.stringify(initial))
      const graph = path.join(f.workspace, "cancel-graph")
      fs.mkdirSync(graph)
      for (let i = 0; i < 64; i++) fs.writeFileSync(path.join(graph, `Edge${i}.ets`),
        i === 63 ? "export const last = 1\n" : `export { last } from './Edge${i + 1}'\n`)
      const edited = original + "import { last } from './cancel-graph/Edge0'\nexport const added = last\n"
      f.session.changeDocument({ uri, version: 2, text: edited })
      fs.writeFileSync(path.join(f.directory, "arm-workspace-read"), "finite")
      const id = f.session.nextRequestId++
      f.session.transport.send({ jsonrpc: "2.0", id, method, params })
      const entered = path.join(f.directory, "workspace-reads.ndjson"), deadline = Date.now() + 5000
      while (!fs.existsSync(entered)) {
        if (Date.now() > deadline) throw Error("dependency preparation did not enter its real file-read path")
        await new Promise(resolve => setTimeout(resolve, 5))
      }
      f.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
      f.session.changeDocument({ uri, version: 3, text: original })
      const cancelled = await f.session.transport.response(id, 5000)
      assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
      // A mutation following a cancelled request must not inherit its token.
      f.session.openDocument({ uri: f.uri("Unopened.ets"), version: 1,
        text: "\n" + f.sources["Unopened.ets"] })
      for (let i = 0; i < 4; i++) {
        const fresh = await f.session.request("textDocument/definition", params, { timeoutMs: 8000 })
        assert.deepEqual(fresh.result, [{ uri: f.uri("Unopened.ets"), range: {
          start: { line: 1, character: 16 }, end: { line: 1, character: 28 } } }], JSON.stringify({ fresh,
          failures: f.events().filter(e => e.event === "semantic.worker.unresponsive") }))
      }
      const reads = fs.readFileSync(entered, "utf8").trim().split("\n").map(JSON.parse)
      assert.match(reads[0].stack, /collectDependencyClosure|loadFromDiskWithinTransaction/)
      assert.ok(reads.length < 8, `cancelled preparation continued reading ${reads.length} dependencies`)
      assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
      assert.ok(!f.events().some(e => e.event === "semantic.worker.unresponsive"))
      const terminals = f.session.transport.transcriptEntries.filter(({ entry }) =>
        entry.direction === "receive" && entry.id === id && entry.method === null)
      assert.equal(terminals.length, 1)
      assert.deepEqual((await f.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
    } finally {
      if (process.env.ARKTS_TEST_EVIDENCE_DIR) {
        const out = path.resolve(process.env.ARKTS_TEST_EVIDENCE_DIR, method.split("/")[1])
        fs.mkdirSync(out, { recursive: true })
        for (const name of ["workspace-reads.ndjson", "logs/server.log"]) {
          const file = path.join(f.directory, name)
          if (fs.existsSync(file)) fs.copyFileSync(file, path.join(out, path.basename(name)))
        }
        fs.writeFileSync(path.join(out, "transcript.json"), JSON.stringify(f.session.transport.transcriptEntries, null, 2))
      }
    }
  })
