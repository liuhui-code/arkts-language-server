import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { createRequire } from "node:module"
import { buildSync } from "esbuild"
import { projectRoot } from "./support/lsp-process.mjs"

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-path-normalization-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const outfile = path.join(root, "entry.cjs")
  buildSync({ entryPoints: [path.join(projectRoot, "src/project/normalized-source-paths.ts")],
    outfile, bundle: true, platform: "node", format: "cjs", target: "node20" })
  return createRequire(import.meta.url)(outfile).normalizedSourcePaths
}

test("immutable path lists reuse only normalized metadata, preserving spelling and exact path semantics", t => {
  const normalize = fixture(t)
  const input = Object.freeze(["./Alpha.ts", "./sub/../Alpha.ts", "./alpha.ts", "../Outer.ts"])
  const expected = [...new Set(input.map(file => path.resolve(file)))].sort()
  const first = normalize(input)
  assert.deepEqual(first, expected)
  assert.equal(normalize(input), first, "one immutable list need not normalize/sort all members again")
  assert.ok(Object.isFrozen(first))
  assert.equal(normalize(first), first, "normalization output is already immutable normalized metadata")
  assert.throws(() => first.push("injected"), TypeError)
  assert.equal(input.length, 4)
  const next = normalize(Object.freeze([...input, "./Later.ts"]))
  assert.notEqual(next, first)
  assert.deepEqual(next, [...new Set([...expected, path.resolve("./Later.ts")])].sort())
})

test("mutable path arrays never retain a normalization answer across edits or reordering", t => {
  const normalize = fixture(t), input = ["./A.ts", "./B.ts"]
  const first = normalize(input)
  input[0] = "./C.ts"
  input.push("./C.ts")
  assert.deepEqual(normalize(input), [path.resolve("./B.ts"), path.resolve("./C.ts")].sort())
  assert.deepEqual(first, [path.resolve("./A.ts"), path.resolve("./B.ts")].sort())
  input.splice(0, input.length)
  assert.deepEqual(normalize(input), [])
})


function scopeIdentity(file) {
  const resolved = path.resolve(file)
  return process.platform === "win32" ? resolved.replace(/^[A-Z](?=:)/, letter => letter.toLowerCase()) : resolved
}

function metadataFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-scope-paths-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const outfile = path.join(root, "entry.cjs")
  buildSync({ entryPoints: [path.join(projectRoot, "src/core/types/scope-path-metadata.ts")],
    outfile, bundle: true, platform: "node", format: "cjs", target: "node20" })
  return createRequire(import.meta.url)(outfile).scopePathMetadata
}

test("scope metadata preserves every spelling and duplicate while root lookup retains its last spelling", t => {
  const metadata = metadataFixture(t)
  const a = path.resolve("Alpha.ts"), alias = path.dirname(a) + path.sep + "sub" + path.sep + ".." + path.sep + "Alpha.ts"
  const input = Object.freeze([a, alias, a, path.resolve("alpha.ts")])
  const first = metadata(input)
  assert.deepEqual(first.entries, input.map(file => [scopeIdentity(file), file]))
  assert.equal(first.byIdentity.get(scopeIdentity(a)), a)
  assert.equal(first.entries.length, input.length, "native omission checks must visit duplicate spellings independently")
  assert.equal(metadata(input), first)
  assert.ok(Object.isFrozen(first.entries) && first.entries.every(Object.isFrozen))
  const next = metadata(Object.freeze([...input, path.resolve("Later.ts")]))
  assert.notEqual(next, first)
  assert.equal(next.byIdentity.size, first.byIdentity.size + 1)
})

test("mutable scope members and frozen relative paths never inherit an earlier lexical lookup", t => {
  const metadata = metadataFixture(t), input = [path.resolve("A.ts"), path.resolve("B.ts")]
  const first = metadata(input)
  input[0] = path.resolve("C.ts")
  const changed = metadata(input)
  assert.equal(changed.byIdentity.has(scopeIdentity("A.ts")), false)
  assert.equal(changed.byIdentity.has(scopeIdentity("C.ts")), true)
  assert.equal(first.byIdentity.has(scopeIdentity("A.ts")), true)
  input.reverse()
  assert.deepEqual(metadata(input).entries.map(([, file]) => file), input)
  const relative = Object.freeze(["./A.ts"])
  assert.notEqual(metadata(relative), metadata(relative), "relative spellings depend on current cwd")
})
