import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { once } from "node:events"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

const FIXTURE_HEAD = "585feb45114a128a0d2a23947c83faf338e758f7"
const EXPECTED_SOURCE_FILES = 455
const WARM_FIRST_QUERY_BUDGET_MS = 400
const REPEATED_QUERY_P95_BUDGET_MS = 100
const REPEATED_QUERY_SAMPLES = 30
const EXPECTED_DEFINITIONS = {
  TeamRepo: [
    ["chatkit/src/main/ets/repo/TeamRepo.ets", 96],
  ],
  sendMessage: [
    ["chatkit/src/main/ets/repo/ChatRepo.ets", 261],
    ["chatkit_ui/src/main/ets/view/MultiLineInputView.ets", 463],
    ["chatkit_ui/src/main/ets/viewmodel/ChatBaseViewModel.ets", 1044],
    ["chatkit_ui/src/main/ets/viewmodel/ChatBotSubSessionViewModel.ets", 284],
  ],
  BuildProfile: [
    ["chatkit/BuildProfile.ets", 11],
    ["chatkit_ui/BuildProfile.ets", 11],
    ["common/BuildProfile.ets", 11],
    ["contactkit_ui/BuildProfile.ets", 11],
    ["conversationkit_ui/BuildProfile.ets", 11],
    ["corekit/BuildProfile.ets", 11],
    ["teamkit_ui/BuildProfile.ets", 11],
  ],
}

test("the pinned large ArkTS workspace is correct and responsive through the release LSP", async (t) => {
  const fixture = requirePinnedFixture()
  const serverBundle = path.join(projectRoot, "dist", "server.cjs")
  const sidecarBinary = path.join(
    projectRoot,
    "target",
    "release",
    process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar",
  )
  requireReleaseArtifact(serverBundle, "dist/server.cjs")
  requireReleaseArtifact(sidecarBinary, "target/release/arkts-index-sidecar", true)

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-large-workspace-"))
  const cacheDirectory = path.join(temporaryRoot, "index-cache")
  const rootUri = pathToFileURL(fixture).href
  const environment = {
    ARKTS_INDEX_CACHE_DIR: cacheDirectory,
    ARKTS_INDEX_SIDECAR_PATH: sidecarBinary,
    ARKTS_LSP_LOG_DIR: path.join(temporaryRoot, "logs"),
  }
  const servers = []
  t.after(async () => {
    await Promise.allSettled(servers.map((server) => server.close()))
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  })

  const cold = new LspProcess({ serverPath: serverBundle, env: environment })
  servers.push(cold)
  await initializeWorkspace(cold, rootUri, 1)
  const coldCatalogStartedAt = performance.now()
  cold.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  const coldReady = await acknowledgeProgressAndWaitUntilReady(cold)
  const coldCatalogMs = performance.now() - coldCatalogStartedAt
  assertReadyFileCount(coldReady, EXPECTED_SOURCE_FILES)

  const teamRepo = await search(cold, 10, "TeamRepo")
  assertDefinitions(fixture, teamRepo, {
    name: "TeamRepo",
    kind: 5,
    locations: EXPECTED_DEFINITIONS.TeamRepo,
  })
  const sendMessage = await search(cold, 11, "sendMessage")
  assertDefinitions(fixture, sendMessage, {
    name: "sendMessage",
    kind: 6,
    locations: EXPECTED_DEFINITIONS.sendMessage,
  })
  const buildProfile = await search(cold, 12, "BuildProfile")
  assertDefinitions(fixture, buildProfile, {
    name: "BuildProfile",
    kind: 5,
    locations: EXPECTED_DEFINITIONS.BuildProfile,
  })
  await shutdownAndExit(cold, 13)

  const warm = new LspProcess({ serverPath: serverBundle, env: environment })
  servers.push(warm)
  await initializeWorkspace(warm, rootUri, 20)
  warm.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  const warmProgressToken = await acknowledgeProgressAndWaitForCatalogActivity(warm)

  const warmStartedAt = performance.now()
  const warmTeamRepo = await search(warm, 21, "TeamRepo", 2_000)
  const warmFirstQueryMs = performance.now() - warmStartedAt
  assertDefinitions(fixture, warmTeamRepo, {
    name: "TeamRepo",
    kind: 5,
    locations: EXPECTED_DEFINITIONS.TeamRepo,
  })
  assert.ok(
    warmFirstQueryMs < WARM_FIRST_QUERY_BUDGET_MS,
    `warm cached workspace search must finish within ${WARM_FIRST_QUERY_BUDGET_MS}ms; took ${formatMs(warmFirstQueryMs)}ms`,
  )

  const queries = [
    { query: "TeamRepo", count: 1 },
    { query: "sendMessage", count: 4 },
    { query: "BuildProfile", count: 7 },
  ]
  const latencies = []
  for (let sample = 0; sample < REPEATED_QUERY_SAMPLES; sample += 1) {
    const expected = queries[sample % queries.length]
    const startedAt = performance.now()
    const result = await search(warm, 30 + sample, expected.query, 2_000)
    latencies.push(performance.now() - startedAt)
    assert.equal(
      result.filter((item) => item.name === expected.query).length,
      expected.count,
      `${expected.query} exact-definition count changed during warm queries`,
    )
  }
  const repeatedP95Ms = percentile(latencies, 0.95)
  assert.ok(
    repeatedP95Ms < REPEATED_QUERY_P95_BUDGET_MS,
    `warm repeated workspace search P95 must stay below ${REPEATED_QUERY_P95_BUDGET_MS}ms; measured ${formatMs(repeatedP95Ms)}ms`,
  )

  const warmReady = await waitUntilReady(warm, warmProgressToken)
  assertReadyFileCount(warmReady, EXPECTED_SOURCE_FILES)
  await shutdownAndExit(warm, 100)

  t.diagnostic(
    `cold catalog ${formatMs(coldCatalogMs)}ms; warm first query ${formatMs(warmFirstQueryMs)}ms; repeated query P95 ${formatMs(repeatedP95Ms)}ms (${REPEATED_QUERY_SAMPLES} samples)`,
  )
})

