import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createSdkPartialScopeFixture } from "../support/sdk-partial-scope-lsp.mjs"
import { initializeReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

const sorted = values => values.map(value => JSON.stringify(value)).sort()
const span = (text, offset, length) => ({ start: positionAt(text, offset), end: positionAt(text, offset + length) })

test("a qualified Native source-set change also survives references admission",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
      ARKTS_REFERENCES_TRACE: "1",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/current-index-qualification.cjs"))}` })
    for (const name of fs.readdirSync(sourceRoot)) fs.unlinkSync(path.join(sourceRoot, name))
    const main = 'import { Target } from "./Target"\nexport const view = new Target()\n'
    const target = "export class Target { member: number = 1 }\n"
    fs.writeFileSync(path.join(sourceRoot, "Main.ets"), main)
    fs.writeFileSync(path.join(sourceRoot, "Target.ts"), target)
    for (let i = 0; i < 126; i++) fs.writeFileSync(path.join(sourceRoot, `Noise${i}.ts`), `export const noise${i} = 0\n`)
    await initializeReadinessFixture(f, 128)
    const mainUri = f.uri(`${folder}/Main.ets`), targetUri = f.uri(`${folder}/Target.ts`)
    const params = { textDocument: { uri: mainUri }, position: positionAt(main, main.lastIndexOf("Target") + 1),
      context: { includeDeclaration: true } }
    const expected = [{ uri: mainUri, range: span(main, main.indexOf("Target"), 6) },
      { uri: mainUri, range: span(main, main.lastIndexOf("Target"), 6) },
      { uri: targetUri, range: span(target, target.indexOf("Target"), 6) }]
    const first = await f.session.request("textDocument/references", params)
    assert.equal(first.error, undefined, JSON.stringify(first))
    assert.deepEqual(sorted(first.result), sorted(expected))
    const baseline = JSON.parse(fs.readFileSync(path.join(f.directory, "latest-current-index.json"), "utf8"))
    fs.writeFileSync(path.join(f.directory, "arm-current-index.json"), JSON.stringify(baseline.input))
    const edited = main + "export const second = new Target()\n"
    fs.writeFileSync(path.join(sourceRoot, "Main.ets"), edited)
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: mainUri, type: 2 }] } })
    const deadline = Date.now() + 5_000, marker = path.join(f.directory, "edited-index-qualified.json")
    while (!fs.existsSync(marker)) {
      assert.ok(Date.now() < deadline, "actual edited Native qualification must complete before the query")
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    const qualification = JSON.parse(fs.readFileSync(marker, "utf8"))
    assert.match(qualification.fingerprint, /^arkts-complete-scan-v2:/)
    const response = await f.session.request("textDocument/references", params)
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(sorted(response.result), sorted([...expected,
      { uri: mainUri, range: span(edited, edited.lastIndexOf("Target"), 6) }]))
    const file = path.join(f.directory, "current-index-reconcile.jsonl")
    const reconciles = fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").map(JSON.parse) : []
    t.diagnostic(JSON.stringify({ qualification, reconciles }))
    assert.deepEqual(reconciles, [], "already current qualified bytes must not trigger another input epoch and full candidate fallback")

    const latest = JSON.parse(fs.readFileSync(path.join(f.directory, "latest-current-index.json"), "utf8"))
    fs.writeFileSync(path.join(f.directory, "arm-current-index.json"), JSON.stringify(latest.input))
    fs.unlinkSync(marker)
    const use = 'import { Target } from "./Target"\nexport const additional = new Target()\n'
    const useUri = f.uri(`${folder}/NewUse.ts`)
    fs.writeFileSync(path.join(sourceRoot, "NewUse.ts"), use)
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: useUri, type: 1 }] } })
    const createDeadline = Date.now() + 5_000
    while (!fs.existsSync(marker)) {
      assert.ok(Date.now() < createDeadline, "actual new-source Native qualification must complete")
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    const created = await f.session.request("textDocument/references", params)
    assert.equal(created.error, undefined, JSON.stringify(created))
    assert.deepEqual(sorted(created.result), sorted([...expected,
      { uri: mainUri, range: span(edited, edited.lastIndexOf("Target"), 6) },
      { uri: useUri, range: span(use, use.indexOf("Target"), 6) },
      { uri: useUri, range: span(use, use.lastIndexOf("Target"), 6) }]))
    const afterCreate = fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").map(JSON.parse) : []
    t.diagnostic(JSON.stringify({ phase: "source-created", afterCreate }))
    assert.deepEqual(afterCreate, [], "an exact qualified current source set must not be revoked merely because membership changed")

    const withMainEdit = [...expected, { uri: mainUri, range: span(edited, edited.lastIndexOf("Target"), 6) }]
    const useLocations = uri => [{ uri, range: span(use, use.indexOf("Target"), 6) },
      { uri, range: span(use, use.lastIndexOf("Target"), 6) }]
    const mutateQualified = async (phase, mutate, changes, additions) => {
      const before = JSON.parse(fs.readFileSync(path.join(f.directory, "latest-current-index.json"), "utf8"))
      fs.writeFileSync(path.join(f.directory, "arm-current-index.json"), JSON.stringify(before.input))
      fs.unlinkSync(marker)
      mutate()
      f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: { changes } })
      const until = Date.now() + 5_000
      while (!fs.existsSync(marker)) {
        assert.ok(Date.now() < until, `actual Native ${phase} qualification must finish`)
        await new Promise(resolve => setTimeout(resolve, 5))
      }
      const actual = await f.session.request("textDocument/references", params)
      assert.equal(actual.error, undefined, JSON.stringify({ phase, actual }))
      assert.deepEqual(sorted(actual.result), sorted([...withMainEdit, ...additions]), phase)
      const rebuilds = fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").map(JSON.parse) : []
      t.diagnostic(JSON.stringify({ phase, locations: actual.result.length, rebuilds }))
      assert.deepEqual(rebuilds, [], `${phase}: current complete source identity must survive admission`)
    }
    const movedUri = f.uri(`${folder}/MovedUse.ts`)
    await mutateQualified("move", () => fs.renameSync(path.join(sourceRoot, "NewUse.ts"), path.join(sourceRoot, "MovedUse.ts")),
      [{ uri: useUri, type: 3 }, { uri: movedUri, type: 1 }], useLocations(movedUri))
    await mutateQualified("delete", () => fs.unlinkSync(path.join(sourceRoot, "MovedUse.ts")),
      [{ uri: movedUri, type: 3 }], [])
    await mutateQualified("restore", () => fs.writeFileSync(path.join(sourceRoot, "NewUse.ts"), use),
      [{ uri: useUri, type: 1 }], useLocations(useUri))
    await mutateQualified("remove-restored", () => fs.unlinkSync(path.join(sourceRoot, "NewUse.ts")),
      [{ uri: useUri, type: 3 }], [])
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })
