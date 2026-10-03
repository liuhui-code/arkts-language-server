#!/usr/bin/env node

import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { LspSession } from "../../tests/support/lsp-session.mjs"
import { runPreparedSuite } from "./prepared-query-suite.mjs"
import {
  comparableLocations,
  loadOracle,
  normalizeReferences,
  validPosition,
  validateLocations,
} from "./reference-location-oracle.mjs"
import {
  helpText,
  parseArguments,
  projectRoot,
  validateBenchmarkManifest,
  validateInputs,
} from "./reference-replay-input.mjs"
import {
  attachNearestRss,
  childExit,
  delay,
  environmentEvidence,
  maxNullable,
  readJsonLines,
  readStructuredLogs,
  serverEnvironment,
  waitForCatalog,
  waitForSample,
} from "./reference-replay-evidence.mjs"

const samplerPath = path.join(projectRoot, "scripts", "bench", "sample-process-tree-rss.mjs")

try {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(helpText())
  } else if (options.preparedSuite) {
    const report = await runPreparedSuite(options)
    process.stdout.write(`PREPARED_SUITE=${report.status}\nREADINESS=${report.readiness.semantic.status}\nREPORT=${options.out}\n`)
    if (report.status !== "PASS") process.exitCode = 1
  } else {
    const report = await replay(options)
    process.stdout.write([
      `REFERENCES_REPLAY=${report.status}`,
      `REQUEST=textDocument/references`,
      `LOCATIONS=${report.normalizedReferences.length}`,
      `PEAK_RSS_BYTES=${report.memory.peakProductRssBytes}`,
      `REPORT=${options.out}`,
      "",
    ].join("\n"))
    if (report.status !== "PASS") process.exitCode = 1
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}

async function replay(options) {
  validateInputs(options)
  await validateBenchmarkManifest(options)
  const sourcePath = path.resolve(options.workspace, options.file)
  const sourceText = fs.readFileSync(sourcePath, "utf8")
  const positionOffset = positionToOffset(sourceText, options.position)
  const identifier = identifierAt(sourceText, positionOffset)
  if (identifier !== options.symbol) {
    throw new Error(
      `target position identifies ${JSON.stringify(identifier)}, expected ${JSON.stringify(options.symbol)}`,
    )
  }

  const sourceUri = pathToFileURL(sourcePath).href
  const expected = loadOracle(options.oracle, options.workspace)
  if (options.benchmarkManifest
    && expected.locations.length !== options.benchmarkManifest.oracle.expectedLocationCount) {
    throw new Error("BENCHMARK_BLOCKED=ORACLE_COUNT_MISMATCH")
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-references-replay-"))
  try {
    return await replayWithTemporaryState(options, { sourceText, sourceUri, expected, tempRoot })
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

async function replayWithTemporaryState(options, { sourceText, sourceUri, expected, tempRoot }) {
  const cacheDir = path.join(tempRoot, "index-cache")
  const logDir = path.join(tempRoot, "logs")
  const samplesPath = path.join(tempRoot, "process-tree-rss.jsonl")
  fs.mkdirSync(cacheDir, { recursive: true })
  fs.mkdirSync(logDir, { recursive: true })

  const timeline = []
  const mark = (phase, details = {}) => timeline.push({
    phase,
    timestamp: Date.now(),
    harnessRssBytes: process.memoryUsage().rss,
    ...details,
  })
  const session = new LspSession({
    command: process.execPath,
    args: [options.server, "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(options.workspace).href,
    env: serverEnvironment(options, cacheDir, logDir),
    capabilities: {
      general: { positionEncodings: ["utf-16"] },
      window: { workDoneProgress: true },
      textDocument: { publishDiagnostics: { versionSupport: true } },
    },
  })

  const targetPid = session.transport.child.pid
  const sampler = spawn(
    process.execPath,
    [samplerPath, String(targetPid), samplesPath, String(options.sampleIntervalMs)],
    { cwd: projectRoot, stdio: ["ignore", "ignore", "pipe"] },
  )
  let samplerStderr = ""
  sampler.stderr.setEncoding("utf8")
  sampler.stderr.on("data", (chunk) => { samplerStderr += chunk })

  let catalog = null
  let catalogState = "pending"
  let catalogError = null
  let catalogPromise = null
  let closing = false
  let diagnostic = null
  let failure = null
  let closeResult = null
  const responses = []
  try {
    await waitForSample(samplesPath, 10_000)
    mark("server-process-started", { targetPid, samplerPid: sampler.pid })
    mark("initialize-request-start")
    await session.initialize({
      initializationOptions: { sdk: { path: options.sdk } },
      timeoutMs: options.timeoutMs,
    })
    mark("initialize-response-complete")
    catalogPromise = waitForCatalog(session, options.timeoutMs).then((message) => {
      catalog = message
      catalogState = "complete"
      mark("catalog-complete", { catalog })
    }, (error) => {
      catalogState = closing ? "not-observed" : "error"
      catalogError = closing ? null : error.message
      mark("catalog-not-observed", { message: catalogError, state: catalogState })
    })
    if (options.catalogState === "ready") {
      await catalogPromise
      if (catalogState === "error") throw new Error(`catalog did not complete: ${catalogError}`)
    } else {
      mark("catalog-wait-skipped")
    }

    const diagnosticPromise = session.transport.notification(
      "textDocument/publishDiagnostics",
      (message) => message.params?.uri === sourceUri,
      options.diagnosticTimeoutMs,
    ).then((message) => {
      diagnostic = {
        timestamp: Date.now(),
        version: message.params?.version ?? null,
        diagnostics: message.params?.diagnostics ?? [],
      }
      mark("publishDiagnostics", {
        version: diagnostic.version,
        count: diagnostic.diagnostics.length,
      })
    }).catch((error) => {
      diagnostic = { timeout: true, message: error.message, diagnostics: [] }
      mark("publishDiagnostics-not-observed", diagnostic)
    })

    session.openDocument({ uri: sourceUri, version: 1, text: sourceText })
    mark("didOpen-sent", { version: 1 })
    await delay(25)
    if (options.mode === "B") {
      const methods = options.warmup === "implementation" ? ["textDocument/implementation"]
        : ["textDocument/completion", "textDocument/definition"]
      for (const method of methods) {
        mark("warmup-request-start", { method })
        const response = await session.request(
          method,
          { textDocument: { uri: sourceUri }, position: options.position },
          { timeoutMs: options.timeoutMs },
        )
        mark("warmup-response-complete", { method, error: response.error ?? null })
        if (response.error) throw new Error(`${method} failed: ${JSON.stringify(response.error)}`)
      }
    }

    const repetitions = options.mode === "C" ? 11 : 1
    for (let iteration = 1; iteration <= repetitions; iteration += 1) {
      if (iteration === 11) {
        session.changeDocument({
          uri: sourceUri,
          version: 2,
          text: `${sourceText}\n// references replay unsaved comment\n`,
        })
        mark("didChange-sent", { iteration, version: 2 })
        await delay(25)
      }
      mark("references-request-start", {
        iteration,
        method: "textDocument/references",
        position: options.position,
        includeDeclaration: options.includeDeclaration,
      })
      const response = await session.request(
        "textDocument/references",
        {
          textDocument: { uri: sourceUri },
          position: options.position,
          context: { includeDeclaration: options.includeDeclaration },
        },
        { timeoutMs: options.timeoutMs },
      )
      const normalized = normalizeReferences(response.result)
      const comparable = comparableLocations(normalized, options.workspace)
      const validation = validateLocations(normalized, comparable, expected, options.workspace)
      mark("references-response-complete", {
        iteration,
        error: response.error ?? null,
        locationCount: normalized.length,
        validation: validation.pass,
      })
      responses.push({
        iteration,
        documentVersion: iteration === 11 ? 2 : 1,
        error: response.error ?? null,
        normalizedReferences: normalized,
        comparableLocations: comparable,
        validation,
      })
      if (response.error) break
    }
    await delay(options.idleMs)
    mark("idle-complete", { idleMs: options.idleMs })
    await diagnosticPromise
  } catch (error) {
    failure = { name: error.name, message: error.message, stack: error.stack }
    mark("failure", failure)
  } finally {
    closing = true
    closeResult = await session.close({ timeoutMs: 10_000 }).catch(async (error) => {
      await session.transport.close().catch(() => {})
      return { error: error.message }
    })
    if (catalogPromise) await catalogPromise
    mark("server-process-closed", { closeResult })
    sampler.kill("SIGINT")
    await childExit(sampler)
  }

  const samples = readJsonLines(samplesPath)
  const transcript = session.transport.diagnosticSnapshot().transcript
  const requestedMethods = transcript.entries
    .filter((entry) => entry.direction === "send" && entry.method)
    .map((entry) => entry.method)
  const forbiddenSymbolRequests = requestedMethods.filter((method) => (
    method === "workspace/symbol" || method === "textDocument/documentSymbol"
  ))
  const normalizedReferences = responses.at(-1)?.normalizedReferences ?? []
  const allExact = responses.length === (options.mode === "C" ? 11 : 1)
    && responses.every((response) => response.validation.pass && !response.error)
  const repeatedResultsIdentical = responses.length > 1
    ? responses.every((response) => same(
      response.comparableLocations,
      responses[0].comparableLocations,
    ))
    : null
  const report = {
    schemaVersion: 1,
    status: !failure && allExact && forbiddenSymbolRequests.length === 0
      && !diagnostic?.timeout && Number.isSafeInteger(diagnostic?.version) ? "PASS" : "FAIL",
    replay: options.mode === "A"
      ? "A-fresh-process-references-first"
      : options.mode === "B"
        ? `B-fresh-process-${options.warmup}-warmup`
        : "C-ten-references-and-unsaved-comment-retry",
    environment: environmentEvidence(options),
    target: {
      file: options.file,
      uri: sourceUri,
      symbol: options.symbol,
      position: options.position,
      includeDeclaration: options.includeDeclaration,
    },
    targetPid,
    samplerPid: sampler.pid,
    catalogRequestState: options.catalogState,
    catalog,
    catalogState,
    catalogError,
    requestEvidence: {
      explicitMethod: "textDocument/references",
      requestedMethods,
      forbiddenSymbolRequests,
      transcript,
    },
    diagnostic,
    responses,
    repeatedResultsIdentical,
    normalizedReferences,
    expectedComparableLocations: expected.locations,
    memory: {
      measurementKind: "external-process-tree-rss",
      sampleIntervalMs: options.sampleIntervalMs,
      sampleCount: samples.length,
      peakProductRssBytes: maxNullable(samples.map((sample) => sample.totalRssBytes)),
      peakSamplerRssBytes: maxNullable(samples.map((sample) => sample.samplerRssBytes)),
      samples,
    },
    timeline: attachNearestRss(timeline, samples),
    serverEvents: readStructuredLogs(logDir),
    closeResult,
    samplerStderr,
    failure,
  }
  fs.mkdirSync(path.dirname(options.out), { recursive: true })
  fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" })
  return report
}

function positionToOffset(text, position) {
  const lines = text.split(/\r?\n/u)
  if (!validPosition(position, lines)) throw new Error("target position is outside the document")
  let offset = 0
  for (let line = 0; line < position.line; line += 1) offset += lines[line].length + 1
  return offset + position.character
}

function identifierAt(text, offset) {
  const isIdentifier = (value) => /[$\p{ID_Continue}]/u.test(value ?? "")
  let start = offset
  let end = offset
  while (start > 0 && isIdentifier(text[start - 1])) start -= 1
  while (end < text.length && isIdentifier(text[end])) end += 1
  return text.slice(start, end)
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}
