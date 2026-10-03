#!/usr/bin/env node

import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { isDeepStrictEqual } from "node:util"

import { LspSession } from "../../tests/support/lsp-session.mjs"
import {
  comparableLocations, loadOracle, normalizeReferences, validateLocations,
} from "./reference-location-oracle.mjs"
import { projectRoot, sha256File } from "./reference-replay-input.mjs"
import { childExit, delay, waitForCatalog, waitForSample } from "./reference-replay-evidence.mjs"
import {
  consumerFile, declarationFile, guardOutputScope, makeSchedule, parseOptions,
  position, prepareInput, secondaryFile, secondaryPosition, sourcePreserved, symbol,
} from "./settings-mixed-input.mjs"
import { makeMixedReport, postIdleTiming } from "./settings-mixed-report.mjs"
import { startIndexRejectionObserver } from "./reference-index-rejection-observer.mjs"

const samplerPath = path.join(projectRoot, "scripts/bench/sample-process-tree-rss.mjs")
const help = `Usage:
  node scripts/bench/replay-settings-mixed-ops.mjs \\
    --workspace <clean Settings checkout> --sdk <API24 SDK path> \\
    --out <new report.json> --session-reuse <off|experimental> \\
    --operations <at least 100>

One private Settings clone and one real framed-stdio LSP session per run. Each
watched disk edit of unopened HomeInitData.ets is followed immediately by an
exact consumer definition at UTF-16 40:37. Shifted nine-location references
and common/index.ets definition are checked every ten edits, plus the final edit.
Run off and experimental as two independent, serial invocations.

Options:
  --seed <unsigned integer>    pinned comment-payload seed (default: 20260930)
  --manifest <path>           pinned Settings mixed-ops/API24 manifest
  --oracle <path>             pinned nine-location oracle
  --server <path>             default: dist/server.cjs
  --sidecar <path>            default: target/release/arkts-index-sidecar
  --sample-interval-ms <ms>   default: 50 (actual intervals recorded)
  --trace                     enable semantic trace (default: off)
  --index-rejection-snapshot  observe private SQLite row at candidate-ineligible
  --post-idle-reference       after catalog catch-up, check indexed references
                              from common/index.ets (implies trace; diagnostic only)
  --help
`

