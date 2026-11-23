import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createSdkPartialScopeFixture } from "../support/sdk-partial-scope-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

test("initialization and first navigation normalize each catalog member once across multiple semantic groups",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-directory-resolution-count.cjs"))}` })
    const count = 400
    for (let i = 0; i < count; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), "export {}\n")
    const profilePath = path.join(f.workspace, "build-profile.json5")
    const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"))
    for (const name of ["otherA", "otherB"]) {
      const module = path.join(f.workspace, name)
      fs.mkdirSync(path.join(module, "src/main/ets"), { recursive: true })
      fs.writeFileSync(path.join(module, "build-profile.json5"), "{targets:[{name:'default'}]}")
      fs.writeFileSync(path.join(module, "oh-package.json5"), JSON.stringify({ name }))
      fs.writeFileSync(path.join(module, "src/main/ets/Other.ets"), `export const ${name} = 1\n`)
      profile.modules.push({ name, srcPath: "./" + name,
        targets: [{ name: "default", applyToProducts: ["default"] }] })
    }
    fs.writeFileSync(profilePath, JSON.stringify(profile))
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const response = await f.session.request("textDocument/typeDefinition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    const rows = fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse)
    const observed = rows.filter(row => row.method === "typeDefinitions").at(-1)
    t.diagnostic(JSON.stringify(observed))
    assert.equal(rows.reduce((sum, row) => sum + row.groupDiscoveries, 0), 1,
      "the cold public session exercises one actual group discovery")
    assert.equal(rows.reduce((sum, row) => sum + row.groupNormalizations, 0), count,
      "shared membership spelling is normalized once across initialization and navigation")
    assert.ok(observed.leafStats >= count, "disk input fences remain active")
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("unchanged public navigation retains its semantic-role catalog and independent input proofs",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-directory-resolution-count.cjs"))}` })
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`),
      `import "./Box"\nimport "./Unused${(i + 1) % 400}"\nexport const value${i} = ${i}\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) }
    const first = await f.session.request("textDocument/typeDefinition", params)
    assert.equal(first.error, undefined, JSON.stringify(first))
    const hot = await f.session.request("textDocument/typeDefinition", params)
    assert.equal(hot.error, undefined, JSON.stringify(hot))
    assert.deepEqual(hot.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    const rows = fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse).filter(row => row.method === "typeDefinitions")
    const observed = rows.at(-1)
    t.diagnostic(JSON.stringify(observed))
    assert.equal(observed.roleCatalogChanges, 0, "an unchanged query must not replace the entire role catalog")
    assert.equal(observed.duplicateFinalConfigurationComparisons, 0,
      "one unchanged final witness compares its retained observations only once")
    assert.equal(observed.membershipRawPassesByPhase.final, 1,
      "a guaranteed scope consumer performs the original membership owner's independent final observation")
    assert.equal(observed.overlayValidationLookups, 0,
      "unchanged store-owned overlay lifecycle must not rescan every project member at the final fence")
    assert.equal(observed.cumulativeGraphRebuilds, 1, "reuse must not be replaced with a hidden graph rebuild")
    assert.equal(observed.leafStats, 2000, "only qualified same-phase sharing and the duplicate membership entry are removed")
    assert.equal(observed.leafStatsByPhase.final, 1200, "one required member observer and both configuration final observations remain")
    assert.equal(observed.leafStatsByPhase.final - observed.membershipRawPassesByPhase.final * 400, 800,
      "configuration retains its original two-sided raw final fence")
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("cancelling after a changed role fact cannot leave the next query on an obsolete role catalog",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/role-catalog-cancellation.cjs"))}` })
    for (let i = 96; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), "export {}\n")
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const uri = f.uri(`${folder}/Main.ets`)
    const first = await f.session.request("textDocument/typeDefinition", { textDocument: { uri },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) })
    assert.equal(first.error, undefined, JSON.stringify(first))
    const file = path.join(sourceRoot, "Unused350.ts"), declaration = "class RestoredRoleGlobal {}\n"
    fs.writeFileSync(file, declaration)
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: f.uri(`${folder}/Unused350.ts`), type: 2 }] } })
    const text = main + "\nexport const restored = new RestoredRoleGlobal()\n"
    f.session.openDocument({ uri, version: 1, text })
    fs.writeFileSync(path.join(f.directory, "arm-role-catalog.json"), JSON.stringify({ file }))
    const params = { textDocument: { uri }, position: positionAt(text, text.indexOf("RestoredRoleGlobal") + 1) }
    const waitFor = async name => {
      const deadline = Date.now() + 5000
      while (!fs.existsSync(path.join(f.directory, name))) {
        assert.ok(Date.now() < deadline, `actual ${name} boundary must be reached`)
        await new Promise(resolve => setTimeout(resolve, 5))
      }
    }
    f.session.transport.send({ jsonrpc: "2.0", id: 50, method: "textDocument/typeDefinition", params })
    try {
      await waitFor("role-catalog-paused")
      f.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: 50 } })
      await waitFor("role-cancel-observed")
      assert.equal(fs.readFileSync(path.join(f.directory, "role-cancel-observed"), "utf8"), "1")
    } finally { fs.writeFileSync(path.join(f.directory, "resume-role-catalog"), "resume") }
    const cancelled = await f.session.transport.response(50, 10_000)
    assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
    const recovered = await f.session.request("textDocument/typeDefinition", params)
    assert.equal(recovered.error, undefined, JSON.stringify(recovered))
    assert.deepEqual(recovered.result, [{ uri: f.uri(`${folder}/Unused350.ts`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 24 } } }])
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("initial preparation shares pure role summaries for identical admitted source contents",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-directory-resolution-count.cjs"))}` })
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`),
      'export { Box } from "./Box"\n')
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const rows = fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse).filter(row => row.method === "semanticReadiness")
    const observed = rows.at(-1)
    t.diagnostic(JSON.stringify(observed))
    assert.equal(observed.roleParses, 1, "identical bytes in one parser/configuration domain need one role parse")
    const response = await f.session.request("textDocument/typeDefinition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("shared role syntax retains containing-file bindings through dependency edit and undo",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t)
    const entry = 'export { Local } from "./Local"\n'
    for (const side of ["left", "right"]) {
      fs.mkdirSync(path.join(sourceRoot, side))
      fs.writeFileSync(path.join(sourceRoot, side, "Entry.ts"), entry)
      fs.writeFileSync(path.join(sourceRoot, side, "Local.ts"), "export class Local {}\n")
      fs.writeFileSync(path.join(sourceRoot, side, "Other.ts"), "export class Other {}\n")
    }
    const text = 'import { Local as Left } from "./left/Entry"\n'
      + 'import { Local as Right } from "./right/Entry"\nexport const a = new Left()\nexport const b = new Right()\n'
    fs.writeFileSync(path.join(sourceRoot, "Main.ets"), text)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const check = async (symbol, target, name) => {
      const response = await f.session.request("textDocument/typeDefinition", {
        textDocument: { uri: f.uri(`${folder}/Main.ets`) },
        position: positionAt(text, text.lastIndexOf(symbol) + 1) })
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [{ uri: f.uri(`${folder}/${target}.ts`), range: {
        start: { line: 0, character: 13 }, end: { line: 0, character: 13 + name.length } } }])
    }
    await check("Left", "left/Local", "Local")
    await check("Right", "right/Local", "Local")
    for (const [content, target, name] of [
      ['export { Other as Local } from "./Other"\n', "right/Other", "Other"],
      [entry, "right/Local", "Local"],
    ]) {
      fs.writeFileSync(path.join(sourceRoot, "right/Entry.ts"), content)
      f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
        params: { changes: [{ uri: f.uri(`${folder}/right/Entry.ts`), type: 2 }] } })
      await check("Right", target, name)
      await check("Left", "left/Local", "Local")
    }
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("partial initialization hands its pure group catalog to the first navigation without claiming full readiness",
  { timeout: 30_000 }, async t => {
    const { f, folder, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-directory-resolution-count.cjs"))}` })
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const terminal = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    assert.equal(terminal.params.report.semanticState, "partial")
    const response = await f.session.request("textDocument/typeDefinition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    const rows = fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse)
    assert.equal(rows.find(row => row.method === "semanticReadiness").groupDiscoveries, 1,
      "initialization should prepare pure groups even when SDK coverage is incomplete")
    assert.equal(rows.find(row => row.method === "typeDefinitions").groupDiscoveries, 0,
      "first navigation consumes the same graph/member catalog")
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("configuration preparation borrows completed typed membership observations but final leaves stay independent",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-directory-resolution-count.cjs"))}` })
    const count = 400
    for (let i = 0; i < count; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`),
      `import "./Box"\nimport "./Unused${(i + 1) % count}"\nexport const value${i} = ${i}\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) }
    await f.session.request("textDocument/typeDefinition", params)
    const response = await f.session.request("textDocument/typeDefinition", params)
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    const rows = fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse).filter(row => row.method === "typeDefinitions")
    const observed = rows.at(-1)
    t.diagnostic(JSON.stringify(observed))
    assert.equal(observed.leafStatsByPhase.prepare, count, "the complete native producer still observes every leaf")
    assert.equal(observed.membershipRawPassesByPhase.final, 1, "the original producer is consumed by its registered final scope")
    assert.equal(observed.leafStatsByPhase.final, count * 3, "one membership and two configuration final observations remain raw")
    assert.equal(observed.leafStatsByPhase.query, count,
      "configuration shares one proven same-phase observation and keeps its later independent observation")
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