function requirePinnedFixture() {
  const configured = process.env.ARKTS_LARGE_FIXTURE
  assert.ok(
    configured,
    `ARKTS_LARGE_FIXTURE is required and must point to fixture HEAD ${FIXTURE_HEAD}`,
  )
  const fixture = path.resolve(configured)
  let fixtureStat
  try {
    fixtureStat = fs.statSync(fixture)
  } catch (error) {
    assert.fail(`ARKTS_LARGE_FIXTURE must name an existing directory: ${fixture} (${error.message})`)
  }
  assert.ok(fixtureStat.isDirectory(), `ARKTS_LARGE_FIXTURE must name a directory: ${fixture}`)

  const revision = spawnSync("git", ["-C", fixture, "rev-parse", "HEAD"], {
    encoding: "utf8",
  })
  assert.equal(
    revision.status,
    0,
    `ARKTS_LARGE_FIXTURE must be a Git worktree: ${revision.stderr || revision.error?.message || fixture}`,
  )
  assert.equal(
    revision.stdout.trim(),
    FIXTURE_HEAD,
    `ARKTS_LARGE_FIXTURE HEAD must be ${FIXTURE_HEAD}`,
  )
  return fs.realpathSync(fixture)
}

function requireReleaseArtifact(artifactPath, label, executable = false) {
  let artifactStat
  try {
    artifactStat = fs.statSync(artifactPath)
  } catch (error) {
    assert.fail(`${label} release artifact is required: ${error.message}`)
  }
  assert.ok(artifactStat.isFile() && artifactStat.size > 0, `${label} must be a non-empty file`)
  fs.accessSync(artifactPath, executable ? fs.constants.X_OK : fs.constants.R_OK)
}

async function initializeWorkspace(server, rootUri, id) {
  server.send({
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri,
      capabilities: { window: { workDoneProgress: true } },
    },
  })
  const response = await server.response(id, 30_000)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(response.result.serverInfo.name, "arkts-language-server")
  assert.equal(response.result.capabilities.workspaceSymbolProvider, true)
}

async function acknowledgeProgressAndWaitUntilReady(server) {
  const token = await acknowledgeProgress(server)
  return waitUntilReady(server, token)
}

async function acknowledgeProgressAndWaitForCatalogActivity(server) {
  const token = await acknowledgeProgress(server)
  await progressNotification(
    server,
    token,
    (message) => message.params.value.kind === "report"
      && message.params.value.percentage !== 100,
    "catalog activity",
    30_000,
  )
  return token
}

async function acknowledgeProgress(server) {
  const create = await serverRequest(
    server,
    "window/workDoneProgress/create",
    () => true,
    "progress token creation",
    30_000,
  )
  server.send({ jsonrpc: "2.0", id: create.id, result: null })
  const begin = await progressNotification(
    server,
    create.params.token,
    (message) => message.params.value.kind === "begin",
    "catalog begin",
    30_000,
  )
  assert.equal(begin.params.value.title, "ArkTS workspace index")
  assert.equal(begin.params.value.message, "Discovering project files")
  return create.params.token
}