try {
  const options = parseOptions(process.argv.slice(2))
  if (options.help) process.stdout.write(help)
  else {
    const report = await replay(options)
    process.stdout.write(`SETTINGS_MIXED_REPLAY=${report.status}\nREPORT=${options.out}\n`)
    if (report.status !== "PASS") process.exitCode = 1
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}

async function replay(options) {
  const originalRoot = guardOutputScope(options)
  const input = await prepareInput(options, originalRoot)
  try {
    const schedule = makeSchedule(options.operations, options.seed)
    const run = await replayClone(options, input, schedule)
    const report = makeMixedReport(options, input, run)
    try { report.sourcePreserved = sourcePreserved(input) } catch (error) {
      report.sourcePreserved = false
      report.sourceStatusError = error.message
    }
    if (!report.sourcePreserved) report.status = "FAIL"
    fs.mkdirSync(path.dirname(options.out), { recursive: true })
    fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" })
    return report
  } finally {
    fs.rmSync(input.temporary, { recursive: true, force: true })
  }
}

function effectiveEnvironment(options, cacheDir, logDir) {
  const configured = {
    ARKTS_INDEX_CACHE_DIR: cacheDir,
    ARKTS_INDEX_SIDECAR_PATH: options.sidecar,
    ARKTS_LSP_LOG_DIR: logDir,
    ARKTS_SEMANTIC_SESSION_REUSE: options.sessionReuse,
    ARKTS_REFERENCES_TRACE: options.trace ? "1" : "0",
    ARKTS_INDEX_CATALOG_TRACE: options.postIdleReference ? "1" : "0",
    ARKTS_REFERENCES_STRATEGY: "indexed-batched",
    ARKTS_REFERENCES_BATCH_ROOTS: "64",
    ARKTS_REFERENCES_DEPENDENCY_PROFILE: "closure",
    ARKTS_REFERENCES_SDK_AMBIENT_PROFILE: "full",
    ARKTS_REFERENCES_CONTEXT_RETENTION: "dispose",
    ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
    ARKTS_REFERENCES_ANCHOR_REUSE: "0",
    ARKTS_REFERENCES_CONSTRUCTOR_SCOPE: "0",
    ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS: "0",
    ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR: "0",
    ARKTS_REFERENCES_WAIT_FOR_INITIAL_CATALOG: "0",
    ARKTS_MEMORY_BUDGET_MB: "1024",
    ARKTS_BENCHMARK_CONTROL: "1",
    ARKLINE_HARMONY_SDK_PATH: options.sdk,
    DEVECO_SDK_HOME: options.sdk,
  }
  const unknown = Object.keys(process.env)
    .filter(name => name.startsWith("ARKTS_") && !(name in configured))
  if (unknown.length) throw new Error(`BENCHMARK_BLOCKED=UNCONTROLLED_ARKTS_ENV:${unknown.join(",")}`)
  return configured
}

async function replayClone(options, input, schedule) {
  const cacheDir = path.join(input.temporary, "index-cache")
  const logDir = path.join(input.temporary, "logs")
  const samplesPath = path.join(input.temporary, "rss.jsonl")
  fs.mkdirSync(cacheDir)
  fs.mkdirSync(logDir)
  const environment = effectiveEnvironment(options, cacheDir, logDir)
  const consumerPath = path.join(input.clone, consumerFile)
  const declarationPath = path.join(input.clone, declarationFile)
  const secondaryPath = path.join(input.clone, secondaryFile)
  const consumerText = fs.readFileSync(consumerPath, "utf8")
  const declarationText = fs.readFileSync(declarationPath, "utf8")
  const secondaryText = fs.readFileSync(secondaryPath, "utf8")
  if (consumerText.split("\n")[position.line]?.slice(position.character, position.character + 12) !== symbol
    || declarationText.split("\n")[16]?.slice(13, 25) !== symbol
    || secondaryText.split("\n")[secondaryPosition.line]?.slice(
      secondaryPosition.character, secondaryPosition.character + 12) !== symbol) {
    throw new Error("BENCHMARK_BLOCKED=PINNED_SYMBOL_POSITION_MISMATCH")
  }
  const originalOracle = loadOracle(options.oracle, input.clone)
  if (originalOracle.locations.length !== 9) throw new Error("BENCHMARK_BLOCKED=ORACLE_COUNT_MISMATCH")
  const shiftedOracle = { locations: originalOracle.locations.map(location => (
    location.file === declarationFile ? { file: location.file, range: shift(location.range) } : location
  )) }
  const consumerUri = pathToFileURL(consumerPath).href
  const declarationUri = pathToFileURL(declarationPath).href
  const secondaryUri = pathToFileURL(secondaryPath).href
  const events = [], requests = [], operations = [], receivedDiagnostics = []
  const indexRejectionSnapshots = []
  const mark = (phase, details = {}) => events.push({
    phase, timestamp: Date.now(), monotonicNs: process.hrtime.bigint().toString(),
    harnessRssBytes: process.memoryUsage().rss, ...details,
  })
  const session = new LspSession({
    command: process.execPath, args: [options.server, "--stdio"], cwd: projectRoot,
    rootUri: pathToFileURL(input.clone).href, env: environment,
    capabilities: {
      general: { positionEncodings: ["utf-16"] },
      window: { workDoneProgress: true },
      textDocument: { publishDiagnostics: { versionSupport: true } },
    },
  })
  const targetPid = session.transport.child.pid
  const sampler = spawn(process.execPath,
    [samplerPath, String(targetPid), samplesPath, String(options.sampleIntervalMs)],
    { cwd: projectRoot, stdio: ["ignore", "ignore", "pipe"] })
  let samplerStderr = "", catalog = null, diagnostic = null, secondaryDiagnostic = null
  let failure = null, closeResult = null, postIdleReference = null
  let finalReferenceLogOffset = null
  let catalogPromise = null, closing = false
  sampler.stderr.setEncoding("utf8")
  sampler.stderr.on("data", chunk => { samplerStderr += chunk })
  const request = async (operation, method, params) => {
    const started = process.hrtime.bigint()
    const queryRole = method === "arkts/benchmark/applyMemoryPressure" ? "control"
      : params.textDocument?.uri === secondaryUri ? "secondary" : "primary"
    const entry = {
      operation, method, queryRole,
      documentFile: queryRole === "secondary" ? secondaryFile
        : queryRole === "primary" ? consumerFile : null,
      startedAt: Date.now(), startedMonotonicNs: started.toString(),
    }
    mark("request.start", { operation, method })
    try {
      const response = await session.request(method, params, { timeoutMs: 180_000 })
      entry.result = response.result ?? null
      entry.error = response.error ?? null
      if (response.error) throw new Error(`${method} failed: ${JSON.stringify(response.error)}`)
      return response.result
    } catch (error) {
      entry.failure = error.message
      throw error
    } finally {
      entry.finishedAt = Date.now()
      entry.elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
      requests.push(entry)
      mark("request.complete", { operation, method, elapsedMs: entry.elapsedMs,
        error: entry.error ?? entry.failure ?? null })
    }
  }
  const definition = (operation, uri, queryPosition) => request(operation,
    "textDocument/definition", { textDocument: { uri }, position: queryPosition })
  try {
    await waitForSample(samplesPath, 10_000)
    mark("server-process-started", { targetPid, samplerPid: sampler.pid })
    await session.initialize({ initializationOptions: { sdk: { path: options.sdk } }, timeoutMs: 180_000 })
    mark("initialize.complete")
    catalogPromise = waitForCatalog(session, 180_000).then(value => {
      catalog = { status: "ready", value }
      mark("catalog.complete", { value })
    }, error => {
      catalog = { status: closing ? "not-observed" : "error", error: error.message }
      mark("catalog.not-observed", catalog)
    })
    await catalogPromise
    if (catalog.status !== "ready") throw new Error(`catalog did not complete: ${catalog.error}`)
    const diagnosticPromise = waitForVersionedDiagnostics(session, consumerUri, 1,
      receivedDiagnostics, mark)
    session.openDocument({ uri: consumerUri, version: 1, text: consumerText })
    mark("didOpen.sent", { uri: consumerUri, version: 1 })
    const baseline = exactDefinition(await definition(0, consumerUri, position), declarationUri, 16)
    mark("definition.baseline", { exact: baseline.exact })
    if (!baseline.exact) throw new Error("baseline definition differs from pinned declaration")
    diagnostic = await diagnosticPromise
    if (diagnostic?.timeout) throw new Error("v1 consumer diagnostics were not published")
    if (!isDeepStrictEqual(diagnostic.diagnostics,
      options.benchmarkManifest.query.expectedDiagnostics)) {
      throw new Error("v1 consumer diagnostics differ from pinned TS2339 oracle")
    }
    let secondaryVersion = 0
    for (const step of schedule.schedule) {
      const operation = { ...step, startedAt: Date.now(), beforeSha256: sha256File(declarationPath) }
      operations.push(operation)
      const editedText = step.commentOn
        ? `// S05 mixed watched disk edit ${step.commentHex}\n${declarationText}` : declarationText
      fs.writeFileSync(declarationPath, editedText)
      operation.afterSha256 = sha256File(declarationPath)
      mark("disk-edit.complete", { operation: step.operation, commentOn: step.commentOn,
        afterSha256: operation.afterSha256 })
      session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
        params: { changes: [{ uri: declarationUri, type: 2 }] } })
      mark("watched-change.sent", { operation: step.operation, uri: declarationUri, type: 2 })
      const expectedLine = step.commentOn ? 17 : 16
      operation.primaryDefinition = exactDefinition(
        await definition(step.operation, consumerUri, position), declarationUri, expectedLine)
      mark("definition.primary-validated", { operation: step.operation,
        exact: operation.primaryDefinition.exact })
      if (!operation.primaryDefinition.exact) {
        throw new Error(`operation ${step.operation}: primary definition differs from line ${expectedLine}`)
      }
      if (step.moduleSwitch) {
        secondaryVersion += 1
        const secondaryDiagnosticPromise = secondaryVersion === 1
          ? waitForVersionedDiagnostics(session, secondaryUri, secondaryVersion,
            receivedDiagnostics, mark) : null
        session.openDocument({ uri: secondaryUri, version: secondaryVersion, text: secondaryText })
        mark("didOpen.secondary", { operation: step.operation, version: secondaryVersion })
        try {
          operation.secondaryDefinition = exactDefinition(
            await definition(step.operation, secondaryUri, secondaryPosition),
            declarationUri, expectedLine)
          mark("definition.secondary-validated", { operation: step.operation,
            exact: operation.secondaryDefinition.exact })
          if (!operation.secondaryDefinition.exact) {
            throw new Error(`operation ${step.operation}: secondary definition differs from line ${expectedLine}`)
          }
          if (secondaryDiagnosticPromise) {
            secondaryDiagnostic = await secondaryDiagnosticPromise
            if (secondaryDiagnostic?.timeout || !isDeepStrictEqual(
              secondaryDiagnostic?.diagnostics,
              options.benchmarkManifest.secondaryQuery.expectedDiagnostics)) {
              throw new Error("v1 secondary diagnostics differ from pinned empty oracle")
            }
          }
        } finally {
          session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose",
            params: { textDocument: { uri: secondaryUri } } })
          mark("didClose.secondary", { operation: step.operation, version: secondaryVersion })
        }
      }
      if (step.references) {
        if (step.operation === options.operations && options.postIdleReference) {
          finalReferenceLogOffset = logSize(path.join(logDir, "server.log"))
        }
        const observer = options.indexRejectionSnapshot ? startIndexRejectionObserver({
          logPath: path.join(logDir, "server.log"), cacheDir,
        }) : null
        let result
        try {
          result = await request(step.operation, "textDocument/references", {
            textDocument: { uri: consumerUri }, position,
            context: { includeDeclaration: false },
          })
        } finally {
          for (const capture of observer?.stop() ?? []) {
            indexRejectionSnapshots.push({ operation: step.operation, ...capture })
          }
        }
        const normalized = normalizeReferences(result)
        const comparable = comparableLocations(normalized, input.clone)
        const expected = step.commentOn ? shiftedOracle : originalOracle
        operation.references = { normalized, comparable,
          validation: validateLocations(normalized, comparable, expected, input.clone) }
        mark("references.validated", { operation: step.operation,
          exact: operation.references.validation.pass, count: normalized.length })
        if (!operation.references.validation.pass) {
          throw new Error(`operation ${step.operation}: references differ from nine-location oracle`)
        }
      }
      if (step.pressure) {
        const result = await request(step.operation, "arkts/benchmark/applyMemoryPressure",
          { level: "level3" })
        operation.pressure = { result, exact: isDeepStrictEqual(result, { applied: "level3" }) }
        mark("pressure.level3-validated", { operation: step.operation,
          exact: operation.pressure.exact })
        if (!operation.pressure.exact) {
          throw new Error(`operation ${step.operation}: Level3 pressure was not applied`)
        }
      }
      operation.finishedAt = Date.now()
      mark("operation.complete", { operation: step.operation })
    }
    await delay(1_000)
    mark("idle.complete")
    if (options.postIdleReference) {
      const logPath = path.join(logDir, "server.log")
      const finalEvents = readServerEvents(logPath, finalReferenceLogOffset ?? 0)
      const fallback = finalEvents.findLast(event => event.event === "references.index.fallback"
        && event.reason === "workspace-changed")
      if (!Number.isSafeInteger(fallback?.baselineGeneration)) {
        throw new Error("post-idle check requires a final workspace-changed fallback baseline")
      }
      const waitStarted = Date.now()
      const ready = await waitForReadyGeneration(logPath, fallback.baselineGeneration, 180_000)
      const readyAt = Date.now()
      mark("post-idle.catalog-ready", { baselineGeneration: fallback.baselineGeneration,
        readyGeneration: ready.committedGeneration })
      secondaryVersion += 1
      session.openDocument({ uri: secondaryUri, version: secondaryVersion, text: secondaryText })
      const routeOffset = logSize(logPath)
      const startedAt = Date.now()
      try {
        const result = await request(options.operations + 1, "textDocument/references", {
          textDocument: { uri: secondaryUri }, position: secondaryPosition,
          context: { includeDeclaration: false },
        })
        const normalized = normalizeReferences(result)
        const comparable = comparableLocations(normalized, input.clone)
        const expected = schedule.schedule.at(-1).commentOn ? shiftedOracle : originalOracle
        const routeEvents = readServerEvents(logPath, routeOffset)
        const finishedAt = Date.now()
        postIdleReference = {
          startedAt, finishedAt,
          ...postIdleTiming(waitStarted, readyAt, startedAt, finishedAt),
          baselineGeneration: fallback.baselineGeneration,
          readyGeneration: ready.committedGeneration,
          queryFile: secondaryFile, queryPosition: secondaryPosition,
          validation: validateLocations(normalized, comparable, expected, input.clone),
          comparable, routeEvents,
          route: {
            cacheMiss: routeEvents.some(event => event.event === "references.cache.miss"),
            recovered: routeEvents.some(event => event.event === "references.index.recovered"),
            accepted: routeEvents.some(event => event.event === "references.index.accepted"),
            indexedPlan: routeEvents.some(event => event.event === "references.plan.complete"
              && event.candidateMode === "indexed"),
            fallback: routeEvents.some(event => event.event === "references.index.fallback"),
          },
        }
        mark("post-idle.references-validated", { exact: postIdleReference.validation.pass,
          indexed: postIdleReference.route.indexedPlan })
      } finally {
        session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose",
          params: { textDocument: { uri: secondaryUri } } })
      }
    }
  } catch (error) {
    failure = { name: error.name, message: error.message }
    mark("failure", failure)
  } finally {
    closing = true
    closeResult = await session.close({ timeoutMs: 10_000 }).catch(async error => {
      await session.transport.close().catch(() => {})
      return { error: error.message }
    })
    if (catalogPromise) await catalogPromise
    mark("server-process-closed", { closeResult })
    sampler.kill("SIGINT")
    await childExit(sampler)
  }
  return { environment, targetPid, samplerPid: sampler.pid, samplerExitCode: sampler.exitCode,
    samplerSignal: sampler.signalCode, samplesPath, logDir, events, requests, operations,
    catalog, diagnostic, secondaryDiagnostic, receivedDiagnostics,
    session, samplerStderr, closeResult, failure,
    schedule, originalOracle, shiftedOracle, declarationPath, indexRejectionSnapshots,
    postIdleReference }
}

