import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

for (const [fillerCount, mutation] of [[0, null], [254, null], [254, "rewrite"], [254, "parent-retarget"]]) {
test(`closing an unimported declaration updates its retained consumer without rebuilding the group (dependencies=${fillerCount}, mutation=${mutation})`,
  { timeout: 30_000 }, async t => {
    const { session, workspace, sdk, rootUri, uri, events, directory } = createReadinessFixture(t, {
      ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_BENCHMARK_CONTROL: "0",
      ...(mutation ? { NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/changed-input-witness-window.cjs"))}` } : {}) })
    const files = {
      "a/src/main/ets/Query.ets": 'import { LocalA } from "./Local"\nexport const selected = new LocalA()\nexport const result = selected.ambient.diskMember\n',
      "a/src/main/ets/Local.ets": "export class LocalA { ambient: GlobalMarker }\n",
      "b/src/main/ets/Globals.d.ts": "interface GlobalMarker { diskMember: number }\n",
    }
    for (let index = 0; index < fillerCount; index++) {
      const name = `Filler${String(index).padStart(4, "0")}`
      files[`a/src/main/ets/${name}.ets`] = `export const filler${index} = ${index}\n`
      files["a/src/main/ets/Query.ets"] = `import { filler${index} } from "./${name}"\n` + files["a/src/main/ets/Query.ets"]
    }
    fs.writeFileSync(path.join(workspace, "build-profile.json5"), JSON.stringify({
      app: { products: [{ name: "default" }] }, modules: ["a", "b"].map(name => ({
        name, srcPath: `./${name}`, targets: [{ name: "default", applyToProducts: ["default"] }] })) }))
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true })
      fs.writeFileSync(path.join(workspace, file), text)
    }
    for (const module of ["a", "b"]) {
      fs.writeFileSync(path.join(workspace, module, "build-profile.json5"), "{targets:[{name:'default'}]}")
      fs.writeFileSync(path.join(workspace, module, "oh-package.json5"), JSON.stringify({ name: module,
        main: module === "a" ? "./src/main/ets/Local.ets" : "./src/main/ets/Globals.d.ts", dependencies: {} }))
    }
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const prepared = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
    assert.equal(prepared.params.report.semanticState, "ready", JSON.stringify(prepared.params))
    const query = "a/src/main/ets/Query.ets", declaration = "b/src/main/ets/Globals.d.ts"
    const text = files[query], position = positionAt(text, text.indexOf("ambient.") + "ambient.".length)
    session.openDocument({ uri: uri(query), version: 1, text })
    session.openDocument({ uri: uri(declaration), version: 1,
      text: "interface GlobalMarker { overlayMember: string }\n" })
    const requestComplete = () => session.request("textDocument/completion", {
        textDocument: { uri: uri(query) }, position, context: { triggerKind: 1 } })
    const complete = async (present, absent) => {
      const response = await requestComplete()
      assert.equal(response.error, undefined, JSON.stringify(response))
      const items = Array.isArray(response.result) ? response.result : response.result.items
      assert.deepEqual(items.map(item => item.label), [present])
      assert.ok(!items.some(item => item.label === absent))
    }
    await complete("overlayMember", "diskMember")
    const created = events().filter(row => row.event === "semantic.context.create").length
    session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose",
      params: { textDocument: { uri: uri(declaration) } } })
    session.documentVersions.delete(uri(declaration))
    if (mutation) {
      fs.writeFileSync(path.join(directory, "arm-changed-input.json"), JSON.stringify({ mode: mutation,
        text: files[declaration].replace("diskMember", "evilMember") }))
      const changed = await requestComplete()
      const witness = JSON.parse(fs.readFileSync(path.join(directory, "changed-input-mutated.json"), "utf8"))
      assert.equal(witness.pid, session.transport.child.pid); assert.ok(witness.threadId > 0)
      assert.ok(witness.caller.some(line => line.includes("assertCurrentWorkspaceSources")))
      assert.equal(changed.error?.code, -32803, JSON.stringify(changed))
      assert.equal(events().filter(row => row.event === "semantic.context.create").length, created,
        "the changed-input witness must cover the retained owner, not a cold replacement")
      if (mutation === "parent-retarget") {
        assert.deepEqual(witness.beforeIdentity, witness.afterIdentity, "the physical-path guard covers unchanged file identity and bytes")
        assert.notEqual(witness.beforePhysicalPath, witness.afterPhysicalPath)
        const parent = path.dirname(path.join(workspace, declaration))
        fs.unlinkSync(parent); fs.renameSync(parent + ".moved", parent)
      } else fs.writeFileSync(path.join(workspace, declaration), files[declaration])
      session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
        params: { changes: [{ uri: uri(declaration), type: 2 }] } })
    }
    await complete("diskMember", "overlayMember")
    if (!mutation) assert.equal(events().filter(row => row.event === "semantic.context.create").length, created,
      "a closed legal ambient input outside textual imports must be delivered as current disk authority to the existing group")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
}
