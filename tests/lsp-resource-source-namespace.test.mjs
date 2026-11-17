import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { createReadinessFixture, initializeReadinessFixture } from "./support/semantic-readiness-lsp.mjs"
import { projectRoot } from "./support/lsp-process.mjs"
import { createTestResourceScope } from "./support/test-resource-scope.mjs"
import { nativeWireAuditOptions, readNativeWireAudit } from "./support/native-wire-audit-options.mjs"

for (const mode of ["disjoint", "source-symlink", "hardlink"])
test(`Stage resource/source namespace respects physical aliases: ${mode}`, async t => {
  const physicalAlias = mode === "source-symlink", hardlink = mode === "hardlink"
  const auditRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resource-namespace-audit-"))
  const audit = path.join(auditRoot, "wire.jsonl")
  const track = createTestResourceScope(t, () => {
    if (fs.existsSync(audit)) {
      const rows = fs.readFileSync(audit, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
      const exits = rows.filter(row => row.kind === "exit")
      assert.equal(exits.length, rows.filter(row => row.kind === "identity").length,
        "every Native audit writer must exit before its directory is removed")
      assert.ok(exits.every(row => row.code === 0 && row.signal === null))
    }
    fs.rmSync(auditRoot, { recursive: true, force: true })
  })
  const f = createReadinessFixture(t, { ...nativeWireAuditOptions(audit),
    ARKTS_INDEX_CATALOG_TRACE: "1", ARKTS_MEMORY_BUDGET_MB: undefined })
  track(() => f.session.close())
  const names = {}
  for (const [name, text] of Object.entries(f.sources)) {
    fs.unlinkSync(path.join(f.workspace, name))
    const next = "entry/src/main/ets/" + name
    fs.mkdirSync(path.dirname(path.join(f.workspace, next)), { recursive: true })
    fs.writeFileSync(path.join(f.workspace, next), text); names[name] = next
  }
  fs.writeFileSync(path.join(f.workspace, "build-profile.json5"), JSON.stringify({
    app: { products: [{ name: "default" }] }, modules: [{ name: "entry", srcPath: "./entry",
      targets: [{ name: "default", applyToProducts: ["default"] }] }] }))
  fs.writeFileSync(path.join(f.workspace, "entry/build-profile.json5"), JSON.stringify({
    targets: [{ name: "default", source: { sourceRoots: physicalAlias ? ["./src/main", "./src/linked"] : ["./src/main"] }, resource: { directories: ["./res"] } }] }))
  const resource = path.join(f.workspace, "entry/res/base/element/string.json")
  fs.mkdirSync(path.dirname(resource), { recursive: true })
  fs.writeFileSync(resource, '{"string":[{"name":"title","value":"Before"}]}')
  if (physicalAlias) fs.symlinkSync(path.join(f.workspace, "entry/res"),
    path.join(f.workspace, "entry/src/linked"), process.platform === "win32" ? "junction" : "dir")
  if (hardlink) {
    fs.writeFileSync(resource, "{}")
    fs.linkSync(resource, path.join(f.workspace, "entry/src/main/ets/ResourceAlias.ets"))
  }
  await initializeReadinessFixture(f, hardlink ? 3 : 2)
  const main = f.uri(names["Main.ets"])
  f.session.openDocument({ uri: main, version: 1, text: f.sources["Main.ets"] })
  const definition = () => f.session.request("textDocument/definition", { textDocument: { uri: main },
    position: { line: 1, character: 28 } })
  const before = await definition()
  assert.equal(before.error, undefined); assert.equal(before.result.length, 1)
  const wire = () => readNativeWireAudit(audit)
  const sourceTasks = () => wire().filter(row => row.kind === "request"
    && ["maintenance/changes", "maintenance/start", "catalog/start"].includes(row.frame.method))
  const baseline = sourceTasks().length
  assert.ok(baseline > 0)
  fs.writeFileSync(resource, hardlink ? "{}\n" : '{"string":[{"name":"title","value":"After"}]}')
  f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
    params: { changes: [{ uri: pathToFileURL(resource).href, type: 2 }] } })
  const after = await definition()
  assert.equal(after.error, undefined); assert.deepEqual(after.result, before.result)
  if (mode !== "disjoint") assert.ok(sourceTasks().length > baseline, "physical source overlap must not be certified unrelated")
  else assert.equal(sourceTasks().length, baseline, "a disjoint configured resource event must not enqueue source work")
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
  t.diagnostic(JSON.stringify({ scope: "real Native framed LSP, not UI", sourceMaintenanceRequests: baseline }))
})
