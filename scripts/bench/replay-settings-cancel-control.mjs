#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { LspSession } from "../../tests/support/lsp-session.mjs"
import {
  comparableLocations, loadOracle, normalizeReferences, validateLocations,
} from "./reference-location-oracle.mjs"
import {
  gitValue, projectRoot, sha256File, validateBenchmarkManifest, validateInputs,
} from "./reference-replay-input.mjs"
import {
  attachNearestRss, childExit, delay, maxNullable, readJsonLines, readStructuredLogs,
  waitForCatalog, waitForSample,
} from "./reference-replay-evidence.mjs"

const defaultManifest = path.join(projectRoot,
  "bench/references/manifests/settings-homeinitdata-mixed-ops-api24.json")
const defaultOracle = path.join(projectRoot,
  "bench/references/oracles/settings-homeinitdata-api24-no-declaration.json")
const consumerFile = "product/phone/src/main/ets/Setting/Home/controller/HomePageMenuManager.ets"
const declarationFile = "common/src/main/ets/sendable/HomeInitData.ets"
const position = { line: 40, character: 37 }
const timeoutMs = 180_000
const samplerPath = path.join(projectRoot, "scripts/bench/sample-process-tree-rss.mjs")

const help = `Usage:
  node scripts/bench/replay-settings-cancel-control.mjs \\
    --workspace <clean Settings checkout> \\
    --sdk <API24 SDK path> \\
    --out <new report.json> \\
    --session-reuse <off|experimental>  (default: off)

Runs textDocument/references, synchronizes on observed batch scheduling
(before verifier creation, not proof of verifier-in-flight), then sends
$/cancelRequest for its explicit ID and validates fresh
textDocument/references and textDocument/definition recovery. Trace is on for
this control and its latency is not a product timing sample.

Options:
  --manifest <path>           pinned Settings/API24 manifest
  --oracle <path>             pinned nine-Location oracle
  --server <path>             default: dist/server.cjs
  --sidecar <path>            default: target/release/arkts-index-sidecar
  --sample-interval-ms <ms>   default: 50
  --help
`

try {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) process.stdout.write(help)
  else {
    const report = await replay(options)
    process.stdout.write(`SETTINGS_CANCEL_CONTROL=${report.status}\nREPORT=${options.out}\n`)
    if (report.status !== "PASS") process.exitCode = 1
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}

