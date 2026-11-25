import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { buildSync } from "esbuild"

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-role-pool-"))
const bundle = path.join(directory, "pool.cjs")
buildSync({ entryPoints: ["src/core/types/source-role-pool.ts"], bundle: true,
  platform: "node", target: "node20", format: "cjs", outfile: bundle })
const { SourceRolePool } = createRequire(import.meta.url)(bundle)
test.after(() => fs.rmSync(directory, { recursive: true, force: true }))

test("shared syntax is immutable and retired only after its last source fact releases it", () => {
  const pool = new SourceRolePool({}), text = 'export { Local } from "./Local"\n'
  const a = pool.acquire("left/Entry.ts", text), b = pool.acquire("right/Entry.ts", text)
  assert.equal(a.role, b.role)
  assert.deepEqual(a.role.modules, ["./Local"])
  assert.throws(() => a.role.modules.push("./Other"), TypeError)
  assert.throws(() => { a.role.exports.unknown = true }, TypeError)
  pool.release(a.key)
  const c = pool.acquire("third/Entry.ts", text)
  assert.equal(c.role, b.role)
  pool.release(b.key); pool.release(c.key)
  assert.throws(() => pool.release(a.key), /Unpaired/)
  const next = pool.acquire("left/Entry.ts", text)
  assert.notEqual(next.role, a.role, "retired content must be parsed afresh rather than kept as history")
  pool.release(next.key)
})

test("declaration, script kind, filename case, content and profile domains stay separate", () => {
  const pool = new SourceRolePool({}), text = "declare class GlobalRole {}\n"
  const source = pool.acquire("A.ts", text), declaration = pool.acquire("A.d.ts", text)
  assert.equal(source.role.globals.plainDeclaration, false)
  assert.equal(declaration.role.globals.plainDeclaration, true)
  const values = [source, declaration, pool.acquire("A.ets", text), pool.acquire("A.d.ets", text),
    pool.acquire("A.TS", text), pool.acquire("A.js", text), pool.acquire("A.ts", text + "export {}\n")]
  assert.equal(new Set(values.map(value => value.key)).size, values.length)
  const helpers = new SourceRolePool({ importHelpers: true }).acquire("A.ts", text)
  assert.notEqual(helpers.role, source.role)
  assert.equal(helpers.role.opaque, true)
  for (const value of values) pool.release(value.key)
})

test("a stream of replacements does not retain released historical summaries", () => {
  const pool = new SourceRolePool({})
  for (let i = 0; i < 100; i++) {
    const text = `export const value = ${i}\n`
    const first = pool.acquire("A.ts", text)
    pool.release(first.key)
    const second = pool.acquire("B.ts", text)
    assert.notEqual(first.role, second.role)
    pool.release(second.key)
  }
})