for (const owned of [true, false]) test(`unchanged admitted inputs reuse completed role facts only with owned receipts (owned=${owned})`,
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-directory-resolution-count.cjs"))}`,
      ARKTS_TEST_UNOWNED_MEMBERSHIP: owned ? "0" : "1" })
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`),
      `import "./Unused${(i + 1) % 400}"\nexport const body${i} = ${i}\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) }
    for (let round = 0; round < 3; round++) {
      const response = await f.session.request("textDocument/typeDefinition", params)
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
        start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    }
    const rows = fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
    const repeated = rows.filter(row => row.method === "typeDefinitions").slice(-2)
    assert.equal(repeated.length, 2)
    t.diagnostic(JSON.stringify(repeated))
    for (const row of repeated) {
      assert.equal(row.roleTokenLookups, owned ? 0 : 400,
        "only an owned completed role receipt may skip token polling; frozen unowned projections retain the fallback")
      assert.equal(row.sourceReads, 0)
      assert.equal(row.leafStats, 2000, "independent membership and original configuration leaf proofs remain")
      assert.equal(row.membershipRawPassesByPhase.final, 1)
    }
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("completed role facts cannot hide an unnotified same-size same-mtime new global",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t)
    for (let i = 96; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), "export {}\n")
    const file = path.join(sourceRoot, "Unused350.ts"), name = "SilentGlobal"
    const original = 'export const inactiveBody = 1; // deliberately long unchanged size witness\n'
    fs.writeFileSync(file, original)
    const timestamp = new Date(Math.floor(Date.now() / 1000) * 1000 - 10_000)
    fs.utimesSync(file, timestamp, timestamp)
    const text = main + `\nexport const silent = new ${name}()\n`
    fs.writeFileSync(path.join(sourceRoot, "Main.ets"), text)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(text, text.indexOf(name) + 1) }
    const before = await f.session.request("textDocument/typeDefinition", params)
    assert.equal(before.error, undefined, JSON.stringify(before)); assert.deepEqual(before.result, [])
    const stat = fs.statSync(file), declaration = `class ${name} {}\n`
    fs.writeFileSync(file, declaration.padEnd(Buffer.byteLength(original), " "))
    fs.utimesSync(file, stat.atime, stat.mtime)
    assert.equal(fs.statSync(file).size, stat.size)
    assert.equal(fs.statSync(file).mtimeMs, stat.mtimeMs)
    const stale = await f.session.request("textDocument/typeDefinition", params)
    t.diagnostic(JSON.stringify({ stale }))
    assert.equal(stale.error?.code, -32803, "the prior source namespace must be rejected before new facts are admitted")
    const fresh = await f.session.request("textDocument/typeDefinition", params)
    assert.equal(fresh.error, undefined, JSON.stringify(fresh))
    assert.deepEqual(fresh.result, [{ uri: f.uri(`${folder}/Unused350.ts`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 6 + name.length } } }])
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("saved disk delta updates only changed role facts while preserving public input fences",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-directory-resolution-count.cjs"))}` })
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`),
      `export const value${i} = ${i}\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const query = () => f.session.request("textDocument/typeDefinition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) })
    const exact = async () => {
      const response = await query()
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
        start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    }
    await exact(); await exact()
    const file = path.join(sourceRoot, "Unused350.ts"), original = fs.readFileSync(file, "utf8")
    fs.writeFileSync(file, original.replace("= 350", "= 350 + 1"))
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
      changes: [{ uri: f.uri(`${folder}/Unused350.ts`), type: 2 }] } })
    await exact()
    const rows = fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse).filter(row => row.method === "typeDefinitions")
    const observed = rows.at(-1)
    t.diagnostic(JSON.stringify(observed))
    assert.equal(observed.roleTokenLookups, 2,
      "only the changed fact token and its authoritative read admission are polled")
    assert.equal(observed.membershipEnumerations, 0,
      "a known accepted body save must renew its member proof without enumerating all files")
    assert.ok(observed.leafStats >= 800, "independent raw member and final input checks remain")
    const changed = fs.readFileSync(file, "utf8")
    const hover = await f.session.request("textDocument/hover", { textDocument: {
      uri: f.uri(`${folder}/Unused350.ts`) }, position: positionAt(changed, changed.indexOf("value350") + 1) })
    assert.equal(hover.error, undefined, JSON.stringify(hover))
    assert.match(JSON.stringify(hover.result), /value350: number/)
    const other = path.join(sourceRoot, "Unused351.ts"), otherOriginal = fs.readFileSync(other, "utf8")
    for (const undo of [false, true]) {
      fs.writeFileSync(file, undo ? original : original.replace("= 350", '= "updated"'))
      fs.writeFileSync(other, undo ? otherOriginal : otherOriginal.replace("= 351", '= "second"'))
      f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
        changes: [350, 351].map(index => ({ uri: f.uri(`${folder}/Unused${index}.ts`), type: 2 })) } })
      await exact()
      const batch = fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8")
        .trim().split("\n").map(JSON.parse).filter(row => row.method === "typeDefinitions").at(-1)
      t.diagnostic(JSON.stringify({ undo, roleTokenLookups: batch.roleTokenLookups }))
      assert.equal(batch.roleTokenLookups, 4, "both full-project delta paths survive current semantic-scope exclusion")
      for (const index of [350, 351]) {
        const text = fs.readFileSync(path.join(sourceRoot, `Unused${index}.ts`), "utf8")
        const current = await f.session.request("textDocument/hover", { textDocument: {
          uri: f.uri(`${folder}/Unused${index}.ts`) }, position: positionAt(text, text.indexOf(`value${index}`) + 1) })
        assert.equal(current.error, undefined, JSON.stringify(current))
        assert.match(current.result.contents.value, new RegExp(`value${index}: ${undo ? index : JSON.stringify(index === 350 ? "updated" : "second")}`))
      }
    }
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

