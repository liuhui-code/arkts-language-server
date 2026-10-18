import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { LspSession } from "./lsp-session.mjs"
import { projectRoot } from "./lsp-process.mjs"
import { releasePreparedOwner } from "./semantic-preparation-state.mjs"

async function runSingleReferenceRequest(t, {
  root,
  workspace,
  queryUri,
  queryText,
  position,
  strategy,
  awaitIndexReady = false,
  overlayPath,
  overlayText,
  indexScenario,
  batchRoots = "2",
  runId = strategy,
  afterFirstRequest,
  sdkPath,
  sdkAmbientProfile,
  dependencyProfile,
  interactiveSdkAmbientProfile,
  interactiveProjectRootProfile,
  memberCompletionProjectRootProfile,
  captureDiagnostics = false,
  captureInteractiveQueries = false,
  completionPosition,
  completionLabel,
}) {
  const logDirectory = path.join(root, `logs-${runId}`)
  const indexAuditPath = path.join(root, `index-audit-${runId}.ndjson`)
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: {
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
      ARKTS_BENCHMARK_CONTROL: "1",
      HOME: path.join(root, "missing-home"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, `cache-${runId}`),
      ...(awaitIndexReady ? {
        ARKTS_INDEX_SIDECAR_PATH: path.join(
          projectRoot,
          "tests",
          "fixtures",
          "index",
          "scripted-catalog-sidecar.mjs",
        ),
        ARKTS_INDEX_TEST_AUDIT: indexAuditPath,
        ...(indexScenario ? { ARKTS_INDEX_TEST_SCENARIO: indexScenario } : {}),
      } : {}),
      ARKTS_LSP_LOG_DIR: logDirectory,
      ...(strategy ? { ARKTS_REFERENCES_STRATEGY: strategy } : {}),
      ARKTS_REFERENCES_BATCH_ROOTS: batchRoots,
      ARKTS_REFERENCES_TRACE: "1",
      ...(sdkAmbientProfile ? {
        ARKTS_REFERENCES_SDK_AMBIENT_PROFILE: sdkAmbientProfile,
      } : {}),
      ...(dependencyProfile ? {
        ARKTS_REFERENCES_DEPENDENCY_PROFILE: dependencyProfile,
      } : {}),
      ...(interactiveSdkAmbientProfile ? {
        ARKTS_INTERACTIVE_SDK_AMBIENT_PROFILE: interactiveSdkAmbientProfile,
      } : {}),
      ...(interactiveProjectRootProfile ? {
        ARKTS_INTERACTIVE_PROJECT_ROOT_PROFILE: interactiveProjectRootProfile,
      } : {}),
      ...(memberCompletionProjectRootProfile ? {
        ARKTS_MEMBER_COMPLETION_PROJECT_ROOT_PROFILE: memberCompletionProjectRootProfile,
      } : {}),
    },
    capabilities: awaitIndexReady ? { window: { workDoneProgress: true } } : {},
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({
    ...(sdkPath ? { initializationOptions: { sdk: { path: sdkPath } } } : {}),
    timeoutMs: 10_000,
  })
  await releasePreparedOwner(session, pathToFileURL(workspace).href)
  if (awaitIndexReady) {
    const create = await session.transport.serverRequest(
      "window/workDoneProgress/create",
      () => true,
      10_000,
    )
    session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
    await session.transport.progress(
      create.params.token,
      message => message.params.value.kind === "end",
      10_000,
    )
  }
  if (overlayPath && overlayText) {
    session.openDocument({ uri: pathToFileURL(overlayPath).href, version: 1, text: overlayText })
  }
  const diagnostics = captureDiagnostics
    ? session.transport.notification("textDocument/publishDiagnostics", message => (
        message.params.uri === queryUri
      ), 30_000)
    : undefined
  session.openDocument({ uri: queryUri, version: 1, text: queryText })
  const publishedDiagnostics = diagnostics ? (await diagnostics).params.diagnostics : undefined
  const diagnosticEvents = diagnostics ? fs.readFileSync(path.join(logDirectory, "server.log"), "utf8")
    .split("\n").filter(Boolean).map(JSON.parse).filter(entry => entry.event === "diagnostics.program.complete") : []
  const definitionResponse = captureInteractiveQueries
    ? await session.request("textDocument/definition", {
        textDocument: { uri: queryUri }, position,
      }, { timeoutMs: 30_000 })
    : undefined
  assert.equal(definitionResponse?.error, undefined, JSON.stringify(definitionResponse?.error))
  const completionResponse = captureInteractiveQueries
    ? await session.request("textDocument/completion", {
        textDocument: { uri: queryUri }, position: completionPosition,
        context: { triggerKind: 1 },
      }, { timeoutMs: 30_000 })
    : undefined
  assert.equal(completionResponse?.error, undefined, JSON.stringify(completionResponse?.error))
  const response = await session.request("textDocument/references", {
    textDocument: { uri: queryUri }, position, context: { includeDeclaration: true },
  }, { timeoutMs: 30_000 })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  if (afterFirstRequest) {
    await afterFirstRequest(session)
    const repeated = await session.request("textDocument/references", {
      textDocument: { uri: queryUri }, position, context: { includeDeclaration: true },
    }, { timeoutMs: 30_000 })
    assert.equal(repeated.error, undefined, JSON.stringify(repeated.error))
    assert.deepEqual(sortedLocations(repeated.result), sortedLocations(response.result))
  }
  await session.close({ timeoutMs: 5_000 })
  const logs = fs.readFileSync(path.join(logDirectory, "server.log"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse)
  return {
    locations: sortedLocations(response.result),
    batchEvents: logs.filter(entry => entry.event === "references.batch.complete"),
    referenceEvents: logs.filter(entry => entry.event.startsWith("references.")),
    indexEvents: logs.filter(entry => (
      entry.event.startsWith("references.index.")
      || entry.event === "references.anchor.complete"
    )),
    indexRequests: fs.existsSync(indexAuditPath)
      ? fs.readFileSync(indexAuditPath, "utf8").split("\n").filter(Boolean).map(JSON.parse)
      : [],
    diagnostics: publishedDiagnostics,
    definition: captureInteractiveQueries ? sortedLocations(definitionResponse.result) : undefined,
    completion: captureInteractiveQueries
      ? completionItems(completionResponse.result)
          .filter(({ label }) => label === completionLabel)
          .map(({ label, detail, kind, insertText, sortText, textEdit }) => ({
            label, detail, kind, insertText, sortText, textEdit,
          }))
      : undefined,
    completionEvents: logs.filter(entry => entry.event === "completion.program.complete"),
    diagnosticEvents,
    requestEvents: logs.filter(entry => entry.event === "request.completed"),
  }
}

function completionItems(result) {
  return Array.isArray(result) ? result : result?.items ?? []
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  const line = prefix.split("\n").length - 1
  return { line, character: prefix.length - prefix.lastIndexOf("\n") - 1 }
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

function pathFingerprint(workspace, filePath) {
  const relative = path.relative(workspace, filePath).split(path.sep).join("/")
  return createHash("sha256").update(relative).digest("hex").slice(0, 16)
}

async function waitForBatchEvent(logPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const events = readBatchEvents(logPath)
    if (events.length > 0) return events[0]
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for a completed reference batch in ${logPath}`)
}

function readBatchEvents(logPath) {
  if (!fs.existsSync(logPath)) return []
  return fs.readFileSync(logPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.event === "references.batch.complete")
}

export { runSingleReferenceRequest, positionAt, pathFingerprint, waitForBatchEvent, readBatchEvents }
