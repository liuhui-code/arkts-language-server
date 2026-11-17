import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createSdkPartialScopeFixture } from "../support/sdk-partial-scope-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

// Real shared-cell cancellation caused by didOpen, not a synthetic compiler exception.
for (const [phase, replaceSdk, editFact] of [["roles", false, false], ["bindings", false, false], ["roles", true, false], ["roles", false, true]])
  test(`initialization retry after cancellation in ${phase} ${replaceSdk ? "replaces SDK ownership" : editFact ? "updates a changed source fact" : "resumes current syntax metadata"}`,
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      ARKTS_TEST_SCOPE_RETRY_PHASE: phase,
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/initial-scope-cancellation.cjs"))}` })
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`),
      `import "./Unused${(i + 1) % 400}"\nexport const value${i} = ${i}\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const paused = path.join(f.directory, "scope-paused"), deadline = Date.now() + 10_000
    while (!fs.existsSync(paused)) {
      assert.ok(Date.now() < deadline, "actual initialization role boundary must be reached")
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    if (replaceSdk) {
      const nextSdk = path.join(f.directory, "replacement-sdk")
      fs.cpSync(f.sdk, nextSdk, { recursive: true })
      f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
        params: { settings: { arkts: { sdk: { path: nextSdk } } } } })
    }
    let changedUri, input = main
    if (editFact) {
      const rows = fs.readFileSync(path.join(f.directory, "scope-retry.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
      const first = rows.find(row => row.kind === "role").file
      assert.equal(fs.realpathSync(path.dirname(first)), fs.realpathSync(sourceRoot))
      fs.writeFileSync(first, 'class DraftGlobal { value: string = "current" }\n')
      changedUri = f.uri(`${folder}/${path.basename(first)}`)
      f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
        params: { changes: [{ uri: changedUri, type: 2 }] } })
      input += "\nexport const draft = new DraftGlobal()\n"
    }
    f.session.openDocument({ uri: f.uri(`${folder}/Main.ets`), version: 1, text: input })
    fs.writeFileSync(path.join(f.directory, "scope-resume"), "didOpen sent\n")
    const terminal = await f.session.transport.notification("arkts/semanticPreparation",
      m => m.params.phase === "complete", 20_000)
    assert.equal(terminal.params.report.semanticState, "partial")
    const rows = fs.readFileSync(path.join(f.directory, "scope-retry.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse)
    assert.ok(rows.some(row => row.kind === "worker-error" && row.error.code === "content-modified"),
      "the first initialization must actually be invalidated by the editor mutation")
    const roles = rows.filter(row => row.kind === "role"), first = roles[0].file
    const firstCount = roles.filter(row => row.file === first).length
    t.diagnostic(JSON.stringify({ roles: roles.length, unique: new Set(roles.map(row => row.file)).size, firstCount }))
    assert.equal(firstCount, replaceSdk || editFact ? 2 : 1, "same inputs may resume; an SDK configuration replaces the old draft owner")
    if (editFact) assert.equal(roles.filter(row => row.file === roles[1].file).length, 1,
      "updating one changed fact must not discard another unchanged completed fact")
    const result = await f.session.request("textDocument/typeDefinition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) })
    assert.equal(result.error, undefined, JSON.stringify(result))
    assert.deepEqual(result.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    if (editFact) {
      const current = await f.session.request("textDocument/typeDefinition", {
        textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(input, input.indexOf("DraftGlobal") + 1) })
      assert.equal(current.error, undefined, JSON.stringify(current))
      assert.deepEqual(current.result, [{ uri: changedUri, range: {
        start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    }
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
  })


test("client cancellation interrupts repeated scope validation and the same Worker recovers",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-checkpoint-count.cjs"))}` })
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`),
      `import "./Unused${(i + 1) % 400}"\nexport const value${i} = ${i}\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) }
    const first = await f.session.request("textDocument/typeDefinition", params)
    assert.equal(first.error, undefined, JSON.stringify(first))
    const waitFor = async name => {
      const deadline = Date.now() + 5000
      while (!fs.existsSync(path.join(f.directory, name))) {
        assert.ok(Date.now() < deadline, `actual ${name} boundary must be reached`)
        await new Promise(resolve => setTimeout(resolve, 5))
      }
    }
    fs.writeFileSync(path.join(f.directory, "arm-scope-checkpoint"), "armed")
    f.session.transport.send({ jsonrpc: "2.0", id: 50, method: "textDocument/typeDefinition", params })
    await waitFor("scope-checkpoint-paused")
    f.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: 50 } })
    try {
      await waitFor("scope-checkpoint-cancel-observed")
      assert.equal(fs.readFileSync(path.join(f.directory, "scope-checkpoint-cancel-observed"), "utf8"), "1",
        "observe real client-cancellation delivery to the shared cell before releasing the Worker")
    } finally { fs.writeFileSync(path.join(f.directory, "resume-scope-checkpoint"), "resume") }
    const cancelled = await f.session.transport.response(50, 10_000)
    assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
    const recovered = await f.session.request("textDocument/typeDefinition", params)
    assert.equal(recovered.error, undefined, JSON.stringify(recovered))
    assert.deepEqual(recovered.result, first.result)
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
  })