for (const owned of [true, false]) test(`unsaved overlay edits and close-reopen update only their own role facts (owned=${owned})`,
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-directory-resolution-count.cjs"))}`,
      ARKTS_TEST_UNOWNED_OVERLAY_STATE: owned ? "0" : "1" })
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`),
      `export const value${i} = ${i}\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const query = async () => {
      const response = await f.session.request("textDocument/typeDefinition", {
        textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(main, main.indexOf("GlobalThing") + 1) })
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
        start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
      return fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8")
        .trim().split("\n").map(JSON.parse).filter(row => row.method === "typeDefinitions").at(-1)
    }
    await query()
    const uri = f.uri(`${folder}/Unused350.ts`), original = fs.readFileSync(path.join(sourceRoot, "Unused350.ts"), "utf8")
    f.session.openDocument({ uri, version: 1, text: original })
    await query()
    assert.equal((await query()).roleTokenLookups, 0, "unchanged open-document queries retain completed facts")
    for (const [version, text] of [[2, original.replace("= 350", "= 350 + 1")], [3, original]]) {
      f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didChange", params: {
        textDocument: { uri, version }, contentChanges: [{ text }] } })
      const observed = await query()
      t.diagnostic(JSON.stringify({ version, observed }))
      assert.equal(observed.roleTokenLookups, owned ? 1 : 400,
        "only genuine overlay deltas may skip unchanged role facts")
      assert.equal(observed.sourceReads, 0, "unsaved role input comes from live overlay authority")
      assert.ok(observed.leafStats >= 800, "independent physical input and final proofs remain")
      const hover = await f.session.request("textDocument/hover", { textDocument: { uri },
        position: positionAt(text, text.indexOf("value350") + 1) })
      assert.equal(hover.error, undefined, JSON.stringify(hover))
      assert.match(JSON.stringify(hover.result), version === 2 ? /value350: number/ : /value350: 350/)
    }
    f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri } } })
    const closed = await query()
    assert.equal(closed.roleTokenLookups, owned ? 2 : 401, "close restores the changed fact through a guarded disk read")
    f.session.openDocument({ uri, version: 1, text: original })
    assert.equal((await query()).roleTokenLookups, owned ? 1 : 400, "same-number reopen is a new overlay lifecycle")
    assert.equal(fs.readFileSync(path.join(sourceRoot, "Unused350.ts"), "utf8"), original)
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

