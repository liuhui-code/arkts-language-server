#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { LspSession } from "../../tests/support/lsp-session.mjs"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-references-replay-"))
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
    status: !failure && allExact && forbiddenSymbolRequests.length === 0 ? "PASS" : "FAIL",
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
    node: process.execPath,
    nodeVersion: process.version,
    platform: `${os.type()} ${os.release()} ${os.arch()}`,
    server: options.server,
    serverSha256: sha256File(options.server),
    sidecar: options.sidecar,
    sidecarSha256: sha256File(options.sidecar),
    launch: { command: process.execPath, args: [options.server, "--stdio"] },
    strategy: options.strategy ?? "server-default",
    sdkProfile: options.sdkProfile ?? "server-default",
    dependencyProfile: options.dependencyProfile ?? "server-default",
  }
}

function readSdkMetadata(sdkRoot) {
  const manifest = path.join(sdkRoot, "ets", "oh-uni-package.json")
  return fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, "utf8")) : null
}

function sha256File(fileName) {
  return crypto.createHash("sha256").update(fs.readFileSync(fileName)).digest("hex")
}

function gitValue(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim()
  } catch {
    return null
  }
}

function loadOracle(fileName, currentWorkspace) {
  const value = JSON.parse(fs.readFileSync(fileName, "utf8"))
  const locations = Array.isArray(value) ? value : value.normalizedReferences
  if (!Array.isArray(locations)) {
    throw new Error("oracle must be a Location array or a replay report with normalizedReferences")
  }
  const oracleWorkspace = Array.isArray(value) ? currentWorkspace : value.environment?.workspace
  if (!oracleWorkspace) throw new Error("oracle report does not identify its workspace")
  return { locations: comparableLocations(normalizeReferences(locations), oracleWorkspace) }
}

function validateLocations(locations, comparable, expected, workspace) {
  const errors = []
  for (const location of locations) {
    try {
      const fileName = fileURLToPath(location.uri)
      const relative = path.relative(workspace, fileName)
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        errors.push(`reference outside workspace: ${location.uri}`)
        continue
      }
      validateRange(fs.readFileSync(fileName, "utf8"), location.range)
    } catch (error) {
      errors.push(error.message)
    }
  }
  if (!same(comparable, expected.locations)) errors.push("normalized Location set differs from oracle")
  return {
    pass: errors.length === 0,
    expectedCount: expected.locations.length,
    observedCount: locations.length,
    errors,
  }
}

function validateRange(text, range) {
  const lines = text.split(/\r?\n/u)
  const { start, end } = range ?? {}
  if (!validPosition(start, lines) || !validPosition(end, lines)) {
    throw new Error("reference has an invalid UTF-16 range")
  }
  if (end.line < start.line || (end.line === start.line && end.character < start.character)) {
    throw new Error("reference range ends before it starts")
  }
}

function validPosition(position, lines) {
  return Number.isSafeInteger(position?.line)
    && position.line >= 0
    && position.line < lines.length
    && Number.isSafeInteger(position.character)
    && position.character >= 0
    && position.character <= lines[position.line].length
}

function comparableLocations(locations, workspace) {
  return locations.map(({ uri, range }) => {
    const fileName = fileURLToPath(uri)
    const relative = path.relative(workspace, fileName).split(path.sep).join("/")
    return { file: relative, range }
  }).sort((left, right) => (
    ordinalCompare(left.file, right.file)
    || left.range.start.line - right.range.start.line
    || left.range.start.character - right.range.start.character
    || left.range.end.line - right.range.end.line
    || left.range.end.character - right.range.end.character
  ))
}

function normalizeReferences(value) {
  if (!Array.isArray(value)) return []
  return value.map(({ uri, range }) => ({ uri, range })).sort((left, right) => (
    ordinalCompare(left.uri, right.uri)
    || left.range.start.line - right.range.start.line
    || left.range.start.character - right.range.start.character
    || left.range.end.line - right.range.end.line
    || left.range.end.character - right.range.end.character
  ))
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

function parseArguments(args) {
  const values = new Map()
  const flags = new Set()
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "--help" || argument === "--trace" || argument === "--exclude-declaration") {
      if (flags.has(argument)) throw new Error(`${argument} may appear only once`)
      flags.add(argument)
      continue
    }
    if (!argument.startsWith("--")) throw new Error(`unknown argument: ${argument}`)
    if (values.has(argument)) throw new Error(`${argument} may appear only once`)
    const value = args[index + 1]
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`)
    values.set(argument, value)
    index += 1
  }
  if (flags.has("--help")) return { help: true }
  for (const required of ["--workspace", "--sdk", "--file", "--symbol", "--line", "--character", "--oracle", "--out"]) {
    if (!values.has(required)) throw new Error(`${required} is required`)
  }
  const mode = values.get("--mode") ?? "A"
  if (!new Set(["A", "B", "C"]).has(mode)) throw new Error("--mode must be A, B, or C")
  const strategy = values.get("--strategy")
  if (strategy && !new Set(["legacy", "batched", "indexed-batched"]).has(strategy)) {
    throw new Error("--strategy must be legacy, batched, or indexed-batched")
  }
  const sdkProfile = values.get("--sdk-profile")
  if (sdkProfile && !new Set(["full", "common"]).has(sdkProfile)) {
    throw new Error("--sdk-profile must be full or common")
  }
  const dependencyProfile = values.get("--dependency-profile")
  if (dependencyProfile && !new Set(["closure", "identity"]).has(dependencyProfile)) {
    throw new Error("--dependency-profile must be closure or identity")
  }
  return {
    help: false,
    workspace: path.resolve(values.get("--workspace")),
    sdk: path.resolve(values.get("--sdk")),
    file: values.get("--file"),
    symbol: values.get("--symbol"),
    position: {
      line: nonNegativeInteger(values.get("--line"), "--line"),
      character: nonNegativeInteger(values.get("--character"), "--character"),
    },
    oracle: path.resolve(values.get("--oracle")),
    out: path.resolve(values.get("--out")),
    server: path.resolve(values.get("--server") ?? path.join(projectRoot, "dist", "server.cjs")),
    sidecar: path.resolve(values.get("--sidecar") ?? path.join(projectRoot, "target", "release", "arkts-index-sidecar")),
    mode,
    strategy,
    sdkProfile,
    dependencyProfile,
    batchRoots: optionalPositiveInteger(values.get("--batch-roots"), "--batch-roots"),
    sampleIntervalMs: positiveInteger(values.get("--sample-interval-ms") ?? "50", "--sample-interval-ms"),
    timeoutMs: positiveInteger(values.get("--timeout-ms") ?? "180000", "--timeout-ms"),
    diagnosticTimeoutMs: positiveInteger(values.get("--diagnostic-timeout-ms") ?? "180000", "--diagnostic-timeout-ms"),
    idleMs: nonNegativeInteger(values.get("--idle-ms") ?? "10000", "--idle-ms"),
    trace: flags.has("--trace"),
    includeDeclaration: !flags.has("--exclude-declaration"),
  }
}

function validateInputs(options) {
  requireDirectory(options.workspace, "workspace")
  requireDirectory(options.sdk, "SDK")
  requireFile(path.resolve(options.workspace, options.file), "target file")
  requireFile(options.oracle, "oracle")
  requireFile(options.server, "server")
  requireFile(options.sidecar, "sidecar")
  if (fs.existsSync(options.out)) throw new Error(`output already exists: ${options.out}`)
}

function requireFile(fileName, label) {
  if (!fs.statSync(fileName).isFile()) throw new Error(`${label} must be a file: ${fileName}`)
}

function requireDirectory(fileName, label) {
  if (!fs.statSync(fileName).isDirectory()) throw new Error(`${label} must be a directory: ${fileName}`)
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

function optionalPositiveInteger(value, label) {
  return value === undefined ? null : positiveInteger(value, label)
}

function positiveInteger(value, label) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`)
  return parsed
}

function nonNegativeInteger(value, label) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative integer`)
  return parsed
}

function maxNullable(values) {
  const finite = values.filter(Number.isFinite)
  return finite.length > 0 ? Math.max(...finite) : null
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function ordinalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function helpText() {
  return `Usage:
  node scripts/bench/replay-references.mjs \\
    --workspace <path> \\
    --sdk <path> \\
    --file <workspace-relative path> \\
    --symbol <identifier> \\
    --line <zero-based> \\
    --character <UTF-16> \\
    --oracle <report.json> \\
    --out <report.json>

Runs a real child-process textDocument/references request with Content-Length
framed stdio, exact Location oracle validation, normal diagnostics, and external
process-tree RSS sampling.

Options:
  --mode <A|B|C>                 A: references first; B: warm completion and
                                 definition; C: ten references plus unsaved edit
  --strategy <name>              legacy, batched, or indexed-batched
  --sdk-profile <full|common>    verifier-only SDK ambient profile
  --dependency-profile <closure|identity>
                                 identity-proven candidate dependency profile
  --batch-roots <count>          candidate root limit for batching
  --server <path>                defaults to dist/server.cjs
  --sidecar <path>               defaults to target/release/arkts-index-sidecar
  --sample-interval-ms <ms>      defaults to 50
  --timeout-ms <ms>              defaults to 180000
  --diagnostic-timeout-ms <ms>   defaults to 180000
  --idle-ms <ms>                 defaults to 10000
  --exclude-declaration          use includeDeclaration=false
  --trace                        enable bounded references trace events
  --help                         show this message
`
}