function logSize(fileName) {
  return fs.existsSync(fileName) ? fs.statSync(fileName).size : 0
}

function readServerEvents(fileName, offset = 0) {
  if (!fs.existsSync(fileName)) return []
  const bytes = fs.readFileSync(fileName)
  if (bytes.length < offset) throw new Error("server log rotated during post-idle check")
  return bytes.subarray(offset).toString("utf8").split("\n").filter(Boolean)
    .map(line => JSON.parse(line))
}

async function waitForReadyGeneration(fileName, baseline, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ready = readServerEvents(fileName).findLast(event => event.event === "index.catalog.phase"
      && event.phase === "ready" && event.committedGeneration > baseline)
    if (ready) return ready
    await delay(50)
  }
  throw new Error(`post-idle catalog did not advance beyond generation ${baseline}`)
}

async function waitForVersionedDiagnostics(session, uri, version, received, mark) {
  const deadline = Date.now() + 180_000
  try {
    while (true) {
      const message = await session.transport.notification("textDocument/publishDiagnostics",
        () => true, Math.max(1, deadline - Date.now()))
      const observed = { timestamp: Date.now(), uri: message.params?.uri ?? null,
        version: message.params?.version ?? null, diagnostics: message.params?.diagnostics ?? null }
      received.push(observed)
      mark("publishDiagnostics.received", { uri: observed.uri, version: observed.version,
        count: observed.diagnostics?.length ?? null })
      if (observed.uri === uri && observed.version === version
        && Array.isArray(observed.diagnostics)) return observed
    }
  } catch (error) {
    return { timeout: true, error: error.message.split(". stderr:")[0] }
  }
}

function exactDefinition(value, uri, line) {
  const observed = Array.isArray(value) ? value : value ? [value] : []
  const expected = [{ uri, range: { start: { line, character: 13 },
    end: { line, character: 25 } } }]
  return { observed, expected, exact: JSON.stringify(observed) === JSON.stringify(expected) }
}

function shift(range) {
  return { start: { ...range.start, line: range.start.line + 1 },
    end: { ...range.end, line: range.end.line + 1 } }
}
