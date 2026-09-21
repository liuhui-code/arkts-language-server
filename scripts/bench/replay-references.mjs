#!/usr/bin/env node

import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { LspSession } from "../../tests/support/lsp-session.mjs"
import {
  comparableLocations,
  loadOracle,
  normalizeReferences,
  ordinalCompare,
  validPosition,
  validateLocations,
} from "./reference-location-oracle.mjs"
import {
  gitValue,
  helpText,
  parseArguments,
  projectRoot,
  readSdkMetadata,
  sha256File,
  validateBenchmarkManifest,
  validateInputs,
} from "./reference-replay-input.mjs"

const samplerPath = path.join(projectRoot, "scripts", "bench", "sample-process-tree-rss.mjs")

try {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(helpText())
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
    catalog = await waitForCatalog(session, options.timeoutMs)
    mark("catalog-complete", { catalog })

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
      for (const method of ["textDocument/completion", "textDocument/definition"]) {
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
    closeResult = await session.close({ timeoutMs: 10_000 }).catch(async (error) => {
      await session.transport.close().catch(() => {})
      return { error: error.message }
    })
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
        ? "B-fresh-process-completion-definition-warmup"
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
    catalog,
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

function serverEnvironment(options, cacheDir, logDir) {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith("ARKTS_"))),
    ARKTS_INDEX_CACHE_DIR: cacheDir,
    ARKTS_INDEX_SIDECAR_PATH: options.sidecar,
    ARKTS_LSP_LOG_DIR: logDir,
    ...(options.strategy ? { ARKTS_REFERENCES_STRATEGY: options.strategy } : {}),
    ...(options.batchRoots ? { ARKTS_REFERENCES_BATCH_ROOTS: String(options.batchRoots) } : {}),
    ...(options.trace ? { ARKTS_REFERENCES_TRACE: "1" } : {}),
    ...(options.sdkProfile
      ? { ARKTS_REFERENCES_SDK_AMBIENT_PROFILE: options.sdkProfile }
      : {}),
    ...(options.dependencyProfile
      ? { ARKTS_REFERENCES_DEPENDENCY_PROFILE: options.dependencyProfile }
      : {}),
  }
}

function environmentEvidence(options) {
  return {
    repo: projectRoot,
    head: gitValue(projectRoot, ["rev-parse", "HEAD"]),
    worktreeStatus: gitValue(projectRoot, ["status", "--porcelain"]),
    workspace: options.workspace,
    workspaceRevision: gitValue(options.workspace, ["rev-parse", "HEAD"]),
    workspaceStatus: gitValue(options.workspace, ["status", "--porcelain"]),
    sdk: options.sdk,
    sdkMetadata: readSdkMetadata(options.sdk),
    sdkDeclarationDigest: options.sdkDeclarationDigest ?? null,
    node: process.execPath,
    nodeVersion: process.version,
    platform: `${os.type()} ${os.release()} ${os.arch()}`,
    server: options.server,
    serverSha256: sha256File(options.server),
    sidecar: options.sidecar,
    sidecarSha256: sha256File(options.sidecar),
    launch: { command: process.execPath, args: [options.server, "--stdio"] },
    benchmarkManifest: options.manifest ?? null,
    benchmarkId: options.benchmarkManifest?.benchmarkId ?? null,
    serverEnvironment: serverEnvironment(options, "<private-index-cache>", "<private-log-dir>"),
    strategy: options.strategy ?? "server-default",
    sdkProfile: options.sdkProfile ?? "server-default",
    dependencyProfile: options.dependencyProfile ?? "server-default",
  }
}

async function waitForCatalog(session, timeoutMs) {
  const create = await session.transport.serverRequest(
    "window/workDoneProgress/create",
    () => true,
    timeoutMs,
  )
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  const token = create.params.token
  await session.transport.progress(
    token,
    (message) => message.params.value.kind === "begin",
    timeoutMs,
  )
  let latestMessage = null
  const deadline = Date.now() + timeoutMs
  while (true) {
    const progress = await session.transport.progress(token, (message) => (
      message.params.value.kind === "report" || message.params.value.kind === "end"
    ), Math.max(1, deadline - Date.now()))
    if (progress.params.value.message) latestMessage = progress.params.value.message
    if (progress.params.value.kind === "end") return latestMessage
  }
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

function readStructuredLogs(root) {
  if (!fs.existsSync(root)) return []
  const events = []
  for (const fileName of walkFiles(root)) {
    for (const line of fs.readFileSync(fileName, "utf8").split(/\r?\n/u)) {
      if (!line) continue
      try { events.push(JSON.parse(line)) } catch { /* preserve protocol output purity */ }
    }
  }
  return events
}

function walkFiles(root) {
  const files = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...walkFiles(target))
    else if (entry.isFile()) files.push(target)
  }
  return files.sort(ordinalCompare)
}

function readJsonLines(fileName) {
  if (!fs.existsSync(fileName)) return []
  return fs.readFileSync(fileName, "utf8").split(/\r?\n/u).filter(Boolean).map(JSON.parse)
}

function attachNearestRss(events, samples) {
  return events.map((event) => {
    const nearest = samples.reduce((best, sample) => (
      !best || Math.abs(sample.timestamp - event.timestamp) < Math.abs(best.timestamp - event.timestamp)
        ? sample
        : best
    ), null)
    return {
      ...event,
      nearestSampleTimestamp: nearest?.timestamp ?? null,
      productRssBytes: nearest?.totalRssBytes ?? null,
    }
  })
}

async function waitForSample(fileName, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (fs.existsSync(fileName) && fs.statSync(fileName).size > 0) return
    await delay(25)
  }
  throw new Error("external RSS sampler did not produce its first sample")
}

function childExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => child.once("exit", resolve))
}

function maxNullable(values) {
  const finite = values.filter(Number.isFinite)
  return finite.length > 0 ? Math.max(...finite) : null
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
