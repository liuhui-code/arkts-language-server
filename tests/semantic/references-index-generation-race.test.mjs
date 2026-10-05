import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("a newer watched edit cannot recover references from an older committed catalog", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-generation-race-"))
  const workspace = path.join(root, "workspace")
  const logDirectory = path.join(root, "logs")
  const auditPath = path.join(root, "index-audit.ndjson")
  fs.mkdirSync(workspace)
  const targetPath = path.join(workspace, "Target.ets")
  const target = "export class Thing {}\n"
  const query = 'import { Thing } from "./Target"\nexport const query = new Thing()\n'
  const use = 'import { Thing } from "./Target"\nexport const use = new Thing()\n'
  fs.writeFileSync(targetPath, target)
  fs.writeFileSync(path.join(workspace, "Query.ets"), query)
  fs.writeFileSync(path.join(workspace, "Use.ets"), use)
  const queryUri = pathToFileURL(path.join(workspace, "Query.ets")).href
  const targetUri = pathToFileURL(targetPath).href
  const position = { line: 1, character: query.split("\n")[1].indexOf("Thing") + 1 }
  const nativeSidecar = process.env.ARKTS_INDEX_RACE_REAL_SIDECAR
  const nativeGatePath = path.join(root, "activate-generation-3.release")
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_INDEX_SIDECAR_PATH: nativeSidecar || path.join(projectRoot,
        "tests/fixtures/index/scripted-catalog-sidecar.mjs"),
      ...(nativeSidecar ? {
        ARKTS_INDEX_TEST_ACTIVATION_GATE_GENERATION: "3",
        ARKTS_INDEX_TEST_ACTIVATION_GATE_FILE: nativeGatePath,
      } : {
        ARKTS_INDEX_TEST_AUDIT: auditPath,
        ARKTS_INDEX_TEST_SCENARIO: "reference-generation-race",
      }),
      ARKTS_INDEX_CATALOG_TRACE: "1",
      ARKTS_LSP_LOG_DIR: logDirectory,
      ARKTS_REFERENCES_STRATEGY: "indexed-batched",
      ARKTS_REFERENCES_TRACE: "1",
    },
    capabilities: {
      window: { workDoneProgress: true },
      textDocument: { publishDiagnostics: { versionSupport: true } },
    },
  })
  t.after(async () => {
    try {
      if (nativeSidecar) fs.writeFileSync(nativeGatePath, "ready\n")
      await session.close().catch(() => {})
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
  await session.initialize({ timeoutMs: 20_000 })
  const create = await session.transport.serverRequest(
    "window/workDoneProgress/create", () => true, 20_000)
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  await session.transport.progress(create.params.token,
    message => message.params.value.kind === "end", 20_000)
  const diagnostic = session.transport.notification("textDocument/publishDiagnostics",
    message => message.params?.uri === queryUri && message.params?.version === 1, 20_000)
  session.openDocument({ uri: queryUri, version: 1, text: query })
  assert.ok(Array.isArray((await diagnostic).params.diagnostics))

  const references = async includeDeclaration => {
    const response = await session.request("textDocument/references", {
      textDocument: { uri: queryUri }, position, context: { includeDeclaration },
    }, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    return sortedLocations(response.result)
  }
  const initialWithDeclaration = await references(true)
  const initialWithoutDeclaration = await references(false)
  assert.ok(initialWithoutDeclaration.some(location => location.uri.endsWith("/Use.ets")))
  assert.ok(initialWithDeclaration.some(location => location.uri === targetUri))
  await waitUntil(() => events(logDirectory).some(event => event.event === "references.index.accepted"))

  const change = text => {
    fs.writeFileSync(targetPath, text)
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: targetUri, type: 2 }] } })
  }
  change(`// first edit\n${target}`)
  await waitUntil(() => events(logDirectory).some(event => event.event === "index.catalog.phase"
    && event.phase === "activating" && event.buildingGeneration === 2
    && event.committedGeneration === 1), 20_000)
  change(`// second edit\n// first edit\n${target}`)
  const definition = await session.request("textDocument/definition", {
    textDocument: { uri: queryUri }, position,
  }, { timeoutMs: 20_000 })
  assert.equal(definition.error, undefined, JSON.stringify(definition.error))
  assert.deepEqual(definition.result, [{ uri: targetUri, range: {
    start: { line: 2, character: 13 }, end: { line: 2, character: 18 },
  } }])
  if (!nativeSidecar) fs.writeFileSync(`${auditPath}.release-2`, "ready\n")
  await waitUntil(() => {
    const observed = events(logDirectory)
    return observed.some(event => event.event === "index.catalog.phase"
      && event.phase === "ready" && event.committedGeneration === 2)
      && observed.some(event => event.event === "index.catalog.phase"
        && event.phase === "activating" && event.buildingGeneration === 3
        && event.committedGeneration === 2)
  }, 20_000)
  if (nativeSidecar) {
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(events(logDirectory).some(event => event.event === "index.catalog.phase"
      && event.phase === "ready" && event.committedGeneration === 3), false,
    "generation 3 must remain behind the native activation gate")
  }

  const candidateCount = nativeSidecar ? null : audits(auditPath, "references/candidates").length
  const beforeMiddle = events(logDirectory).length
  const middle = await references(true)
  assert.deepEqual(middle, shiftTargetLocations(initialWithDeclaration, targetUri, 2),
    "fallback must keep the complete shifted Location set")
  const middleEvents = events(logDirectory).slice(beforeMiddle)
  assert.ok(middleEvents.some(event => event.event === "references.index.fallback"
    && event.reason === "workspace-changed"),
  `older generation must not recover the second edit: ${JSON.stringify(middleEvents.filter(
    event => event.event.startsWith("references.index.")))}`)
  assert.equal(middleEvents.some(event => event.event === "references.index.recovered"), false)
  assert.equal(middleEvents.some(event => event.event === "references.index.accepted"), false,
    "generation 2 candidates must not be admitted for the second edit")
  if (!nativeSidecar) assert.equal(audits(auditPath, "references/candidates").length,
    candidateCount, "no candidate lookup may use generation 2")

  fs.writeFileSync(nativeSidecar ? nativeGatePath : `${auditPath}.release-3`, "ready\n")
  await waitUntil(() => events(logDirectory).some(event => event.event === "index.catalog.phase"
    && event.phase === "ready" && event.committedGeneration === 3), 20_000)
  const beforeRecovery = events(logDirectory).length
  const recovered = await references(false)
  assert.deepEqual(recovered, initialWithoutDeclaration)
  const recoveryEvents = events(logDirectory).slice(beforeRecovery)
  assert.ok(recoveryEvents.some(event => event.event === "references.index.recovered"
    && event.committedGeneration === 3))
  assert.ok(recoveryEvents.some(event => event.event === "references.index.accepted"))
  await session.close({ timeoutMs: 5_000 })
})

function events(directory) {
  const file = path.join(directory, "server.log")
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse)
}

function audits(file, method) {
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse)
    .filter(request => request.method === method)
}

async function waitUntil(predicate, timeoutMs = 5_000) {
  const deadline = performance.now() + timeoutMs
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error("timed out waiting for catalog generation")
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

function sortedLocations(locations) {
  return [...locations].sort((left, right) => (
    left.uri.localeCompare(right.uri)
      || left.range.start.line - right.range.start.line
      || left.range.start.character - right.range.start.character
      || left.range.end.line - right.range.end.line
      || left.range.end.character - right.range.end.character
  ))
}

function shiftTargetLocations(locations, targetUri, lines) {
  return locations.map(location => location.uri === targetUri ? {
    ...location, range: {
      start: { ...location.range.start, line: location.range.start.line + lines },
      end: { ...location.range.end, line: location.range.end.line + lines },
    },
  } : location)
}
