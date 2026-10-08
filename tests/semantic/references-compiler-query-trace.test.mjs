import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("compiler reference query lifecycle is observable before its LSP response only when traced", async t => {
  const traced = await replay(t, true)
  const plain = await replay(t, false)
  assert.deepEqual(plain.references, traced.references)
  assert.deepEqual(plain.diagnostics, traced.diagnostics)
  assert.ok(traced.diagnostics.some(diagnostic => diagnostic.code === 2322),
    "normal automatic type diagnostics must still be published")

  const queue = traced.events.filter(entry => entry.event === "references.queue.start")
  const starts = traced.events.filter(entry => entry.event === "references.compiler-query.start")
  const completes = traced.events.filter(entry => entry.event === "references.compiler-query.complete")
  const findStarts = traced.events.filter(entry => entry.event === "references.find-references.start")
  const findCompletes = traced.events.filter(entry => entry.event === "references.find-references.complete")
  assert.equal(queue.length, 1)
  assert.equal(starts.length, 1)
  assert.equal(completes.length, 1)
  assert.equal(findStarts.length, 1, "the TypeScript findReferences call must have its own entry event")
  assert.equal(findCompletes.length, 1, "the TypeScript findReferences call must have its own exit event")
  assert.equal(starts[0].traceId, queue[0].traceId)
  assert.equal(completes[0].traceId, queue[0].traceId)
  assert.equal(findStarts[0].traceId, queue[0].traceId)
  assert.equal(findCompletes[0].traceId, queue[0].traceId)
  assert.equal(findStarts[0].callIndex, 1)
  assert.equal(findCompletes[0].callIndex, 1)
  assert.ok(Number.isFinite(findCompletes[0].elapsedMs) && findCompletes[0].elapsedMs >= 0)
  assert.ok(Number.isFinite(completes[0].elapsedMs) && completes[0].elapsedMs >= 0)
  assert.ok(traced.events.indexOf(starts[0]) < traced.events.indexOf(completes[0]))
  assert.ok(traced.events.indexOf(starts[0]) < traced.events.indexOf(findStarts[0]))
  assert.ok(traced.events.indexOf(findStarts[0]) < traced.events.indexOf(findCompletes[0]))
  assert.ok(traced.events.indexOf(findCompletes[0]) < traced.events.indexOf(completes[0]))
  assert.deepEqual(traced.events.filter(entry => entry.event === "references.find-references.throw"), [])
  for (const entry of [starts[0], completes[0], findStarts[0], findCompletes[0]]) {
    assert.equal(JSON.stringify(entry).includes(traced.root), false,
      "compiler lifecycle events must not log workspace paths")
    assert.ok(!Object.keys(entry).some(key => /^(uri|path|source|text)$/i.test(key)),
      "compiler lifecycle events must not log source content or paths")
  }
  assert.deepEqual(plain.events.filter(entry => entry.event.startsWith("references.compiler-query.")), [],
    "compiler lifecycle observations are disabled by default")
  assert.deepEqual(plain.events.filter(entry => entry.event.startsWith("references.find-references.")), [],
    "TypeScript call observations are disabled by default")
})

async function replay(t, trace) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-compiler-query-trace-"))
  const workspace = path.join(root, "workspace")
  const logs = path.join(root, "logs")
  fs.mkdirSync(workspace)
  const target = "export class TargetThing {}\n"
  const query = 'import { TargetThing } from "./Target"\n'
    + 'export const selected = new TargetThing()\nconst broken: number = "wrong"\n'
  const uses = Array.from({ length: 160 }, (_, index) => ({
    name: `Use${index}.ets`,
    source: `import { TargetThing } from "./Target"\nexport const use${index} = new TargetThing()\n`,
  }))
  fs.writeFileSync(path.join(workspace, "Target.ets"), target)
  fs.writeFileSync(path.join(workspace, "Query.ets"), query)
  for (const { name, source } of uses) fs.writeFileSync(path.join(workspace, name), source)
  const uri = name => pathToFileURL(path.join(workspace, name)).href
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_LSP_LOG_DIR: logs,
      ARKTS_REFERENCES_STRATEGY: "legacy",
      ARKTS_REFERENCES_TRACE: trace ? "1" : "0",
    },
  })
  t.after(async () => {
    await session.close().catch(() => {})
    fs.rmSync(root, { recursive: true, force: true })
  })
  await session.initialize({ timeoutMs: 10_000 })
  const published = session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === uri("Query.ets") && message.params.version === 1, 30_000)
  session.openDocument({ uri: uri("Query.ets"), version: 1, text: query })
  const diagnostics = (await published).params.diagnostics.map(({ code, range, severity }) => (
    { code, range, severity }
  ))
  let settled = false
  const responsePromise = session.request("textDocument/references", {
    textDocument: { uri: uri("Query.ets") },
    position: positionAt(query, query.lastIndexOf("TargetThing") + 1),
    context: { includeDeclaration: true },
  }, { timeoutMs: 30_000 })
  void responsePromise.then(() => { settled = true }, () => { settled = true })
  if (trace) {
    await waitForEvent(logs, "references.compiler-query.start", 30_000)
    assert.equal(settled, false, "the start event must reach the main-process log during the query")
  }
  const response = await responsePromise
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const normalize = location => ({
    name: path.basename(new URL(location.uri).pathname), range: location.range,
  })
  const expected = [{ name: "Target.ets", range: rangeAt(target, target.indexOf("TargetThing")) }]
  for (const { name, source } of [{ name: "Query.ets", source: query }, ...uses]) {
    for (const offset of [source.indexOf("TargetThing"), source.lastIndexOf("TargetThing")]) {
      expected.push({ name, range: rangeAt(source, offset) })
    }
  }
  const references = response.result.map(normalize).sort(byLocation)
  assert.deepEqual(references, expected.sort(byLocation))
  const closed = await session.close({ timeoutMs: 5_000 })
  assert.deepEqual(closed.exit, { code: 0, signal: null })
  return { root, references, diagnostics, events: readEvents(logs) }
}

function readEvents(directory) {
  const file = path.join(directory, "server.log")
  return fs.existsSync(file)
    ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse) : []
}

async function waitForEvent(directory, event, timeoutMs) {
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    if (readEvents(directory).some(entry => entry.event === event)) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`timed out waiting for ${event}`)
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  return { line: prefix.split("\n").length - 1,
    character: offset - prefix.lastIndexOf("\n") - 1 }
}

function rangeAt(source, offset) {
  return { start: positionAt(source, offset), end: positionAt(source, offset + "TargetThing".length) }
}

function byLocation(a, b) {
  return JSON.stringify(a).localeCompare(JSON.stringify(b))
}
