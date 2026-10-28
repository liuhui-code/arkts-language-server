import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { createRequire } from "node:module"
import { buildSync } from "esbuild"
import { buildDocumentStoreDriver } from "./support/build-document-store-driver.mjs"

test("request admission keeps nested failures and isolates concurrent commands before releasing their proofs", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resolution-admission-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const output = path.join(directory, "admission.cjs")
  buildSync({ entryPoints: ["src/project/resolution-input-admission.ts"], outfile: output,
    bundle: true, platform: "node", format: "cjs", target: "node20" })
  const { withResolutionInputAdmission: run, noteResolutionInputRebase: note,
    resolutionInputWasRebased: changed } = createRequire(import.meta.url)(output)
  const a = {}, b = {}
  await run(async () => {
    note(a)
    await run(() => { assert.equal(changed(a), true); note(b) })
    assert.equal(changed(b), true)
  })
  assert.equal(changed(a), false)
  await Promise.all([run(async () => { note(a); await new Promise(resolve => setImmediate(resolve));
    assert.equal(changed(a), true); assert.equal(changed(b), false) }),
  run(async () => { note(b); await new Promise(resolve => setImmediate(resolve));
    assert.equal(changed(b), true); assert.equal(changed(a), false) })])
  await assert.rejects(run(async () => { note(a); throw Error("failure") }), /failure/)
  await run(() => assert.equal(changed(a), false))
})

for (const timing of ["before", "after"]) test(`a scoped reset cannot erase an unrelated original manifest proof changed ${timing} that event`, t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resolution-domain-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const { SemanticDocumentStore } = buildDocumentStoreDriver(directory)
  const roots = ["a", "b"].map(name => path.join(directory, name))
  for (const root of roots) {
    fs.mkdirSync(root)
    fs.writeFileSync(path.join(root, "Main.ets"), 'import { Target } from "named"\nexport const value = new Target()\n')
    for (const name of ["one", "two"]) {
      fs.mkdirSync(path.join(root, name))
      fs.writeFileSync(path.join(root, name, "oh-package.json5"), "{main:'Index.ets'}")
      fs.writeFileSync(path.join(root, name, "Index.ets"), "export class Target {}\n")
    }
    fs.writeFileSync(path.join(root, "oh-package.json5"), "{dependencies:{named:'file:./one'}}")
  }
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose())
  const prepare = root => store.prepare({ path: path.join(root, "Main.ets"), workspaceRoot: root, line: 2, column: 29 })
  prepare(roots[0]); prepare(roots[1])
  assert.equal(prepare(roots[1]).state.dependencyClosureCacheHit, true)
  const edit = () => fs.writeFileSync(path.join(roots[1], "oh-package.json5"), "{dependencies:{named:'file:./two'}}")
  if (timing === "before") edit()
  store.workspaceFilesChanged({ rootPath: roots[0], rootDirty: true, changes: [] })
  if (timing === "after") edit()
  const current = prepare(roots[1])
  const paths = current.documents.map(document => document.path)
  assert.ok(paths.includes(path.join(roots[1], "two/Index.ets")))
  assert.ok(!paths.includes(path.join(roots[1], "one/Index.ets")))
  assert.equal(current.state.dependencyClosureCacheHit, false)
})
