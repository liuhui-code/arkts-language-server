import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createSdkPartialScopeFixture } from "../support/sdk-partial-scope-lsp.mjs"
import { initializeReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

test("local value navigation edits and repeats without inspecting unrelated project sources",
  { timeout: 30000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/source-navigation-guard-audit.cjs"))}`,
  })
  const original = "// 🧪 UTF-16\nexport function run() { let local = 1; return local + local }\n"
  fs.writeFileSync(path.join(sourceRoot, "Main.ets"), original)
  await initializeReadinessFixture(f, 100)
  const uri = f.uri(`${folder}/Main.ets`)
  f.session.openDocument({ uri, version: 1, text: original })
  const marker = path.join(f.directory, "source-reference-audit-on")
  fs.writeFileSync(marker, "only actual navigation jobs")
  let version = 1
  for (const text of [original, original, original.replace("local + local", "local + local + local"), original]) {
    if (version > 1) f.session.changeDocument({ uri, version, text })
    const response = await f.session.request("textDocument/definition", { textDocument: { uri },
      position: positionAt(text, text.lastIndexOf("local") + (version % 2 ? 1 : 5)) })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [{ uri, range: {
      start: positionAt(text, text.indexOf("local")), end: positionAt(text, text.indexOf("local") + 5),
    } }])
    version++
  }
  fs.unlinkSync(marker)
  const file = path.join(f.directory, "source-reference-guards.ndjson")
  const guards = fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean) : []
  t.diagnostic(JSON.stringify({ unrelatedGuards: guards.length }))
  assert.equal(guards.length, 0, "a proven lexical navigation must not visit unrelated project members")
  assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})


test("bounded value navigation equals the same-input full compiler and refuses signature-sensitive contexts",
  { timeout: 60000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/source-navigation-oracle.cjs"))}`,
  })
  const dependency = "export function make(...args: any[]) { return 1 }\nexport function tag(...args: any[]) { return 1 }\nexport class Box { method() {return 1} }\n"
  fs.writeFileSync(path.join(sourceRoot, "Dep.ets"), dependency)
  await initializeReadinessFixture(f, 101)
  const uri = f.uri(`${folder}/Main.ets`), marker = path.join(f.directory, "full-navigation-oracle")
  const cases = [
    ["binary read", "let local=1; return local+local", true],
    ["return", "let local=make; return local", true],
    ["void", "let local=1; void local", true],
    ["typeof", "let local=1; return typeof local", true],
    ["await", "let local=make; return await local", true],
    ["parenthesized value", "let local=make; return (local)", true],
    ["non-null value", "let local=make; return local!", true],
    ["cast value", "let local=make; return local as unknown", true],
    ["concise closure", "let local=1; return () => local", true],
    ["conditional", "let local=1; return true ? local : 0", true],
    ["array value", "let local=1; return [local]", true],
    ["spread value", "let local=[1]; return [...local]", true],
    ["template value", "let local=1; return `value ${local}`", true],
    ["wrapped call", "let local=make; return (local)()", false],
    ["asserted call", "let local=make; return (local as any)()", false],
    ["non-null call", "let local=make; return local!()", false],
    ["receiver", "let local=new Box(); return local.method()", true],
    ["element receiver", "let local=[1]; return local[0]", true],
    ["argument", "let local=1; return make(local)", true],
    ["assignment", "let local=1; local=2", true],
    ["prefix", "let local=1; return ++local", true],
    ["postfix", "let local=1; return local++", true],
    ["capture", "let local=1; return () => {return local}", true],
    ["shadowed block", "let local=1; {let local=2; void local} return local", true],
    ["call", "let local=make; return local()", false],
    ["tag", "let local=tag; return local`x`", false],
    ["constructor", "let local=Box; return new local()", false],
    ["shorthand", "let local=1; return {local}", false],
    ["computed key", "let local='x'; return {[local]:1}", false],
    ["type query", "let local=Box; let x: typeof local", false],
    ["destructure", "let {local}={local:1}; return local", false],
    ["eval", "let local=1; eval('local'); return local", false],
  ]
  let version = 0
  for (const [name, body, qualified] of cases) {
    const text = `import {make,tag,Box} from './Dep'\nexport function run(){${body}}\n`
    if (!version) f.session.openDocument({ uri, version: ++version, text })
    else f.session.changeDocument({ uri, version: ++version, text })
    const params = { textDocument: { uri }, position: positionAt(text, text.lastIndexOf("local") + 1) }
    fs.writeFileSync(marker, "same-input full project compiler oracle")
    const full = await f.session.request("textDocument/definition", params)
    fs.unlinkSync(marker)
    const before = f.events().filter(row => row.event === "navigation.source-owner.complete").length
    const current = await f.session.request("textDocument/definition", params)
    assert.equal(full.error, undefined, name + JSON.stringify(full))
    assert.equal(current.error, undefined, name + JSON.stringify(current))
    assert.ok(full.result.length, name + " must have actual compiler targets")
    assert.deepEqual(current.result, full.result, name)
    assert.equal(f.events().filter(row => row.event === "navigation.source-owner.complete").length - before,
      Number(qualified), name + " must respect the declared profile")
    if (["call", "tag"].includes(name)) assert.equal(current.result.length, 2,
      name + " must retain the external signature as well as the local declaration")
  }
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})
