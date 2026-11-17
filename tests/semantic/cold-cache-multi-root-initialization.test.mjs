import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

for (const layout of ["cold", "workspaces-present", "shared-directories-present"]) {
  test(`two workspace initialization tolerates concurrent ${layout} managed namespace creation`, { timeout: 30_000 }, async t => {
    const audit = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-cold-cache-audit-"))
    t.after(() => fs.rmSync(audit, { recursive: true, force: true }))
    const fixture = createReadinessFixture(t, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.join(projectRoot, "tests/fixtures/index/cold-cache-initialization-gate.cjs"))}`,
      ARKTS_INDEX_SIDECAR_PATH: process.env.ARKTS_TEST_NATIVE_BINARY ?? path.join(projectRoot, "target/release",
        process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar"),
      ARKTS_TEST_CACHE_STARTUP_AUDIT: audit,
    })
    const { session, directory, sources, rootUri, events } = fixture
    const other = path.join(directory, "workspace-other")
    fs.mkdirSync(other)
    for (const [name, text] of Object.entries(sources)) fs.writeFileSync(path.join(other, name), text)
    if (layout !== "cold") fs.mkdirSync(path.join(directory, "cache", "workspaces"), { recursive: true })
    if (layout === "shared-directories-present") fs.mkdirSync(path.join(directory, "cache", ".leases"))
    const otherRoot = pathToFileURL(other).href
    try {
      const response = await session.request("initialize", {
        processId: process.pid, rootUri, workspaceFolders: [rootUri, otherRoot].map(uri => ({ name: uri, uri })),
        capabilities: session.capabilities, initializationOptions: { sdk: { path: fixture.sdk } },
      })
      assert.equal(response.error, undefined)
      session.initialized = true
      session.transport.send({ jsonrpc: "2.0", method: "initialized", params: {} })
      const progress = await session.transport.serverRequest("window/workDoneProgress/create")
      session.transport.send({ jsonrpc: "2.0", id: progress.id, result: null })
      await session.transport.progress(progress.params.token, message => message.params.value.kind === "end", 10_000)
      const catalog = events().find(event => event.event === "index.catalog.terminal")
      assert.equal(catalog?.phase, "ready", JSON.stringify(catalog))
      assert.equal(catalog.workspaceCount, 2)
      assert.equal(catalog.indexedFiles, 4)
      for (const root of [rootUri, otherRoot]) {
        const current = await session.request("arkts/semanticReadiness", { rootUri: root, prepare: true })
        assert.equal(current.error, undefined)
        assert.equal(current.result.semanticState, "ready", JSON.stringify(current))
        assert.equal(current.result.coverage.projectSources, 2)
      }
      const symbols = await session.request("workspace/symbol", { query: "neverQueried" })
      assert.equal(symbols.error, undefined)
      assert.deepEqual(symbols.result.map(symbol => symbol.location.uri).sort(),
        [rootUri + "/Unopened.ets", otherRoot + "/Unopened.ets"].sort())
      const lifecycle = fs.readFileSync(path.join(audit, "lifecycle.ndjson"), "utf8").trim().split("\n").map(JSON.parse)
      assert.equal(lifecycle.filter(row => row.kind === "spawn").length, 2)
      assert.equal(lifecycle.filter(row => row.kind === "released-pair").length, 1,
        "the regression must exercise genuinely concurrent valid initialize requests")
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
      const closed = fs.readFileSync(path.join(audit, "lifecycle.ndjson"), "utf8").trim().split("\n").map(JSON.parse)
        .filter(row => row.kind === "close")
      assert.equal(closed.length, 2)
      assert.ok(closed.every(row => row.code === 0 && row.signal === null), "both owned Native processes must close normally")
    } finally {
      await session.close().catch(() => {})
      if (process.env.ARKTS_TEST_EVIDENCE_DIR) {
        const target = path.join(process.env.ARKTS_TEST_EVIDENCE_DIR, "cold-cache-initialization", layout)
        fs.mkdirSync(target, { recursive: true })
        fs.cpSync(audit, path.join(target, "audit"), { recursive: true })
        fs.writeFileSync(path.join(target, "events.json"), JSON.stringify(events(), null, 2))
        fs.writeFileSync(path.join(target, "messages.json"), JSON.stringify(session.transport.messages, null, 2))
      }
    }
  })
}
