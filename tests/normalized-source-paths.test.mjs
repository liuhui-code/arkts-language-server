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
