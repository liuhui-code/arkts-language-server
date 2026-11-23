import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createSdkPartialScopeFixture } from "../support/sdk-partial-scope-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

for (const mode of ["overlay-only", "disk-only", "overlay-and-disk"]) test(
  "source fact updates stay local for " + mode, { timeout: 40_000 }, async t => {
  const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/graph-node-retention.cjs"))}` })
  const count = 400
  for (let i = 0; i < count; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`),
    `import "./Unused${(i + 1) % count}"\nexport const body${i} = ${i}\n`)
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
  await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
  const uri = f.uri(`${folder}/Main.ets`)
  const exact = async () => {
    const r = await f.session.request("textDocument/typeDefinition", { textDocument: { uri },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) })
    assert.equal(r.error, undefined, JSON.stringify(r))
    assert.deepEqual(r.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    return fs.readFileSync(path.join(f.directory, "graph-node-retention.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse).filter(row => row.method === "typeDefinitions").at(-1)
  }
  const name = `${folder}/Unused350.ts`, file = path.join(sourceRoot, "Unused350.ts"), changedUri = f.uri(name)
  const original = fs.readFileSync(file, "utf8")
  await exact(); await exact()
  if (mode !== "disk-only") f.session.openDocument({ uri: changedUri, version: 1, text: original })
  await exact()
  let version = 1
  {
    const text = original.replace("= 350", "= 350 + 1")
    if (mode !== "disk-only") f.session.changeDocument({ uri: changedUri, version: ++version, text })
    if (mode !== "overlay-only") {
      fs.writeFileSync(file, text)
      f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
        changes: [{ uri: changedUri, type: 2 }] } })
      if (mode === "overlay-and-disk") f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didSave",
        params: { textDocument: { uri: changedUri }, text } })
    }
    const observed = await exact()
    t.diagnostic(JSON.stringify({ mode, observed }))
    assert.ok(observed.factPasses.length, "each changed input must be consumed, not ignored")
    assert.deepEqual(observed.enumerations, [], "known regular-file changes must retain the complete directory proof instead of enumerating the whole project")
    assert.ok(observed.factPasses.every(pass => pass.files?.length === 1 && pass.files[0] === file),
      "complete overlay/disk histories must visit only their changed source, not all400unrelated facts")
    if (mode !== "disk-only") {
      const hover = await f.session.request("textDocument/hover", { textDocument: { uri: changedUri },
        position: positionAt(text, text.indexOf("body350") + 1) })
      assert.equal(hover.error, undefined, JSON.stringify(hover))
      assert.match(JSON.stringify(hover.result), /body350: number/)
    }
    if (mode !== "disk-only") f.session.changeDocument({ uri: changedUri, version: ++version, text: original })
    fs.writeFileSync(file, original)
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
      changes: [{ uri: changedUri, type: 2 }] } })
    await exact()
  }
  assert.equal(fs.readFileSync(file, "utf8"), original)
  assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

for (const notifyDisk of [true, false]) test(notifyDisk
  ? "watched disk plus overlay preserves both fresh inputs in a local fact pass"
  : "an unnotified changed catalog rejects its old capture then a fresh query updates both inputs", { timeout: 40_000 }, async t => {
  const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/graph-node-retention.cjs"))}` })
  const uri = f.uri(`${folder}/Main.ets`), file = path.join(sourceRoot, "Unused35.ts")
  const old = fs.readFileSync(file, "utf8"), current = main + "\nexport const mixed = new CrossFact()\n"
  const query = (text, name) => f.session.request("textDocument/typeDefinition", {
    textDocument: { uri }, position: positionAt(text, text.lastIndexOf(name) + 1) })
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
  await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
  assert.equal((await query(main, "GlobalThing")).error, undefined)
  f.session.openDocument({ uri, version: 1, text: main })
  assert.equal((await query(main, "GlobalThing")).error, undefined)
  fs.writeFileSync(file, "class CrossFact { fresh: number = 123 }\n")
  if (notifyDisk) f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
    changes: [{ uri: f.uri(`${folder}/Unused35.ts`), type: 2 }] } })
  f.session.changeDocument({ uri, version: 2, text: current })
  let response = await query(current, "CrossFact")
  if (!notifyDisk) {
    // Scope.ensure discovers a different physical catalog after this request's
    // membership stamp was captured. It must not rebase that original request.
    assert.equal(response.error?.code, -32803, JSON.stringify(response))
    assert.equal(response.result, undefined)
    const rejectedId = response.id
    response = await query(current, "CrossFact")
    assert.notEqual(response.id, rejectedId, "recovery is a new public request, never laundering the old capture")
    t.diagnostic(JSON.stringify({ notifyDisk, rejectedId, freshRequestId: response.id }))
  }
  assert.equal(response.error, undefined, JSON.stringify(response))
  assert.deepEqual(response.result, [{ uri: f.uri(`${folder}/Unused35.ts`), range: {
    start: { line: 0, character: 6 }, end: { line: 0, character: 15 } } }])
  const row = fs.readFileSync(path.join(f.directory, "graph-node-retention.jsonl"), "utf8")
    .trim().split("\n").map(JSON.parse).filter(row => row.method === "typeDefinitions").at(-1)
  t.diagnostic(JSON.stringify({ notifyDisk, observed: row }))
  assert.ok(row.factPasses.length)
  for (const pass of row.factPasses) assert.deepEqual(pass.files?.slice().sort(),
    [file, path.join(sourceRoot, "Main.ets")].sort(), "both complete producer changes must reach the fact pass")
  f.session.changeDocument({ uri, version: 3, text: main })
  fs.writeFileSync(file, old)
  f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
    changes: [{ uri: f.uri(`${folder}/Unused35.ts`), type: 2 }] } })
  const restored = await query(main, "GlobalThing")
  assert.equal(restored.error, undefined, JSON.stringify(restored))
  assert.deepEqual(restored.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
    start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
  assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

test("a completed physical refresh before watch delivery preserves the complete fact delta",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/graph-node-retention.cjs"))}` })
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const uri = f.uri(`${folder}/Main.ets`), name = "ObservedBeforeWatch"
    const text = main + `\nexport const probe = new ${name}()\n`
    f.session.openDocument({ uri, version: 1, text })
    await f.session.transport.notification("textDocument/publishDiagnostics",
      m => m.params.uri === uri && m.params.version === 1, 10_000)
    const params = { textDocument: { uri }, position: positionAt(text, text.indexOf(name) + 1) }
    const warm = await f.session.request("textDocument/typeDefinition", params)
    assert.equal(warm.error, undefined); assert.deepEqual(warm.result, [])
    const signals = path.join(f.directory, "logs"), file = path.join(sourceRoot, "Unused35.ts")
    fs.writeFileSync(path.join(signals, "arm-node-catalog.json"), JSON.stringify({
      file: "not-a-node-commit-target", stage: "before-membership" }))
    const waitFor = async predicate => {
      const deadline = Date.now() + 6000
      while (!predicate()) {
        assert.ok(Date.now() < deadline, "controlled membership boundary must be reached")
        await new Promise(resolve => setTimeout(resolve, 5))
      }
    }
    const rows = () => fs.readFileSync(path.join(f.directory, "graph-node-retention.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse)
    try {
      f.session.changeDocument({ uri, version: 2, text: text + "\n// background observer\n" })
      await waitFor(() => fs.existsSync(path.join(signals, "membership-catalog-paused")))
      const paused = JSON.parse(fs.readFileSync(path.join(signals, "membership-catalog-paused"), "utf8"))
      fs.writeFileSync(file, `class ${name} {}\n`)
      fs.writeFileSync(path.join(signals, "resume-membership-catalog"), "resume")
      await waitFor(() => rows().some(row => row.id === paused.workerRequestId))
      const old = rows().find(row => row.id === paused.workerRequestId)
      assert.equal(old.method, "diagnose")
      assert.deepEqual(old.factPasses, [], "old capture must be refused before updating source facts")
      assert.deepEqual(old.graphStates, [], "old capture cannot publish graph state")
      f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
        changes: [{ uri: f.uri(`${folder}/Unused35.ts`), type: 2 }] } })
      const fresh = await f.session.request("textDocument/typeDefinition", params)
      assert.equal(fresh.error, undefined, JSON.stringify(fresh))
      assert.deepEqual(fresh.result, [{ uri: f.uri(`${folder}/Unused35.ts`), range: {
        start: { line: 0, character: 6 }, end: { line: 0, character: 6 + name.length } } }])
      const observed = rows().filter(row => row.method === "typeDefinitions").at(-1)
      t.diagnostic(JSON.stringify({ paused, observed }))
      assert.ok(observed.factPasses.length)
      for (const pass of observed.factPasses) assert.deepEqual(pass.files?.slice().sort(),
        [file, path.join(sourceRoot, "Main.ets")].sort())
      assert.deepEqual(observed.roleDirectoryInputs, [])
      assert.equal(observed.ownerRetentionVisits, 0)
      assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    } finally { fs.writeFileSync(path.join(signals, "resume-membership-catalog"), "cleanup") }
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })
