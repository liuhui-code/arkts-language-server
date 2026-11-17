import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture, initializeReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { projectRoot } from "../support/lsp-process.mjs"
import { until } from "../support/worker-recovery-audit.mjs"

const evidence = process.env.ARKTS_TEST_NAMESPACE_EVIDENCE_DIR
const ordered = values => [...values].sort((a, b) => a.uri.localeCompare(b.uri)
  || a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character)

test("Native process exit does not turn its unchanged cache directory into project sources",
  { timeout: 25_000 }, async t => {
    const auditRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-managed-owner-audit-"))
    const cleanup = []
    const audit = path.join(auditRoot, "native-lifetime.ndjson")
    const loader = path.join(projectRoot, "tests/fixtures/index/native-child-lifetime-audit.cjs")
    const f = createReadinessFixture({ after: action => cleanup.push(action) }, {
      NODE_OPTIONS: "--require=" + JSON.stringify(loader), ARKTS_TEST_NATIVE_OWNER_AUDIT: audit,
      ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "target/release",
        process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar"),
      ARKTS_MEMORY_BUDGET_MB: undefined,
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0", ARKTS_INDEX_CATALOG_TRACE: "1",
    }, { indexCacheDirectory: workspace => path.join(workspace, "Cache") })
    const readAudit = () => fs.existsSync(audit)
      ? fs.readFileSync(audit, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : []
    const responses = []
    t.after(async () => {
      try {
        await f.session.close({ timeoutMs: 5_000 })
        if (evidence) {
          fs.mkdirSync(evidence, { recursive: true })
          for (const name of ["stdout", "stderr"]) if (fs.existsSync(audit + "." + name + ".raw")) {
            fs.copyFileSync(audit + "." + name + ".raw", path.join(evidence, "native-" + name + ".raw"))
          }
          fs.writeFileSync(path.join(evidence, "native-owner-exit.json"), JSON.stringify({
            responses, events: f.events(), audit: readAudit(), messages: f.session.transport.messages,
          }, null, 2))
        }
      } finally {
        for (const action of cleanup.reverse()) await action()
        fs.rmSync(auditRoot, { recursive: true, force: true })
      }
    })
    await initializeReadinessFixture(f)
    const cache = path.join(f.workspace, "Cache/workspaces")
    const [key] = fs.readdirSync(cache).filter(name => /^[a-f0-9]{64}$/.test(name))
    const leaf = path.join(cache, key)
    const generated = path.join(leaf, "Generated.ets")
    fs.writeFileSync(generated,
      'import { neverQueried } from "../../../Unopened"\nexport const generated = neverQueried()\n')
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
    const query = async character => {
      const response = await f.session.request("textDocument/references", {
        textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character },
        context: { includeDeclaration: true },
      }, { timeoutMs: 10_000 })
      responses.push(response)
      return response
    }
    const before = await query(25)
    assert.equal(before.error, undefined, JSON.stringify(before))
    assert.equal(before.result.length, 3)
    await until(() => f.events().some(event => event.event === "index.maintenance.phase"
      && event.outcome === "qualified" && event.currentInput && event.inputRevision >= f.initialIndexQualification.inputRevision), "qualified Native scope")
    const identity = readAudit().find(row => row.kind === "identity")
    assert.ok(identity?.pid, "only terminate the real child started by this isolated test")
    process.kill(identity.pid, "SIGTERM")
    await until(() => readAudit().some(row => row.kind === "exit"), "actual Native exit")
    const exited = readAudit().find(row => row.kind === "exit")
    if (process.platform === "win32") assert.ok(exited.signal !== null || exited.code !== 0)
    else assert.equal(exited.signal, "SIGTERM")
    // A distinct cursor and a source snapshot force current Worker admission; not an answer-cache-only assertion.
    const after = await query(26)
    assert.equal(after.error, undefined, JSON.stringify(after))
    assert.deepEqual(ordered(after.result), ordered(before.result),
      "losing the optional index process must not introduce generated cached callers")
    const readiness = await f.session.request("arkts/semanticReadiness", { rootUri: f.rootUri,
      prepare: false })
    responses.push(readiness)
    assert.equal(readiness.error, undefined, JSON.stringify(readiness))
    assert.equal(readiness.result.sourceNamespace.sources, 2)
    assert.equal(fs.existsSync(generated), true, "failure recovery must not delete cache contents")
    // Retaining the role must not retain a pathname exclusion after the actual directory changes.
    fs.renameSync(leaf, path.join(f.directory, "retired-cache"))
    fs.mkdirSync(leaf)
    const content = 'import { neverQueried } from "../../../Unopened"\nexport const recovered = neverQueried()\n'
    fs.writeFileSync(path.join(leaf, "Recovered.ets"), content)
    let recovered
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await query(27)
      if (response.error) { assert.ok([-32801, -32803].includes(response.error.code)); continue }
      recovered = response
      break
    }
    assert.ok(recovered, "current source namespace must recover without restarting the LSP")
    const extra = [0, 1].map(line => {
      const character = content.split("\n")[line].indexOf("neverQueried")
      return { uri: f.uri(path.relative(f.workspace, path.join(leaf, "Recovered.ets"))), range: {
        start: { line, character }, end: { line, character: character + 12 },
      } }
    })
    assert.deepEqual(ordered(recovered.result), ordered([...before.result, ...extra]))
    assert.equal(readAudit().filter(row => row.kind === "identity").length, 1, "no hidden Native restart")
    assert.deepEqual((await f.session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    assert.deepEqual(fs.readdirSync(leaf), ["Recovered.ets"])
  })
