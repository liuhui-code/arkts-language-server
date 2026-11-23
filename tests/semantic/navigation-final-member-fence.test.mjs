import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import test from "node:test"
import { createSdkPartialScopeFixture } from "../support/sdk-partial-scope-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

for (const kind of ["source", "directory-cycle", "created", "sdk"]) {
  test(`public navigation refuses an unnotified ${kind} race at its required final member fence`,
    { timeout: 40_000 }, async t => {
      const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
        NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/final-member-input-race.cjs"))}` })
      for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`),
        `import "./Box"\nimport "./Unused${(i + 1) % 400}"\nexport const value${i} = ${i}\n`)
      await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
      await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
      const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
        position: positionAt(main, main.indexOf("GlobalThing") + 1) }
      const warm = await f.session.request("textDocument/typeDefinition", params)
      assert.equal(warm.error, undefined, JSON.stringify(warm))
      const file = kind === "sdk" ? path.join(f.sdk, "ets/oh-uni-package.json")
        : path.join(sourceRoot, kind === "source" ? "Unused350.ts" : kind === "directory-cycle" ? "transient-empty" : "CreatedLate.ts")
      const stage = kind === "created" ? "after" : kind === "sdk" ? "during" : "before"
      fs.writeFileSync(path.join(f.directory, "arm-final-member.json"), JSON.stringify({ kind, stage, file,
        trigger: path.join(sourceRoot, "Unused0.ts") }))
      const stale = await f.session.request("textDocument/typeDefinition", params)
      const events = fs.readFileSync(path.join(f.directory, "final-member-events.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
      t.diagnostic(JSON.stringify({ kind, stale, events }))
      assert.equal(events.filter(event => event.event === "mutated").length, 1)
      assert.equal(stale.error?.code, -32803, JSON.stringify(stale))
      assert.equal(stale.result, undefined)
      const scopes = events.filter(event => event.event === "scope-return")
      if (kind === "directory-cycle") {
        assert.ok(events.some(event => event.event === "member-return" && !event.valid && event.invalidated))
        assert.ok(events.some(event => event.event === "created-proof"))
        assert.ok(scopes.some(event => event.valid && event.obligations > 0),
          "a same-membership replacement cannot discharge the original owner even when scope checks pass")
      } else if (kind === "created") assert.ok(scopes.some(event => event.valid && event.obligations === 0),
        "the terminal directory fence rejects after the required member observation has succeeded")
      else if (kind === "sdk") {
        assert.ok(events.some(event => event.event === "member-return" && event.valid))
        assert.ok(scopes.some(event => !event.valid && event.obligations === 0),
          "post-member SDK checks still execute after original membership is consumed")
      }
      if (kind === "sdk") {
        assert.equal((await f.session.request("textDocument/typeDefinition", params)).error?.code, -32803,
          "a source recovery cannot silently renew changed SDK inputs")
        f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
          params: { settings: { arkts: { sdk: { path: f.sdk } } } } })
      } else if (kind !== "directory-cycle") f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
        params: { changes: [{ uri: f.uri(`${folder}/${path.basename(file)}`), type: kind === "source" ? 2 : 1 }] } })
      const fresh = await f.session.request("textDocument/typeDefinition", params)
      assert.equal(fresh.error, undefined, JSON.stringify(fresh))
      assert.deepEqual(fresh.result, warm.result)
      if (kind === "source" || kind === "created") {
        const symbol = kind === "source" ? "LateFinalGlobal" : "LateCreatedGlobal"
        const text = main + `\nexport const discovered = new ${symbol}()\n`
        f.session.openDocument({ uri: params.textDocument.uri, version: 1, text })
        const found = await f.session.request("textDocument/typeDefinition", {
          textDocument: params.textDocument, position: positionAt(text, text.indexOf(symbol) + 1) })
        assert.equal(found.error, undefined, JSON.stringify(found))
        assert.deepEqual(found.result, [{ uri: f.uri(`${folder}/${path.basename(file)}`), range: {
          start: { line: 0, character: 6 }, end: { line: 0, character: 6 + symbol.length } } }])
      }
      assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
      assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
    })
}

for (const stableDirectoryIds of [true, false])
for (const method of ["textDocument/typeDefinition", "textDocument/hover"])
for (const kind of ["source", "created"]) {
  test(`complete SDK ${method} rejects an unnotified ${kind} change after compiler query and recovers (stableDirs=${stableDirectoryIds})`,
    { timeout: 40_000 }, async t => {
      const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
        ARKTS_TEST_WEAK_DIRECTORY_IDS: stableDirectoryIds ? "0" : "1",
        NODE_OPTIONS: ["final-member-input-race.cjs", "partial-initialization-observation.cjs"]
          .map(file => `--require=${JSON.stringify(path.resolve("tests/fixtures", file))}`).join(" ") })
      const profilePath = path.join(f.workspace, "build-profile.json5")
      const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"))
      profile.app.products[0].compileSdkVersion = 24
      fs.writeFileSync(profilePath, JSON.stringify(profile))
      await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
      const terminal = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
      assert.equal(terminal.params.report.semanticState, "ready")
      const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
        position: positionAt(main, main.indexOf("GlobalThing") + 1) }
      const warm = await f.session.request(method, params)
      assert.equal(warm.error, undefined, JSON.stringify(warm))
      const file = path.join(sourceRoot, kind === "source" ? "Unused80.ts" : "CreatedLate.ts")
      fs.writeFileSync(path.join(f.directory, "arm-final-member.json"), JSON.stringify({ kind, stage: "entry", file }))
      const stale = await f.session.request(method, params)
      const events = fs.readFileSync(path.join(f.directory, "final-member-events.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
      assert.equal(events.filter(event => event.event === "mutated").length, 1, JSON.stringify(events))
      assert.equal(stale.error?.code, -32803, JSON.stringify(stale))
      assert.equal(stale.result, undefined, "a final-fence change cannot publish the computed answer")
      const fresh = await f.session.request(method, params)
      assert.equal(fresh.error, undefined, JSON.stringify(fresh))
      assert.deepEqual(fresh.result, warm.result)
      const symbol = kind === "source" ? "LateFinalGlobal" : "LateCreatedGlobal"
      const text = main + `\nexport const discovered = new ${symbol}()\n`
      f.session.openDocument({ uri: params.textDocument.uri, version: 1, text })
      const found = await f.session.request("textDocument/typeDefinition", { textDocument: params.textDocument,
        position: positionAt(text, text.indexOf(symbol) + 1) })
      assert.equal(found.error, undefined, JSON.stringify(found))
      assert.deepEqual(found.result, [{ uri: f.uri(`${folder}/${path.basename(file)}`), range: {
        start: { line: 0, character: 6 }, end: { line: 0, character: 6 + symbol.length } } }])
      assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
      assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
    })
}

test("complete SDK groups preserve their final member fence after public multi-root catalog eviction",
  { timeout: 60_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/final-member-input-race.cjs"))}` })
    const profilePath = path.join(f.workspace, "build-profile.json5")
    const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"))
    profile.app.products[0].compileSdkVersion = 24
    fs.writeFileSync(profilePath, JSON.stringify(profile))
    const folders = [{ uri: f.rootUri, name: "primary" }]
    for (let i = 1; i <= 4; i++) {
      const root = path.join(f.directory, `workspace${i}`)
      fs.mkdirSync(root)
      fs.writeFileSync(path.join(root, "Main.ets"), "export const other = 1\n")
      folders.push({ uri: pathToFileURL(root).href, name: `other${i}` })
    }
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } }, workspaceFolders: folders })
    const terminal = await f.session.transport.notification("arkts/semanticPreparation",
      m => m.params.rootUri === f.rootUri && m.params.phase === "complete", 20_000)
    assert.equal(terminal.params.report.semanticState, "ready")
    const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) }
    const warm = await f.session.request("textDocument/typeDefinition", params)
    assert.equal(warm.error, undefined, JSON.stringify(warm))
    // The actual Store cache holds four roots. Public preparations displace the
    // primary catalog while its semantic group and Program remain alive.
    for (const folder of folders.slice(1)) {
      const ready = await f.session.request("arkts/semanticReadiness", { rootUri: folder.uri, prepare: true }, { timeoutMs: 20_000 })
      assert.equal(ready.error, undefined, JSON.stringify(ready))
      assert.equal(ready.result.semanticState, "ready")
    }
    const file = path.join(sourceRoot, "Unused80.ts")
    fs.writeFileSync(path.join(f.directory, "arm-final-member.json"), JSON.stringify({ kind: "source", stage: "entry", file }))
    const stale = await f.session.request("textDocument/typeDefinition", params)
    const events = fs.readFileSync(path.join(f.directory, "final-member-events.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
    assert.equal(events.filter(event => event.event === "mutated").length, 1, JSON.stringify(events))
    t.diagnostic(JSON.stringify({ stale, events }))
    assert.equal(stale.error?.code, -32803, "recreated catalog must contribute its original final proof")
    const fresh = await f.session.request("textDocument/typeDefinition", params)
    assert.equal(fresh.error, undefined, JSON.stringify(fresh))
    assert.deepEqual(fresh.result, warm.result)
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })
