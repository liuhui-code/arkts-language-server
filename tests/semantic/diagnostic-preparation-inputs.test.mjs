import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createSdkPartialScopeFixture } from "../support/sdk-partial-scope-lsp.mjs"

test("background diagnostics hand preparation facts to one independent final input fence",
  { timeout: 40_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-directory-resolution-count.cjs"))}` })
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), `export const noise${i} = ${i}\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const uri = f.uri(`${folder}/Main.ets`)
    const texts = [main + "\nmissingDiagnosticProbe()\n", main, main + "\n// body edit\n"]
    for (let index = 0; index < texts.length; index++) {
      const version = index + 1
      if (index === 0) f.session.openDocument({ uri, version, text: texts[index] })
      else f.session.changeDocument({ uri, version, text: texts[index] })
      const diagnostic = await f.session.transport.notification("textDocument/publishDiagnostics",
        m => m.params.uri === uri && m.params.version === version, 10_000)
      assert.equal(diagnostic.params.diagnostics.some(item => String(item.code) === "2304"
        && item.message.includes("missingDiagnosticProbe")), index === 0,
      "diagnostics must reflect the latest unsaved input and clear repaired errors")
      const rows = fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8")
        .trim().split("\n").map(JSON.parse)
      const observed = rows.filter(row => row.method === "diagnose").at(-1)
      t.diagnostic(JSON.stringify({ version, observed }))
      assert.ok(observed, "observe actual diagnostic Worker commands, not navigation")
      assert.equal(observed.membershipRawPassesByPhase.prepare, 1)
      assert.equal(observed.membershipRawPassesByPhase.final, 1)
      assert.equal(Object.values(observed.membershipRawPassesByPhase).reduce((a, b) => a + b, 0), 2,
        "preparation must share its original facts with the real query, preserving a separate final raw fence")
    }
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

for (const completeSdk of [false, true]) {
  test(`a post-diagnostic final input change cannot publish stale errors and a fresh edit recovers (completeSdk=${completeSdk})`,
    { timeout: 40_000 }, async t => {
      const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
        ARKTS_TEST_MEMBER_RACE_AFTER_DIAG: "1",
        NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/final-member-input-race.cjs"))}` })
      if (completeSdk) {
        const profilePath = path.join(f.workspace, "build-profile.json5")
        const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"))
        profile.app.products[0].compileSdkVersion = 24
        fs.writeFileSync(profilePath, JSON.stringify(profile))
      }
      await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
      const terminal = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
      assert.equal(terminal.params.report.semanticState, completeSdk ? "ready" : "partial")
      const uri = f.uri(`${folder}/Main.ets`), text = main + "\nexport const race = new LateFinalGlobal()\n"
      fs.writeFileSync(path.join(f.directory, "arm-final-member.json"), JSON.stringify({
        kind: "source", stage: "entry", file: path.join(sourceRoot, "Unused80.ts") }))
      f.session.openDocument({ uri, version: 1, text })
      const failure = await f.session.transport.notification("window/logMessage",
        m => m.params.message.includes("ArkTS diagnostics failed"), 10_000)
      const events = fs.readFileSync(path.join(f.directory, "final-member-events.jsonl"), "utf8")
        .trim().split("\n").map(JSON.parse)
      assert.equal(events.filter(row => row.event === "mutated").length, 1, JSON.stringify(events))
      assert.equal(f.session.transport.messages.some(m => m.method === "textDocument/publishDiagnostics"
        && m.params.uri === uri && m.params.version === 1), false,
      "the completed compiler result must be rejected by its later independent raw fence")
      t.diagnostic(JSON.stringify({ completeSdk, failure, events }))
      f.session.changeDocument({ uri, version: 2, text: text + "// fresh input\n" })
      const recovered = await f.session.transport.notification("textDocument/publishDiagnostics",
        m => m.params.uri === uri && m.params.version === 2, 10_000)
      assert.equal(recovered.params.diagnostics.some(item => String(item.code) === "2304"
        && item.message.includes("LateFinalGlobal")), false)
      assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
      assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
    })
}

test("completion details also hand original preparation facts to their actual query lease",
  { timeout: 40_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-directory-resolution-count.cjs"))}` })
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), `export const noise${i} = ${i}\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const uri = f.uri(`${folder}/Main.ets`)
    f.session.openDocument({ uri, version: 1, text: main })
    await f.session.transport.notification("textDocument/publishDiagnostics",
      m => m.params.uri === uri && m.params.version === 1, 10_000)
    const list = await f.session.request("textDocument/completion", {
      textDocument: { uri }, position: { line: 1, character: main.split("\n")[1].indexOf("GlobalThing") + 3 } })
    assert.equal(list.error, undefined, JSON.stringify(list))
    const item = list.result.items.find(candidate => candidate.label === "GlobalThing")
    assert.ok(item?.data, JSON.stringify(list))
    for (let i = 0; i < 2; i++) {
      const response = await f.session.request("completionItem/resolve", item)
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.match(response.result.detail, /GlobalThing/)
      const observed = fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8")
        .trim().split("\n").map(JSON.parse).filter(row => row.method === "resolveCompletion").at(-1)
      t.diagnostic(JSON.stringify({ repeat: i, observed }))
      assert.equal(observed.membershipRawPassesByPhase.prepare, 1)
      assert.equal(observed.membershipRawPassesByPhase.final, 1)
      assert.equal(Object.values(observed.membershipRawPassesByPhase).reduce((a, b) => a + b, 0), 2)
    }
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

for (const completeSdk of [false, true]) {
  test(`completion details reject a post-compiler membership change and a fresh list recovers (completeSdk=${completeSdk})`,
    { timeout: 40_000 }, async t => {
      const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
        ARKTS_TEST_MEMBER_RACE_AFTER_RESOLVE: "1",
        NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/final-member-input-race.cjs"))}` })
      if (completeSdk) {
        const file = path.join(f.workspace, "build-profile.json5"), profile = JSON.parse(fs.readFileSync(file, "utf8"))
        profile.app.products[0].compileSdkVersion = 24
        fs.writeFileSync(file, JSON.stringify(profile))
      }
      await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
      await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
      const uri = f.uri(`${folder}/Main.ets`)
      f.session.openDocument({ uri, version: 1, text: main })
      await f.session.transport.notification("textDocument/publishDiagnostics",
        m => m.params.uri === uri && m.params.version === 1, 10_000)
      const list = async () => {
        const response = await f.session.request("textDocument/completion", { textDocument: { uri },
          position: { line: 1, character: main.split("\n")[1].indexOf("GlobalThing") + 3 } })
        assert.equal(response.error, undefined, JSON.stringify(response))
        const item = response.result.items.find(candidate => candidate.label === "GlobalThing")
        assert.ok(item?.data, JSON.stringify(response))
        return item
      }
      const item = await list()
      fs.writeFileSync(path.join(f.directory, "arm-final-member.json"), JSON.stringify({
        kind: "source", stage: "entry", file: path.join(sourceRoot, "Unused80.ts") }))
      const stale = await f.session.request("completionItem/resolve", item)
      assert.equal(stale.error?.code, -32803, JSON.stringify(stale))
      assert.equal(stale.result, undefined)
      const events = fs.readFileSync(path.join(f.directory, "final-member-events.jsonl"), "utf8")
        .trim().split("\n").map(JSON.parse)
      assert.equal(events.filter(row => row.event === "mutated").length, 1, JSON.stringify(events))
      f.session.changeDocument({ uri, version: 2, text: main + "\n// fresh list\n" })
      const fresh = await f.session.request("completionItem/resolve", await list())
      assert.equal(fresh.error, undefined, JSON.stringify(fresh))
      assert.match(fresh.result.detail, /GlobalThing/)
      assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
      assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
    })
}

for (const method of ["hover", "signatureHelp", "documentSymbol", "documentHighlight", "inlayHint"])
test(`${method} hands its original synchronous preparation facts to the query lease`,
  { timeout: 40_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-directory-resolution-count.cjs"))}` })
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), `export const noise${i} = ${i}\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const uri = f.uri(`${folder}/Main.ets`)
    f.session.openDocument({ uri, version: 1, text: main })
    await f.session.transport.notification("textDocument/publishDiagnostics",
      m => m.params.uri === uri && m.params.version === 1, 10_000)
    const params = { textDocument: { uri } }
    if (!["documentSymbol", "inlayHint"].includes(method)) params.position = { line: 1,
      character: main.split("\n")[1].indexOf("GlobalThing") + (method === "signatureHelp" ? "GlobalThing(".length : 1) }
    if (method === "inlayHint") params.range = { start: { line: 0, character: 0 },
      end: { line: main.split("\n").length - 1, character: 0 } }
    const response = await f.session.request(`textDocument/${method}`, params)
    assert.equal(response.error, undefined, JSON.stringify(response))
    if (method === "documentSymbol") assert.ok(response.result.some(item => item.name === "global"), JSON.stringify(response))
    else if (method === "inlayHint") assert.deepEqual(response.result, [{ position: { line: 2,
      character: main.split("\n")[2].indexOf("augmented") + "augmented".length },
      label: ": number", kind: 1, paddingLeft: true }])
    else if (method === "documentHighlight") assert.ok(response.result.some(item => item.range.start.line === 1
      && item.range.start.character === main.split("\n")[1].indexOf("GlobalThing")
      && item.range.end.character === main.split("\n")[1].indexOf("GlobalThing") + "GlobalThing".length), JSON.stringify(response))
    else assert.match(method === "hover" ? response.result.contents.value : response.result.signatures[0].label, /GlobalThing/)
    const observed = fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse).filter(row => row.method === ({ documentSymbol: "documentSymbols", documentHighlight: "documentHighlights", inlayHint: "inlayHints" }[method] ?? method)).at(-1)
    t.diagnostic(JSON.stringify(observed))
    const passes = Object.values(observed.membershipRawPassesByPhase).reduce((a, b) => a + b, 0)
    if (method === "documentSymbol") {
      assert.equal(passes, 0, "syntax-only symbols must not consume global semantic membership")
      assert.equal(observed.leafStats, 0, "unrelated source identities are not symbol syntax inputs")
    } else {
      assert.equal(observed.membershipRawPassesByPhase.prepare, 1)
      assert.equal(observed.membershipRawPassesByPhase.final, 1)
      assert.equal(passes, 2)
    }
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })
