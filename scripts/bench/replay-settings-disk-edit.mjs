#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { LspSession } from "../../tests/support/lsp-session.mjs"
import { digestSdk } from "../semantic/lock-toolchain.mjs"
import {
  comparableLocations, loadOracle, normalizeReferences, validateLocations,
} from "./reference-location-oracle.mjs"
import {
  gitValue, projectRoot, readSdkMetadata, sha256File,
  validateBenchmarkManifest, validateInputs,
} from "./reference-replay-input.mjs"
import {
  attachNearestRss, childExit, delay, maxNullable, readJsonLines,
  readStructuredLogs, waitForCatalog, waitForSample,
} from "./reference-replay-evidence.mjs"

const expectedSha = "ecc550dfaed880e04e38a2477eb7235cd50475b9"
const consumerFile = "product/phone/src/main/ets/Setting/Home/controller/HomePageMenuManager.ets"
const declarationFile = "common/src/main/ets/sendable/HomeInitData.ets"
const position = { line: 40, character: 37 }
const symbol = "HomeInitData"
const declarationRange = (line) => ({
  start: { line, character: 13 }, end: { line, character: 25 },
})
const comment = "// S05 watched disk edit; semantic text unchanged.\n"
const defaultOracle = path.join(projectRoot, "bench/references/oracles/settings-homeinitdata-api24-no-declaration.json")
const samplerPath = path.join(projectRoot, "scripts/bench/sample-process-tree-rss.mjs")

const help = `Usage:
  node scripts/bench/replay-settings-disk-edit.mjs \\
    --workspace <clean Settings checkout> \\
    --sdk <API24 SDK path> \\
    --out <new report.json> \\
    --session-reuse <off|experimental>

Real Settings textDocument/definition before and after one watched disk edit,
then textDocument/references with exact Location oracle validation. The pinned
source checkout is never edited; a private local --no-hardlinks clone is used.

Options:
  --manifest <path>           pinned Settings edit-specific manifest
  --oracle <path>             default: pinned HomeInitData API24 oracle
  --server <path>             default: dist/server.cjs
  --sidecar <path>            default: target/release/arkts-index-sidecar
  --sample-interval-ms <ms>   default: 50 (actual intervals are recorded)
  --trace                     enable semantic lifecycle/references trace
  --help
`

try {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) process.stdout.write(help)
  else {
    const report = await replay(options)
    process.stdout.write(`SETTINGS_DISK_EDIT_REPLAY=${report.status}\nREPORT=${options.out}\n`)
    if (report.status !== "PASS") process.exitCode = 1
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}