for (const stableDirectoryIds of [true, false])
for (const sourceKind of ["disk", "open"]) test(`complete SDK groups observe an unnotified same-size same-mtime new global (${sourceKind}, stableDirs=${stableDirectoryIds})`,
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      ARKTS_TEST_WEAK_DIRECTORY_IDS: stableDirectoryIds ? "0" : "1",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/partial-initialization-observation.cjs"))}` })
    const profilePath = path.join(f.workspace, "build-profile.json5"), profile = JSON.parse(fs.readFileSync(profilePath, "utf8"))
    profile.app.products[0].compileSdkVersion = 24
    fs.writeFileSync(profilePath, JSON.stringify(profile))
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), `export const value${i} = ${i}\n`)
    const name = "LateUnnotifiedGlobal", source = path.join(sourceRoot, "Unused350.ts")
    const original = "export const inactive = 1; // deliberately long original source identity witness\n"
    fs.writeFileSync(source, original)
    const stamp = new Date(Math.floor(Date.now() / 1000) * 1000 - 10_000)
    fs.utimesSync(source, stamp, stamp)
    const text = main + `\nexport const late = new ${name}()\n`
    fs.writeFileSync(path.join(sourceRoot, "Main.ets"), text)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const terminal = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    assert.equal(terminal.params.report.semanticState, "ready", "exercise complete SDK whole-group path")
    const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(text, text.indexOf(name) + 1) }
    if (sourceKind === "open") f.session.openDocument({ uri: params.textDocument.uri, version: 1, text })
    const before = await f.session.request("textDocument/typeDefinition", params)
    assert.equal(before.error, undefined, JSON.stringify(before)); assert.deepEqual(before.result, [])
    const stat = fs.statSync(source)
    fs.writeFileSync(source, `class ${name} {}\n`.padEnd(Buffer.byteLength(original), " "))
    fs.utimesSync(source, stat.atime, stat.mtime)
    assert.equal(fs.statSync(source).size, stat.size); assert.equal(fs.statSync(source).mtimeMs, stat.mtimeMs)
    const current = await f.session.request("textDocument/typeDefinition", params)
    t.diagnostic(JSON.stringify({ current }))
    const fresh = current.error?.code === -32803 ? await f.session.request("textDocument/typeDefinition", params) : current
    assert.equal(fresh.error, undefined, JSON.stringify(fresh))
    assert.deepEqual(fresh.result, [{ uri: f.uri(`${folder}/Unused350.ts`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 6 + name.length } } }])
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("hot navigation reuses immutable group path metadata without renormalizing every unrelated member",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-projection-count.cjs"))}` })
    for (let i = 96; i < 396; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), "export {}\n")
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    for (let i = 0; i < 2; i++) {
      const response = await f.session.request("textDocument/typeDefinition", {
        textDocument: { uri: f.uri(`${folder}/Main.ets`) },
        position: positionAt(main, main.indexOf("GlobalThing") + 1) })
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
        start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    }
    const rows = fs.readFileSync(path.join(f.directory, "scope-projection-count.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse).filter(row => row.method === "typeDefinitions")
    t.diagnostic(JSON.stringify(rows))
    assert.equal(rows.length, 2)
    assert.equal(rows[1].memberNormalizations, 0,
      "unchanged group projection must consume immutable lexical metadata; physical input fences remain independent")
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })
