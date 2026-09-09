import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspProcess, projectRoot } from "./support/lsp-process.mjs"

const fixtureRoot = path.join(projectRoot, "fixtures", "basic")

test("production semantics run in one worker and report the bounded resident set", async (t) => {
  const metricsPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "arkts-production-worker-")),
    "memory.jsonl",
  )
  t.after(() => fs.rmSync(path.dirname(metricsPath), { recursive: true, force: true }))
  assert.ok(
    fs.existsSync(path.join(projectRoot, "dist", "semantic-worker.cjs")),
    "pnpm build must emit dist/semantic-worker.cjs",
  )

  const server = new LspProcess({ env: {
    ARKTS_MEMORY_METRICS_FILE: metricsPath,
    ARKTS_MEMORY_BUDGET_MB: "1",
  } })
  t.after(() => server.close())
  const rootUri = pathToFileURL(fixtureRoot).href
  const uri = pathToFileURL(path.join(fixtureRoot, "Profile.ets")).href
  const text = [
    "struct Profile {",
    "  title: string = \"Ada\"",
    "  build(): void {",
    "    this.",
    "  }",
    "}",
  ].join("\n")

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { processId: process.pid, rootUri, capabilities: {} },
  })
  assert.equal((await server.response(1)).error, undefined)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: { textDocument: { uri, languageId: "arkts", version: 1, text } },
  })
  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/completion",
    params: { textDocument: { uri }, position: { line: 3, character: 9 } },
  })

  const response = await server.response(2, 15_000)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const items = Array.isArray(response.result) ? response.result : response.result.items
  assert.ok(items.some((item) => item.label === "title"))

  const changedText = text.replace(
    "  title: string = \"Ada\"",
    "  subtitle: string = \"Grace\"",
  )
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didChange",
    params: {
      textDocument: { uri, version: 2 },
      contentChanges: [{ text: changedText }],
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 4,
    method: "textDocument/completion",
    params: { textDocument: { uri }, position: { line: 3, character: 9 } },
  })
  const rebuilt = await server.response(4, 15_000)
  assert.equal(rebuilt.error, undefined, JSON.stringify(rebuilt.error))
  const rebuiltItems = Array.isArray(rebuilt.result) ? rebuilt.result : rebuilt.result.items
  assert.ok(rebuiltItems.some((item) => item.label === "subtitle"))
  assert.equal(rebuiltItems.some((item) => item.label === "title"), false)

  server.send({ jsonrpc: "2.0", id: 3, method: "shutdown", params: null })
  assert.equal((await server.response(3, 10_000)).error, undefined)
  server.send({ jsonrpc: "2.0", method: "exit", params: null })
  await server.close()

  const metrics = fs.readFileSync(metricsPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  assert.ok(metrics.length > 0)
  assert.ok(metrics.every((sample) => sample.semanticWorkerCount === 1))
  assert.ok(metrics.every((sample) => sample.residentContextCount <= 2))
  assert.ok(metrics.some((sample) => sample.openDocuments === 1))
})
