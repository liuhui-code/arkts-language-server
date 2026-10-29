import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { LspProcess } from "./support/lsp-process.mjs"
import { runNodeTestLayer } from "../scripts/run-node-test-layer.mjs"

test("a standalone LSP test owns a private index cache and removes it after child exit", async () => {
  const source = `
    const fs = require("node:fs")
    const cache = process.env.ARKTS_INDEX_CACHE_DIR
    if (cache) fs.mkdirSync(cache, { recursive: true })
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { cache } })
    process.stdout.write("Content-Length: " + Buffer.byteLength(body) + "\\r\\n\\r\\n" + body)
    process.stdin.resume()
  `
  const lsp = new LspProcess({ args: ["-e", source] })
  let cache
  try {
    cache = (await lsp.response(1)).result.cache
    assert.ok(cache, "missing private cache lets tests write into the user's production cache")
    assert.match(cache, /arkts-lsp-test-index-/)
    assert.ok((await fs.stat(cache)).isDirectory())
  } finally { await lsp.close() }
  await lsp.indexCacheCleanup
  await assert.rejects(fs.stat(cache), { code: "ENOENT" })
})

test("explicit fixture caches survive abnormal child exit", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-cache-explicit-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const lsp = new LspProcess({ args: ["-e", "process.exit(17)"],
    env: { ARKTS_INDEX_CACHE_DIR: directory } })
  await assert.rejects(lsp.response(1), /code=17/)
  await lsp.close()
  await lsp.indexCacheCleanup
  assert.equal(lsp.indexCacheDirectory, directory)
  assert.ok((await fs.stat(directory)).isDirectory())
})

test("the test runner isolates direct-spawn descendants and removes their run cache", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-cache-runner-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const resultPath = path.join(directory, "observed.json")
  const entry = path.join(directory, "cache.test.mjs")
  await fs.writeFile(entry, `import fs from "node:fs"; import test from "node:test";
    test("records actual cache", () => fs.writeFileSync(${JSON.stringify(resultPath)},
      JSON.stringify({ cache: process.env.ARKTS_INDEX_CACHE_DIR })))`)
  const result = await runNodeTestLayer({ argv: ["--layer", "protocol"],
    manifest: { layers: [{ id: "protocol", entries: [entry] }] },
    spawn(command, args, options) {
      const environment = { ...process.env, ...options.env }
      delete environment.NODE_TEST_CONTEXT
      return spawn(command, args, { ...options, env: environment })
    } })
  assert.equal(result.code, 0)
  const { cache } = JSON.parse(await fs.readFile(resultPath, "utf8"))
  assert.ok(cache, "direct-spawn tests must inherit a runner-owned cache")
  assert.match(cache, /arkts-node-test-runtime-/)
  await assert.rejects(fs.stat(path.dirname(cache)), { code: "ENOENT" })
})