function parseArguments(args) {
  if (args.length === 1 && args[0] === "--help") return { help: true }
  const values = new Map(), flags = new Set()
  const optional = new Set(["--manifest", "--oracle", "--server", "--sidecar", "--sample-interval-ms"])
  const required = ["--workspace", "--sdk", "--out", "--session-reuse"]
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]
    if (name === "--trace") {
      if (flags.has(name)) throw new Error(`${name} may appear only once`)
      flags.add(name)
      continue
    }
    if (![...required, ...optional].includes(name)) throw new Error(`unknown argument: ${name}`)
    if (values.has(name)) throw new Error(`${name} may appear only once`)
    const value = args[++index]
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`)
    values.set(name, value)
  }
  for (const name of required) if (!values.has(name)) throw new Error(`${name} is required`)
  const sessionReuse = values.get("--session-reuse")
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
    oracle: path.resolve(values.get("--oracle") ?? defaultOracle),
    manifest: values.has("--manifest") ? path.resolve(values.get("--manifest")) : null,
    server: path.resolve(values.get("--server") ?? path.join(projectRoot, "dist/server.cjs")),
    sidecar: path.resolve(values.get("--sidecar") ?? path.join(projectRoot, "target/release/arkts-index-sidecar")),
    file: consumerFile, symbol, position, includeDeclaration: false,
    sessionReuse, sampleIntervalMs, trace: flags.has("--trace"),
  }
}

async function replay(options) {
  if (fs.existsSync(options.out)) throw new Error(`output already exists: ${options.out}`)
  if (!fs.statSync(options.workspace).isDirectory()) throw new Error("workspace must be a directory")
  const originalRoot = fs.realpathSync(options.workspace)
  const destination = canonicalDestination(options.out)
  if (inside(destination, originalRoot)) throw new Error("BENCHMARK_BLOCKED=OUTPUT_INSIDE_SOURCE")
  if (fs.existsSync(options.sdk) && inside(destination, fs.realpathSync(options.sdk))) {
    throw new Error("BENCHMARK_BLOCKED=OUTPUT_INSIDE_SDK")
  }
  const topLevel = gitValue(originalRoot, ["rev-parse", "--show-toplevel"])
  if (!topLevel || fs.realpathSync(topLevel) !== originalRoot) {
    throw new Error("BENCHMARK_BLOCKED=WORKSPACE_NOT_REPOSITORY_ROOT")
  }
  const originalHead = gitValue(originalRoot, ["rev-parse", "HEAD"])
  const originalStatus = gitValue(originalRoot, ["status", "--porcelain", "--untracked-files=all"])
  if (originalStatus === null) throw new Error("BENCHMARK_BLOCKED=SOURCE_STATUS_UNAVAILABLE")
  if (originalStatus !== "") {
    throw new Error("BENCHMARK_BLOCKED=DIRTY_WORKSPACE")
  }
  validateInputs(options)
  if (originalHead !== expectedSha) throw new Error("BENCHMARK_BLOCKED=REPO_REVISION_MISMATCH")
  const sdkMetadata = readSdkMetadata(options.sdk)
  if (String(sdkMetadata?.apiVersion) !== "24" || sdkMetadata?.version !== "6.1.1.125") {
    throw new Error("BENCHMARK_BLOCKED=SDK_MISMATCH")
  }
  await validateBenchmarkManifest(options)
  const beforeSourceHash = sha256File(path.join(originalRoot, declarationFile))
  const beforeConsumerHash = sha256File(path.join(originalRoot, consumerFile))
  if (options.benchmarkManifest?.query.sourceSha256
    && options.benchmarkManifest.query.sourceSha256 !== beforeConsumerHash) {
    throw new Error("BENCHMARK_BLOCKED=QUERY_SOURCE_MISMATCH")
  }
  const sdkDigest = options.sdkDeclarationDigest ?? await digestSdk(options.sdk)
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-settings-disk-edit-"))
  try {
    const clone = path.join(temporary, "settings")
    execFileSync("git", ["clone", "--local", "--no-hardlinks", "--quiet", "--no-checkout",
      originalRoot, clone], { stdio: "pipe" })
    execFileSync("git", ["-C", clone, "checkout", "--detach", "--quiet", expectedSha], { stdio: "pipe" })
    const cloneStatus = gitValue(clone, ["status", "--porcelain", "--untracked-files=all"])
    if (cloneStatus === null) throw new Error("BENCHMARK_BLOCKED=CLONE_STATUS_UNAVAILABLE")
    if (gitValue(clone, ["rev-parse", "HEAD"]) !== originalHead || cloneStatus !== "") {
      throw new Error("BENCHMARK_BLOCKED=CLONE_IDENTITY_MISMATCH")
    }
    if (sha256File(path.join(clone, declarationFile)) !== beforeSourceHash
      || sha256File(path.join(clone, consumerFile)) !== beforeConsumerHash) {
      throw new Error("BENCHMARK_BLOCKED=CLONE_SOURCE_MISMATCH")
    }
    const report = await replayClone(options, {
      clone, temporary, originalRoot, originalHead, sdkMetadata, sdkDigest,
      beforeSourceHash, beforeConsumerHash,
    })
    const finalSourceStatus = gitValue(originalRoot, ["status", "--porcelain", "--untracked-files=all"])
    const sourcePreserved = gitValue(originalRoot, ["rev-parse", "HEAD"]) === originalHead
      && finalSourceStatus === ""
      && sha256File(path.join(originalRoot, declarationFile)) === beforeSourceHash
      && sha256File(path.join(originalRoot, consumerFile)) === beforeConsumerHash
    report.sourcePreserved = sourcePreserved
    report.sourceStatusError = finalSourceStatus === null ? "SOURCE_STATUS_UNAVAILABLE" : null
    if (!sourcePreserved) report.status = "FAIL"
    fs.mkdirSync(path.dirname(options.out), { recursive: true })
    fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" })
    return report
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
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

function effectiveEnvironment(options, cacheDir, logDir) {
  const configured = {
    ARKTS_INDEX_CACHE_DIR: cacheDir,
    ARKTS_INDEX_SIDECAR_PATH: options.sidecar,
    ARKTS_LSP_LOG_DIR: logDir,
    ARKTS_SEMANTIC_SESSION_REUSE: options.sessionReuse,
    ARKTS_REFERENCES_TRACE: options.trace ? "1" : "0",
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
  const { clone, temporary } = input
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
  if (consumerText.split("\n")[position.line]?.slice(position.character, position.character + 12) !== symbol
    || declarationText.split("\n")[16]?.slice(13, 25) !== symbol) {
    throw new Error("BENCHMARK_BLOCKED=PINNED_SYMBOL_POSITION_MISMATCH")
  }
  const originalOracle = loadOracle(options.oracle, clone)
  if (originalOracle.locations.length !== 9) throw new Error("BENCHMARK_BLOCKED=ORACLE_COUNT_MISMATCH")
  const adjustedOracle = { locations: originalOracle.locations.map(location => (
    location.file === declarationFile
      ? { file: location.file, range: shifted(location.range) } : location
  )) }
  const consumerUri = pathToFileURL(consumerPath).href
  const declarationUri = pathToFileURL(declarationPath).href
  const events = []
  const mark = (phase, details = {}) => events.push({
    phase, timestamp: Date.now(), monotonicNs: process.hrtime.bigint().toString(),
    harnessRssBytes: process.memoryUsage().rss, ...details,
  })
  const session = new LspSession({
    command: process.execPath, args: [options.server, "--stdio"], cwd: projectRoot,
    rootUri: pathToFileURL(clone).href, env: environment,
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
  let samplerStderr = ""
  sampler.stderr.setEncoding("utf8")
  sampler.stderr.on("data", chunk => { samplerStderr += chunk })
  let catalog = null, diagnostic = null, failure = null, closeResult = null
  const receivedDiagnostics = []
  let beforeDefinition = null, afterDefinition = null, references = null
  let catalogPromise = null, closing = false
  const request = async (method, params) => {
    mark("request.start", { method })
    const started = Date.now()
    const response = await session.request(method, params, { timeoutMs: 180_000 })
    mark("request.complete", { method, elapsedMs: Date.now() - started,
      error: response.error ?? null })
    if (response.error) throw new Error(`${method} failed: ${JSON.stringify(response.error)}`)
    return response.result
  }
  const definition = async () => request("textDocument/definition", {
    textDocument: { uri: consumerUri }, position,
  })
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
    const diagnosticPromise = (async () => {
      const deadline = Date.now() + 180_000
      while (true) {
        const message = await session.transport.notification("textDocument/publishDiagnostics",
          () => true, Math.max(1, deadline - Date.now()))
        const metadata = { timestamp: Date.now(), version: message.params?.version ?? null,
          uriMatchesConsumer: message.params?.uri === consumerUri,
          count: message.params?.diagnostics?.length ?? 0 }
        receivedDiagnostics.push(metadata)
        mark("publishDiagnostics.received", metadata)
        if (metadata.uriMatchesConsumer && metadata.version === 1) {
          diagnostic = { ...metadata, diagnostics: message.params.diagnostics ?? [] }
          return
        }
      }
    })().catch(error => {
      diagnostic = { timeout: true, error: error.message.split(". stderr:")[0] }
      mark("publishDiagnostics.not-observed", diagnostic)
    })
    session.openDocument({ uri: consumerUri, version: 1, text: consumerText })
    mark("didOpen.sent", { uri: consumerUri, version: 1 })
    beforeDefinition = definitionEvidence(await definition(), declarationUri, 16)
    mark("definition.before-validated", { exact: beforeDefinition.exact })
    if (!beforeDefinition.exact) throw new Error("initial definition differs from pinned declaration")
    await diagnosticPromise
    if (diagnostic?.timeout) throw new Error("v1 diagnostics were not published before disk edit")
    const editedText = comment + declarationText
    fs.writeFileSync(declarationPath, editedText)
    mark("disk-edit.complete", { beforeSha256: input.beforeSourceHash,
      afterSha256: sha256File(declarationPath) })
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: declarationUri, type: 2 }] } })
    mark("watched-change.sent", { type: 2, uri: declarationUri })
    afterDefinition = definitionEvidence(await definition(), declarationUri, 17)
    mark("definition.after-validated", { exact: afterDefinition.exact })
    if (!afterDefinition.exact) throw new Error("post-edit definition did not shift exactly one line")
    const result = await request("textDocument/references", {
      textDocument: { uri: consumerUri }, position,
      context: { includeDeclaration: false },
    })
    const normalized = normalizeReferences(result)
    const comparable = comparableLocations(normalized, clone)
    const validation = validateLocations(normalized, comparable, adjustedOracle, clone)
    references = { normalized, comparable, validation }
    mark("references.validated", { exact: validation.pass, count: normalized.length })
    await delay(1_000)
    mark("idle.complete")
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
  return makeReport(options, input, {
    environment, targetPid, samplerPid: sampler.pid, samplesPath, logDir,
    events, catalog, diagnostic, receivedDiagnostics, beforeDefinition, afterDefinition, references,
    session, samplerStderr, closeResult, failure, declarationPath,
    adjustedOracle,
  })
}

function makeReport(options, input, run) {
  const {
    environment, targetPid, samplerPid, samplesPath, logDir, events, catalog,
    diagnostic, receivedDiagnostics, beforeDefinition, afterDefinition, references, session,
    samplerStderr, closeResult, failure, declarationPath, adjustedOracle,
  } = run
  const samples = readJsonLines(samplesPath)
  const transcript = session.transport.diagnosticSnapshot().transcript
  const methods = transcript.entries.filter(entry => entry.direction === "send" && entry.method)
    .map(entry => entry.method)
  const forbiddenSymbolRequests = methods.filter(method => method === "workspace/symbol"
    || method === "textDocument/documentSymbol")
  const peakNodeRssBytes = maxNullable(samples.map(sample => sample.processes
    .find(value => value.role === "server" && value.pid === targetPid)?.rssBytes))
  const sampleIntervalsMs = samples.slice(1).map((sample, index) => (
    sample.timestamp - samples[index].timestamp
  ))
  const timeline = attachNearestRss(events, samples).map(event => {
    const sample = samples.find(value => value.timestamp === event.nearestSampleTimestamp)
    return { ...event, nodeRssBytes: sample?.processes
      .find(value => value.role === "server" && value.pid === targetPid)?.rssBytes ?? null }
  })
  const cloneStatusAfter = gitValue(input.clone, ["status", "--porcelain", "--untracked-files=all"])
  return {
    schemaVersion: 1,
    status: cloneStatusAfter !== null && !failure && beforeDefinition?.exact && afterDefinition?.exact
      && references?.validation.pass && !diagnostic?.timeout && diagnostic?.version === 1
      && closeResult?.exit?.code === 0 && !samplerStderr && samples.length > 0
      && forbiddenSymbolRequests.length === 0 ? "PASS" : "FAIL",
    benchmarkId: "settings-homeinitdata-s05-real-watched-disk-edit-api24",
    environment: {
      sourceWorkspace: input.originalRoot, sourceHead: input.originalHead,
      sourceCleanBefore: true, cloneKind: "private-local-no-hardlinks",
      cloneHead: gitValue(input.clone, ["rev-parse", "HEAD"]),
      cloneStatusAfter,
      sdk: options.sdk, sdkMetadata: input.sdkMetadata, sdkDeclarationDigest: input.sdkDigest,
      node: process.execPath, nodeVersion: process.version,
      platform: `${os.type()} ${os.release()} ${os.arch()}`,
      server: options.server, serverSha256: sha256File(options.server),
      sidecar: options.sidecar, sidecarSha256: sha256File(options.sidecar),
      oracle: options.oracle, oracleSha256: sha256File(options.oracle),
      manifest: options.manifest, manifestSha256: options.manifest ? sha256File(options.manifest) : null,
      launch: { command: process.execPath, args: [options.server, "--stdio"] },
      effectiveArktsEnvironment: Object.fromEntries(Object.entries(environment)
        .filter(([name]) => name.startsWith("ARKTS_")).map(([name, value]) => (
          [name, name.endsWith("_DIR") ? "<private>" : value]
        ))),
      sessionReuse: options.sessionReuse, trace: options.trace,
    },
    target: {
      file: consumerFile, symbol, position, declarationFile,
      expectedBefore: declarationRange(16), expectedAfter: declarationRange(17),
      includeDeclaration: false, consumerSourceSha256: input.beforeConsumerHash,
      declarationSourceSha256: input.beforeSourceHash,
      editedDeclarationSha256: sha256File(declarationPath), diskEdit: "prepend-one-comment-line",
    },
    targetPid, samplerPid, catalog, diagnostic, receivedDiagnostics,
    definitions: { before: beforeDefinition, after: afterDefinition },
    references, expectedComparableLocations: adjustedOracle.locations,
    requestEvidence: { methods, forbiddenSymbolRequests,
      protocolEntryCount: transcript.totalEntries,
      receivedMethodChronology: transcript.entries
        .filter(entry => entry.direction === "receive")
        .map(({ sequence, kind, method }) => ({ sequence, kind, method })) },
    memory: {
      measurementKind: "external-process-tree-rss", sampleIntervalMs: options.sampleIntervalMs,
      observedSampleIntervalsMs: sampleIntervalsMs,
      sampleCount: samples.length, peakNodeRssBytes,
      peakTreeRssBytes: maxNullable(samples.map(sample => sample.totalRssBytes)),
      peakSamplerRssBytes: maxNullable(samples.map(sample => sample.samplerRssBytes)),
      peakHarnessRssBytes: maxNullable(events.map(event => event.harnessRssBytes)), samples,
    },
    timeline,
    serverEvents: readStructuredLogs(logDir), samplerStderr, closeResult, failure,
  }
}

function definitionEvidence(value, uri, line) {
  const observed = Array.isArray(value) ? value : value ? [value] : []
  const expected = [{ uri, range: declarationRange(line) }]
  return { observed, expected, exact: JSON.stringify(observed) === JSON.stringify(expected) }
}

function shifted(range) {
  return { start: { ...range.start, line: range.start.line + 1 },
    end: { ...range.end, line: range.end.line + 1 } }
}