async function waitUntilReady(server, token) {
  const terminal = await progressNotification(
    server,
    token,
    (message) => message.params.value.kind === "report"
      && (message.params.value.percentage === 100
        || /^Indexing (?:degraded|cancelled)/.test(message.params.value.message ?? "")),
    "catalog terminal progress",
    30_000,
  )
  const end = await progressNotification(
    server,
    token,
    (message) => message.params.value.kind === "end",
    "catalog end",
    30_000,
  )
  assert.equal(end.params.value.kind, "end")
  assert.equal(
    terminal.params.value.percentage,
    100,
    `catalog did not reach ready: ${terminal.params.value.message}`,
  )
  return terminal
}

async function progressNotification(server, token, predicate, stage, timeoutMs) {
  try {
    return await server.progress(token, predicate, timeoutMs)
  } catch (error) {
    error.message = `${stage}: ${error.message}; queued messages: ${JSON.stringify(server.messages)}`
    throw error
  }
}

async function serverRequest(server, method, predicate, stage, timeoutMs) {
  try {
    return await server.serverRequest(method, predicate, timeoutMs)
  } catch (error) {
    error.message = `${stage}: ${error.message}; queued messages: ${JSON.stringify(server.messages)}`
    throw error
  }
}

function assertReadyFileCount(ready, expected) {
  const match = /^Indexed (\d+)\/(\d+) files; skipped (\d+) entries$/.exec(
    ready.params.value.message,
  )
  assert.ok(match, `catalog did not reach ready: ${ready.params.value.message}`)
  assert.equal(Number(match[1]), expected, "ready progress indexed the wrong number of files")
  assert.equal(Number(match[2]), expected, "ready progress discovered the wrong number of files")
}

async function search(server, id, query, timeoutMs = 10_000) {
  server.send({
    jsonrpc: "2.0",
    id,
    method: "workspace/symbol",
    params: { query },
  })
  const response = await server.response(id, timeoutMs)
  assert.equal(response.error, undefined, `${query} failed: ${JSON.stringify(response.error)}`)
  assert.ok(Array.isArray(response.result), `${query} must return a WorkspaceSymbol array`)
  return response.result
}

function assertDefinitions(fixture, items, expected) {
  const exactItems = items.filter((item) => item.name === expected.name)
  assert.equal(
    exactItems.length,
    expected.locations.length,
    `${expected.name} must have ${expected.locations.length} definitions`,
  )
  assert.deepEqual(
    items.slice(0, exactItems.length).map((item) => item.name),
    Array(exactItems.length).fill(expected.name),
    `${expected.name} exact definitions must rank ahead of fuzzy matches`,
  )
  const actualLocations = []
  for (const item of exactItems) {
    assert.equal(item.name, expected.name)
    assert.equal(item.kind, expected.kind)
    const definitionPath = fileURLToPath(item.location.uri)
    const relative = path.relative(fixture, definitionPath)
    assert.ok(
      relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
      `${expected.name} URI must stay inside the pinned fixture: ${item.location.uri}`,
    )
    const source = fs.readFileSync(definitionPath, "utf8")
    assert.equal(
      textInRange(source, item.location.range),
      expected.name,
      `${expected.name} range must select its real definition in ${relative}`,
    )
    actualLocations.push([relative.split(path.sep).join("/"), item.location.range.start.line])
  }
  actualLocations.sort(compareDefinitionLocation)
  assert.deepEqual(
    actualLocations,
    [...expected.locations].sort(compareDefinitionLocation),
    `${expected.name} must jump to every pinned definition`,
  )
}

function compareDefinitionLocation(left, right) {
  return left[0].localeCompare(right[0]) || left[1] - right[1]
}

function textInRange(source, range) {
  const lines = source.split(/\r?\n/u)
  assert.ok(range.start.line < lines.length, "symbol range starts outside its source file")
  assert.ok(range.end.line < lines.length, "symbol range ends outside its source file")
  if (range.start.line === range.end.line) {
    return lines[range.start.line].slice(range.start.character, range.end.character)
  }
  return [
    lines[range.start.line].slice(range.start.character),
    ...lines.slice(range.start.line + 1, range.end.line),
    lines[range.end.line].slice(0, range.end.character),
  ].join("\n")
}

async function shutdownAndExit(server, id) {
  server.send({ jsonrpc: "2.0", id, method: "shutdown", params: null })
  const response = await server.response(id, 10_000)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const exited = once(server.child, "exit")
  server.send({ jsonrpc: "2.0", method: "exit", params: null })
  const [code, signal] = await exited
  assert.equal(signal, null, `language server exited from signal ${signal}`)
  assert.equal(code, 0, `language server exited with code ${code}; stderr: ${server.stderr}`)
}

function percentile(samples, percentileValue) {
  assert.ok(samples.length > 0)
  const sorted = [...samples].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * percentileValue) - 1]
}

function formatMs(value) {
  return value.toFixed(2)
}
