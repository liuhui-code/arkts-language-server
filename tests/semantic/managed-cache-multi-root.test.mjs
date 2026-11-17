import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL, fileURLToPath } from "node:url"
import { until } from "../support/worker-recovery-audit.mjs"
import { projectRoot } from "../support/lsp-process.mjs"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
const output = process.env.ARKTS_TEST_NAMESPACE_EVIDENCE_DIR
if (output) fs.mkdirSync(output, { recursive: true })
for (const placement of ["external", "inside-first-root"]) {
for (const ordering of ["primary-first", "peer-first"]) {
  test(`managed peer leaf: ${placement}, ${ordering}`, { timeout: 30_000 }, async t => {
    const cleanup = [], responses = [], snapshot = {}
    const f = createReadinessFixture({ after: fn => cleanup.push(fn) }, {
      ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "target/release",
        process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar"),
      ARKTS_MEMORY_BUDGET_MB: undefined, ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
      ARKTS_INDEX_CATALOG_TRACE: "1",
    }, placement === "external" ? {} : { indexCacheDirectory: root => path.join(root, "Cache") })
    const other = path.join(f.directory, "other-workspace")
    fs.mkdirSync(other)
    for (const [name, text] of Object.entries(f.sources)) fs.writeFileSync(path.join(other, name), text)
    const otherUri = pathToFileURL(other).href
    t.after(async () => {
      try {
        snapshot.close = await f.session.close({ timeoutMs: 5_000 })
        snapshot.responses = responses; snapshot.events = f.events()
        snapshot.messages = f.session.transport.messages
        if (output) fs.writeFileSync(path.join(output, placement + "-" + ordering + ".json"), JSON.stringify(snapshot, null, 2))
      } finally { for (const fn of cleanup.reverse()) await fn() }
    })
    const rootsInOrder = ordering === "primary-first" ? [f.rootUri, otherUri] : [otherUri, f.rootUri]
    await f.session.initialize({ workspaceFolders: rootsInOrder.map(uri => ({ uri, name: uri })),
      initializationOptions: { sdk: { path: f.sdk } }, timeoutMs: 10_000 })
    const create = await f.session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
    f.session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
    await f.session.transport.progress(create.params.token, m => m.params.value.kind === "end", 15_000)
    const catalog = f.events().find(e => e.event === "index.catalog.terminal")
    snapshot.initialCatalog = catalog
    assert.equal(catalog.phase, "ready"); assert.equal(catalog.indexedFiles, 4)
    for (const rootUri of [f.rootUri, otherUri]) {
      await f.session.transport.notification("arkts/semanticPreparation",
        m => m.params.rootUri === rootUri && m.params.phase === "complete", 15_000)
    }
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
    const query = async character => {
      const response = await f.session.request("textDocument/references", {
        textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character },
        context: { includeDeclaration: true },
      }, { timeoutMs: 15_000 })
      responses.push(response); return response
    }
    const before = await query(25)
    assert.equal(before.error, undefined, JSON.stringify(before))
    const location = (name, line, character) => ({ uri: f.uri(name), range: {
      start: { line, character }, end: { line, character: character + 12 },
    } })
    const order = values => [...values].sort((a, b) => a.uri.localeCompare(b.uri)
      || a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character)
    const expected = [location("Main.ets", 0, 9), location("Main.ets", 1, 22), location("Unopened.ets", 0, 16)]
    assert.deepEqual(order(before.result), order(expected))
    const cache = placement === "external" ? path.join(f.directory, "cache") : path.join(f.workspace, "Cache")
    const roots = fs.readdirSync(path.join(cache, "workspaces")).filter(x => /^[a-f0-9]{64}$/.test(x))
    assert.equal(roots.length, 2)
    const otherPhysical = fs.realpathSync.native(other)
    const peerKey = roots.find(key => fs.realpathSync.native(fileURLToPath(JSON.parse(fs.readFileSync(
      path.join(cache, "workspaces", key, "cache-use.json"), "utf8")).workspaceIdentity)) === otherPhysical)
    assert.ok(peerKey)
    const leaf = path.join(cache, "workspaces", peerKey)
    const specifier = path.relative(leaf, path.join(f.workspace, "Unopened")).split(path.sep).join("/")
    const content = `import { neverQueried } from "${specifier.startsWith(".") ? specifier : "./" + specifier}"\nexport const generated = neverQueried()\n`
    fs.writeFileSync(path.join(leaf, "Generated.ets"), content)
    snapshot.input = { placement, ordering, workspace: f.workspace, other, leaf, content }
    const after = await query(26)
    assert.equal(after.error, undefined, JSON.stringify(after))
    assert.deepEqual(after.result, before.result, "peer workspace cache content must not become first-root source callers")
    // Change a real source without watch delivery: complete admission must cause a new Native reconciliation.
    const previousQualifiedRevision = Math.max(0, ...f.events().filter(e => e.event === "index.maintenance.phase"
      && e.outcome === "qualified" && e.currentInput).map(e => e.inputRevision))
    fs.writeFileSync(path.join(f.workspace, "Unopened.ets"), f.sources["Unopened.ets"] + "// current scope control\n")
    const reconciled = await query(27)
    assert.equal(reconciled.error, undefined, JSON.stringify(reconciled))
    assert.deepEqual(order(reconciled.result), order(expected))
    await until(() => f.events().some(e => e.event === "index.maintenance.phase" && e.outcome === "qualified"
      && e.currentInput && e.inputRevision > previousQualifiedRevision && e.indexedDocuments === 2), "current two-file Native scope", 15_000)
    const symbols = await f.session.request("workspace/symbol", { query: "generated" })
    snapshot.symbols = symbols
    assert.equal(symbols.error, undefined, JSON.stringify(symbols))
    assert.deepEqual(symbols.result, [], "private peer facts must not escape through workspace symbols")
    if (placement === "inside-first-root" && process.platform !== "win32") {
      fs.renameSync(leaf, path.join(f.directory, "retired-peer-cache"))
      fs.mkdirSync(leaf)
      const recovered = path.join(leaf, "Recovered.ets")
      const text = content.replaceAll("generated", "recovered")
      fs.writeFileSync(recovered, text)
      const recoveredUri = pathToFileURL(recovered).href
      const extra = [0, 1].map(line => {
        const character = text.split("\n")[line].indexOf("neverQueried")
        return { uri: recoveredUri, range: { start: { line, character }, end: { line, character: character + 12 } } }
      })
      let current
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await query(28)
        if (response.error) { assert.ok([-32801, -32803].includes(response.error.code)); continue }
        current = response; break
      }
      assert.ok(current, "physical peer replacement must recover in the same semantic session")
      assert.deepEqual(order(current.result), order([...expected, ...extra]))
      await until(() => f.events().some(e => e.event === "index.maintenance.phase" && e.outcome === "qualified"
        && e.currentInput && e.indexedDocuments === 3), "Native owner A recovers its three real sources", 15_000)
      const found = await f.session.request("workspace/symbol", { query: "recovered" })
      snapshot.recoveredSymbols = found
      assert.equal(found.error, undefined, JSON.stringify(found))
      assert.equal(found.result.length, 1)
      assert.equal(found.result[0].location.uri, recoveredUri)
      assert.deepEqual((await f.session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
      assert.deepEqual(fs.readdirSync(leaf), ["Recovered.ets"], "retiring B must not stamp its replacement")
      assert.equal(fs.readFileSync(recovered, "utf8"), text)
    }
  })
}
}