function parseArguments(args) {
  if (args.length === 1 && args[0] === "--help") return { help: true }
  const values = new Map()
  const names = new Set(["--workspace", "--sdk", "--out", "--session-reuse", "--manifest",
    "--oracle", "--server", "--sidecar", "--sample-interval-ms"])
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]
    const value = args[index + 1]
    if (!names.has(name)) throw new Error(`unknown argument: ${name}`)
    if (values.has(name)) throw new Error(`${name} may appear only once`)
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`)
    values.set(name, value)
  }
  for (const name of ["--workspace", "--sdk", "--out"]) {
    if (!values.has(name)) throw new Error(`${name} is required`)
  }
  const sessionReuse = values.get("--session-reuse") ?? "off"
  if (sessionReuse !== "off" && sessionReuse !== "experimental") {
    throw new Error("--session-reuse must be off or experimental")
  }
  const sampleIntervalMs = Number(values.get("--sample-interval-ms") ?? "50")
  if (!Number.isSafeInteger(sampleIntervalMs) || sampleIntervalMs <= 0) {
    throw new Error("--sample-interval-ms must be a positive integer")
  }
  return {
    workspace: path.resolve(values.get("--workspace")),
    sdk: path.resolve(values.get("--sdk")),
    out: path.resolve(values.get("--out")),
    sessionReuse,
    manifest: path.resolve(values.get("--manifest") ?? defaultManifest),
    oracle: path.resolve(values.get("--oracle") ?? defaultOracle),
    server: path.resolve(values.get("--server") ?? path.join(projectRoot, "dist/server.cjs")),
    sidecar: path.resolve(values.get("--sidecar")
      ?? path.join(projectRoot, "target/release/arkts-index-sidecar")),
    sampleIntervalMs,
    file: consumerFile, symbol: "HomeInitData", position, includeDeclaration: false,
  }
}

async function replay(options) {
  const originalRoot = validateOutput(options)
  const originalHead = validateSource(originalRoot)
  validateInputs(options)
  await validateBenchmarkManifest(options)
  const manifest = options.benchmarkManifest
  if (manifest.oracle.expectedLocationCount !== 9 || !Array.isArray(manifest.query.expectedDiagnostics)
    || manifest.watchedEdit?.file !== declarationFile
    || manifest.watchedEdit.expectedDefinitionBefore?.line !== 16
    || manifest.watchedEdit.expectedDefinitionBefore?.character !== 13) {
    throw new Error("BENCHMARK_BLOCKED=CANCEL_CONTROL_MANIFEST_MISMATCH")
  }
  const beforeConsumerHash = sha256File(path.join(originalRoot, consumerFile))
  const beforeDeclarationHash = sha256File(path.join(originalRoot, declarationFile))
  if (beforeConsumerHash !== manifest.query.sourceSha256
    || beforeDeclarationHash !== manifest.watchedEdit.sourceSha256) {
    throw new Error("BENCHMARK_BLOCKED=SOURCE_MISMATCH")
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-settings-cancel-control-"))
  try {
    const clone = path.join(temporary, "settings")
    execFileSync("git", ["clone", "--local", "--no-hardlinks", "--quiet", "--no-checkout",
      originalRoot, clone], { stdio: "pipe" })
    execFileSync("git", ["-C", clone, "checkout", "--detach", "--quiet", originalHead],
      { stdio: "pipe" })
    if (gitValue(clone, ["rev-parse", "HEAD"]) !== originalHead
      || gitValue(clone, ["status", "--porcelain", "--untracked-files=all"]) !== ""
      || sha256File(path.join(clone, consumerFile)) !== beforeConsumerHash
      || sha256File(path.join(clone, declarationFile)) !== beforeDeclarationHash) {
      throw new Error("BENCHMARK_BLOCKED=CLONE_IDENTITY_MISMATCH")
    }
    const report = await replayClone(options, {
      originalRoot, originalHead, clone, temporary, manifest,
      beforeConsumerHash, beforeDeclarationHash,
    })
    const finalStatus = gitValue(originalRoot, ["status", "--porcelain", "--untracked-files=all"])
    report.sourcePreserved = finalStatus === ""
      && gitValue(originalRoot, ["rev-parse", "HEAD"]) === originalHead
      && sha256File(path.join(originalRoot, consumerFile)) === beforeConsumerHash
      && sha256File(path.join(originalRoot, declarationFile)) === beforeDeclarationHash
    if (!report.sourcePreserved) report.status = "FAIL"
    fs.mkdirSync(path.dirname(options.out), { recursive: true })
    fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" })
    return report
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}

function effectiveEnvironment(options, cacheDir, logDir) {
  const configured = {
    ARKTS_INDEX_CACHE_DIR: cacheDir,
    ARKTS_INDEX_SIDECAR_PATH: options.sidecar,
    ARKTS_LSP_LOG_DIR: logDir,
    ARKTS_SEMANTIC_SESSION_REUSE: options.sessionReuse,
    ARKTS_REFERENCES_TRACE: "1",
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
    ARKLINE_HARMONY_SDK_PATH: options.sdk,
    DEVECO_SDK_HOME: options.sdk,
  }
  const unknown = Object.keys(process.env)
    .filter(name => name.startsWith("ARKTS_") && !(name in configured))
  if (unknown.length) throw new Error(`BENCHMARK_BLOCKED=UNCONTROLLED_ARKTS_ENV:${unknown.join(",")}`)
  return configured
}

async function replayClone(options, input) {
  const { clone, temporary, manifest } = input
  const cacheDir = path.join(temporary, "index-cache")
  const logDir = path.join(temporary, "logs")
  const samplesPath = path.join(temporary, "rss.jsonl")
  fs.mkdirSync(cacheDir)
  fs.mkdirSync(logDir)
  const environment = effectiveEnvironment(options, cacheDir, logDir)
  const consumerPath = path.join(clone, consumerFile)
  const declarationPath = path.join(clone, declarationFile)
  const consumerText = fs.readFileSync(consumerPath, "utf8")
  const declarationText = fs.readFileSync(declarationPath, "utf8")
  if (consumerText.split("\n")[position.line]?.slice(position.character, position.character + 12)
    !== "HomeInitData" || declarationText.split("\n")[16]?.slice(13, 25) !== "HomeInitData") {
    throw new Error("BENCHMARK_BLOCKED=PINNED_SYMBOL_POSITION_MISMATCH")
  }
  const oracle = loadOracle(options.oracle, clone)
  if (oracle.locations.length !== 9) throw new Error("BENCHMARK_BLOCKED=ORACLE_COUNT_MISMATCH")
  const consumerUri = pathToFileURL(consumerPath).href
  const declarationUri = pathToFileURL(declarationPath).href
  const timeline = []
  const mark = (phase, details = {}) => timeline.push({
    phase, timestamp: Date.now(), monotonicNs: process.hrtime.bigint().toString(),
    harnessRssBytes: process.memoryUsage().rss, ...details,
  })
  const session = new LspSession({
    command: process.execPath, args: [options.server, "--stdio"], cwd: projectRoot,
    rootUri: pathToFileURL(clone).href, env: environment,
    capabilities: { general: { positionEncodings: ["utf-16"] },
      window: { workDoneProgress: true },
      textDocument: { publishDiagnostics: { versionSupport: true } } },
  })
  const targetPid = session.transport.child.pid
  const sampler = spawn(process.execPath,
    [samplerPath, String(targetPid), samplesPath, String(options.sampleIntervalMs)],
    { cwd: projectRoot, stdio: ["ignore", "ignore", "pipe"] })
  let samplerStderr = "", catalog = null, diagnostic = null, closeResult = null
  let cancellation = null, recovery = null, failure = null, stageUnavailable = false
  let samplerExit = null
  sampler.stderr.setEncoding("utf8")
  sampler.stderr.on("data", chunk => { samplerStderr += chunk })
  try {
    await waitForSample(samplesPath, 10_000)
    mark("server-process-started", { targetPid, samplerPid: sampler.pid })
    await session.initialize({ initializationOptions: { sdk: { path: options.sdk } }, timeoutMs })
    mark("initialize.complete")
    catalog = await waitForCatalog(session, timeoutMs)
    mark("catalog.complete", { message: catalog })
    const diagnosticPromise = session.transport.notification("textDocument/publishDiagnostics",
      message => message.params?.uri === consumerUri && message.params?.version === 1, timeoutMs)
    session.openDocument({ uri: consumerUri, version: 1, text: consumerText })
    mark("didOpen.sent", { uri: consumerUri, version: 1 })
    const diagnosticMessage = await diagnosticPromise
    diagnostic = { observed: diagnosticMessage.params.diagnostics ?? [],
      expected: manifest.query.expectedDiagnostics,
      version: diagnosticMessage.params.version,
      exact: sameDiagnostics(diagnosticMessage.params.diagnostics ?? [],
        manifest.query.expectedDiagnostics) }
    mark("diagnostic.received", { exact: diagnostic.exact,
      count: diagnostic.observed.length })

    const priorTraceIds = new Set(readStructuredLogs(logDir)
      .filter(event => event.event === "references.queue.start")
      .map(event => event.traceId).filter(Boolean))
    const requestId = session.nextRequestId++
    const params = { textDocument: { uri: consumerUri }, position,
      context: { includeDeclaration: false } }
    session.transport.send({ jsonrpc: "2.0", id: requestId,
      method: "textDocument/references", params })
    mark("references.cancel-target.sent", { requestId })
    let terminal = null
    const terminalPromise = session.transport.response(requestId, timeoutMs)
    void terminalPromise.then(response => { terminal = { response } }, error => { terminal = { error } })
    const stage = await waitForBatchScheduled(logDir, session, requestId, priorTraceIds,
      () => terminal)
    mark("references.cancel-stage", stage)
    const sent = stage.state === "batch-scheduled" && terminal === null
      && !hasReceivedResponse(session, requestId)
    if (sent) {
      session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest",
        params: { id: requestId } })
      mark("cancelRequest.sent", { requestId, stage: stage.event.event })
    }
    let response = null, responseError = null
    try { response = await terminalPromise }
    catch (error) { responseError = error.message }
    mark("references.cancel-target.terminal", { requestId,
      error: response?.error ?? responseError, hasResult: Object.hasOwn(response ?? {}, "result") })
    stageUnavailable = stage.state === "missing"
    const outcome = sent && response?.error?.code === -32800
      && !Object.hasOwn(response, "result") ? "PASS"
      : response && Object.hasOwn(response, "result") ? "NOT_CANCELLED" : "FAIL"
    cancellation = { requestId, stage, evidenceScope: "batch-scheduled-before-verifier",
      sent, response, responseError, outcome }
    if (!response) throw new Error(responseError ?? "cancel target had no terminal response")
    const recoveredReferences = await session.request("textDocument/references", params, { timeoutMs })
    const normalized = normalizeReferences(recoveredReferences.result)
    const comparable = comparableLocations(normalized, clone)
    const validation = validateLocations(normalized, comparable, oracle, clone)
    mark("references.recovery.complete", { exact: validation.pass, count: normalized.length,
      error: recoveredReferences.error ?? null })
    const recoveredDefinition = await session.request("textDocument/definition", {
      textDocument: { uri: consumerUri }, position,
    }, { timeoutMs })
    const expectedDefinition = [{ uri: declarationUri, range: {
      start: { line: 16, character: 13 }, end: { line: 16, character: 25 },
    } }]
    const observedDefinition = Array.isArray(recoveredDefinition.result)
      ? recoveredDefinition.result : recoveredDefinition.result ? [recoveredDefinition.result] : []
    const definitionExact = !recoveredDefinition.error
      && JSON.stringify(observedDefinition) === JSON.stringify(expectedDefinition)
    mark("definition.recovery.complete", { exact: definitionExact,
      error: recoveredDefinition.error ?? null })
    recovery = { references: { response: recoveredReferences, normalized, comparable, validation },
      definition: { response: recoveredDefinition, observed: observedDefinition,
        expected: expectedDefinition, exact: definitionExact } }
  } catch (error) {
    failure = { name: error.name, message: error.message }
    mark("failure", failure)
  } finally {
    closeResult = await session.close({ timeoutMs: 10_000 }).catch(async error => {
      await session.transport.close().catch(() => {})
      return { error: error.message }
    })
    mark("server-process-closed", { closeResult })
    sampler.kill("SIGINT")
    await childExit(sampler)
    samplerExit = { code: sampler.exitCode, signal: sampler.signalCode }
  }
  return makeReport(options, input, {
    environment, logDir, samplesPath, targetPid, samplerPid: sampler.pid,
    timeline, catalog, diagnostic, cancellation, recovery, closeResult,
    session, samplerStderr, samplerExit, failure, stageUnavailable,
  })
}

async function waitForBatchScheduled(logDir, session, requestId, priorTraceIds, terminal) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (terminal() || hasReceivedResponse(session, requestId)) return { state: "terminal" }
    const events = readStructuredLogs(logDir)
    if (events.some(event => event.event === "request.completed"
      && event.method === "textDocument/references")) return { state: "terminal" }
    const queueTraceIds = new Set(events.filter(event => event.event === "references.queue.start")
      .map(event => event.traceId).filter(traceId => traceId && !priorTraceIds.has(traceId)))
    const completed = events.filter(event => event.event === "references.batch.complete")
    const active = events.filter(event => event.event === "references.batch.start")
      .findLast(start => queueTraceIds.has(start.traceId)
        && !completed.some(end => end.referenceSession === start.referenceSession
        && end.batchIndex === start.batchIndex))
    if (active) return { state: "batch-scheduled", event: active }
    await delay(10)
  }
  return { state: "missing", reason: "NO_OBSERVED_IN_FLIGHT_BATCH" }
}

function hasReceivedResponse(session, id) {
  return session.transport.diagnosticSnapshot().transcript.entries.some(entry => (
    entry.direction === "receive" && entry.kind === "response" && entry.id === id
  ))
}

function sameDiagnostics(observed, expected) {
  const fields = value => ({ range: value.range, severity: value.severity,
    code: value.code, source: value.source, message: value.message })
  return JSON.stringify(observed.map(fields)) === JSON.stringify(expected.map(fields))
}

function makeReport(options, input, run) {
  const samples = readJsonLines(run.samplesPath)
  const cloneStatusAfter = gitValue(input.clone, ["status", "--porcelain", "--untracked-files=all"])
  const transcript = run.session.transport.diagnosticSnapshot().transcript
  const receivedTargetResponses = transcript.entries.filter(entry => entry.direction === "receive"
    && entry.kind === "response" && entry.id === run.cancellation?.requestId)
  const goodRun = cloneStatusAfter === "" && !run.failure && run.diagnostic?.exact
    && run.recovery?.references?.validation.pass
    && !run.recovery?.references?.response?.error && run.recovery?.definition?.exact
    && run.closeResult?.exit?.code === 0 && run.samplerExit?.code === 0
    && !run.samplerStderr && samples.length > 0
    && transcript.droppedEntries === 0 && receivedTargetResponses.length === 1
  const status = !goodRun ? run.stageUnavailable ? "BLOCKED" : "FAIL"
    : run.cancellation?.outcome === "PASS" ? "PASS"
      : run.cancellation?.outcome === "NOT_CANCELLED" ? "NOT_CANCELLED" : "FAIL"
  const peakNodeRssBytes = maxNullable(samples.map(sample => sample.processes
    .find(value => value.role === "server" && value.pid === run.targetPid)?.rssBytes))
  const sampleIntervalsMs = samples.slice(1).map((sample, index) => (
    sample.timestamp - samples[index].timestamp
  ))
  const timeline = attachNearestRss(run.timeline, samples).map(event => {
    const sample = samples.find(value => value.timestamp === event.nearestSampleTimestamp)
    return { ...event, nodeRssBytes: sample?.processes
      .find(value => value.role === "server" && value.pid === run.targetPid)?.rssBytes ?? null }
  })
  return {
    schemaVersion: 1, status,
    benchmarkId: "settings-homeinitdata-s05-cancel-control-api24",
    sourceBenchmarkId: input.manifest.benchmarkId,
    environment: {
      sourceWorkspace: input.originalRoot, sourceHead: input.originalHead,
      sourceCleanBefore: true, cloneKind: "private-local-no-hardlinks",
      cloneHead: gitValue(input.clone, ["rev-parse", "HEAD"]), cloneStatusAfter,
      sdk: options.sdk, sdkDeclarationDigest: options.sdkDeclarationDigest,
      node: process.execPath, nodeVersion: process.version,
      platform: `${os.type()} ${os.release()} ${os.arch()}`,
      server: options.server, serverSha256: sha256File(options.server),
      sidecar: options.sidecar, sidecarSha256: sha256File(options.sidecar),
      oracle: options.oracle, oracleSha256: sha256File(options.oracle),
      manifest: options.manifest, manifestSha256: sha256File(options.manifest),
      launch: { command: process.execPath, args: [options.server, "--stdio"] },
      effectiveArktsEnvironment: Object.fromEntries(Object.entries(run.environment)
        .filter(([name]) => name.startsWith("ARKTS_")).map(([name, value]) => (
          [name, name.endsWith("_DIR") ? "<private>" : value]
        ))),
      sessionReuse: options.sessionReuse, trace: true,
    },
    target: { file: consumerFile, symbol: options.symbol, position,
      declarationFile, includeDeclaration: false,
      consumerSourceSha256: input.beforeConsumerHash,
      declarationSourceSha256: input.beforeDeclarationHash },
    targetPid: run.targetPid, samplerPid: run.samplerPid,
    catalog: run.catalog, diagnostic: run.diagnostic,
    cancellation: run.cancellation, recovery: run.recovery,
    requestEvidence: { protocolEntryCount: transcript.totalEntries,
      droppedProtocolEntries: transcript.droppedEntries,
      receivedTargetResponseCount: receivedTargetResponses.length,
      entries: transcript.entries },
    memory: { measurementKind: "external-process-tree-rss",
      sampleIntervalMs: options.sampleIntervalMs,
      observedSampleIntervalsMs: sampleIntervalsMs,
      sampleCount: samples.length, peakNodeRssBytes,
      peakTreeRssBytes: maxNullable(samples.map(sample => sample.totalRssBytes)),
      peakSamplerRssBytes: maxNullable(samples.map(sample => sample.samplerRssBytes)),
      peakHarnessRssBytes: maxNullable(run.timeline.map(event => event.harnessRssBytes)),
      samples },
    timeline, serverEvents: readStructuredLogs(run.logDir),
    samplerStderr: run.samplerStderr, samplerExit: run.samplerExit,
    closeResult: run.closeResult,
    failure: run.failure,
  }
}

function validateOutput(options) {
  if (fs.existsSync(options.out)) throw new Error(`output already exists: ${options.out}`)
  const originalRoot = fs.realpathSync(options.workspace)
  const destination = canonicalDestination(options.out)
  if (inside(destination, originalRoot)) throw new Error("BENCHMARK_BLOCKED=OUTPUT_INSIDE_SOURCE")
  if (fs.existsSync(options.sdk) && inside(destination, fs.realpathSync(options.sdk))) {
    throw new Error("BENCHMARK_BLOCKED=OUTPUT_INSIDE_SDK")
  }
  return originalRoot
}

function validateSource(originalRoot) {
  const topLevel = gitValue(originalRoot, ["rev-parse", "--show-toplevel"])
  if (!topLevel || fs.realpathSync(topLevel) !== originalRoot) {
    throw new Error("BENCHMARK_BLOCKED=WORKSPACE_NOT_REPOSITORY_ROOT")
  }
  const status = gitValue(originalRoot, ["status", "--porcelain", "--untracked-files=all"])
  if (status === null) throw new Error("BENCHMARK_BLOCKED=SOURCE_STATUS_UNAVAILABLE")
  if (status !== "") throw new Error("BENCHMARK_BLOCKED=DIRTY_WORKSPACE")
  return gitValue(originalRoot, ["rev-parse", "HEAD"])
}

function canonicalDestination(fileName) {
  let directory = path.dirname(fileName)
  const missing = []
  while (!fs.existsSync(directory)) {
    missing.unshift(path.basename(directory))
    directory = path.dirname(directory)
  }
  return path.join(fs.realpathSync(directory), ...missing, path.basename(fileName))
}

function inside(target, root) {
  const relative = path.relative(root, target)
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative))
}
