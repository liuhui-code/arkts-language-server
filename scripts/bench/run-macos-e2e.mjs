#!/usr/bin/env node

import { execFile } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { fileURLToPath, pathToFileURL } from "node:url"

import { digestSdk } from "../semantic/lock-toolchain.mjs"
import { readSdkMetadata } from "./reference-replay-input.mjs"
import { readWorkflowOracle } from "./macos-workflow-oracle.mjs"
import { createReport } from "./macos-workflow-report.mjs"
import { createWorkflowReceiver, recordWorkflowModuleVisit } from "./macos-workflow-receipts.mjs"
import { readWorkflowRuntimeLog } from "./macos-workflow-runtime.mjs"
import { readWorkflowCatalog } from "./macos-workflow-catalog.mjs"
import { LspSession } from "../../tests/support/lsp-session.mjs"
import { createProcessResourceProbe } from "../../tests/support/process-resource-probe.mjs"

const runFile = fileURLToPath(import.meta.url)
const projectRoot = path.resolve(path.dirname(runFile), "../..")
const usage = `usage: node scripts/bench/run-macos-e2e.mjs \\
  --workspace PATH --sdk PATH --sidecar PATH --out FILE [--oracle FILE] [--start-at cold:INDEX]

Runs the committed workflow counts: cold=3, warm=10, stress=5.
An explicit suffix retains the full plan and reports PARTIAL, never complete PASS.`

if (process.argv.includes("--help")) {
  process.stdout.write(`${usage}\n`)
} else {
  try {
    await main(parseArguments(process.argv.slice(2)))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

async function main(options) {
  if (process.platform !== "darwin") throw new Error("run-macos-e2e.mjs requires macOS")
  requireDirectory(options.workspace, "workspace")
  requireDirectory(options.sdk, "SDK")
  requireFile(options.sidecar, "sidecar")
  requireFile(path.join(projectRoot, "dist", "server.cjs"), "server bundle")
  if (fs.existsSync(options.out)) throw new Error(`output already exists: ${options.out}`)

  const workflow = readJson(path.join(projectRoot, "config", "product-benchmark-workflow.json"))
  const planned = Object.entries(workflow.runs).flatMap(([kind, count]) =>
    Array.from({ length: count }, (_, index) => ({ kind, index })))
  const startAt = options.startAt ?? "cold:0"
  const offset = planned.findIndex(run => `${run.kind}:${run.index}` === startAt)
  if (offset < 0 || planned[offset].kind !== "cold") throw new Error(`invalid workflow start: ${startAt}`)
  const workflowSelection = { startAt, selectedRuns: planned.length - offset, excludedRuns: planned.slice(0, offset) }
  const manifestPath = path.join(options.workspace, "fixture-manifest.json")
  const manifest = readJson(manifestPath)
  const apiLevel = Number(readSdkMetadata(options.sdk)?.apiVersion)
  const sdkIdentity = {
    sdkApiLevel: Number.isSafeInteger(apiLevel) && apiLevel > 0 ? apiLevel : null,
    sdkDeclarationDigest: await digestSdk(options.sdk),
  }
  const entryPath = path.join(options.workspace, manifest.entryFile)
  requireFile(entryPath, "benchmark entry")
  const source = benchmarkSource(fs.readFileSync(entryPath, "utf8"), manifest.seed)
  const oracleInput = { workspace: options.workspace, source,
    sdkDeclarationDigest: sdkIdentity.sdkDeclarationDigest,
    query: { file: manifest.entryFile, symbol: "stableMember", includeDeclaration: true,
      position: positionAt(source, source.indexOf("this.stableMember") + "this.".length) } }
  const oracle = readWorkflowOracle(options.oracle, oracleInput)
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-macos-e2e-"))
  const runs = []
  let failure = null

  try {
    const warmCache = path.join(temporaryRoot, "warm")
    for (const { kind, index } of planned.slice(offset)) {
      runs.push(await runOnce({
        ...options, source, manifest, entryPath, oracle,
        kind, index,
        cacheDirectory: kind === "cold" ? path.join(temporaryRoot, `cold-${index}`) : warmCache,
      }))
    }
  } catch (error) {
    if (!error.run) throw error
    runs.push(error.run)
    failure = { message: error.message }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }

  if (oracle && !failure) {
    try {
      const postflight = readWorkflowOracle(options.oracle, { ...oracleInput,
        sdkDeclarationDigest: await digestSdk(options.sdk) })
      if (postflight.sha256 !== oracle.sha256) throw new Error("WORKFLOW_ORACLE_CHANGED")
    } catch (error) {
      failure = { phase: "postflight", message: error.message }
    }
  }
  const report = createReport({ options, workflow, workflowSelection, manifest, manifestPath, sdkIdentity, oracle, runs, failure })
  fs.mkdirSync(path.dirname(options.out), { recursive: true })
  fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" })
  const status = failure ? "FAIL" : report.measurementStatus === "complete" ? "PASS" : "PARTIAL"
  process.stdout.write(`MACOS_E2E=${status}\nREPORT=${options.out}\n`)
  if (failure) {
    process.stderr.write(`${failure.message}\n`)
    process.exitCode = 1
  }
}

async function runOnce(input) {
  const metricsPath = path.join(os.tmpdir(), `arkts-macos-metrics-${process.pid}-${input.kind}-${input.index}.jsonl`)
  fs.rmSync(metricsPath, { force: true })
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(input.workspace).href,
    env: {
      ARKTS_INDEX_CACHE_DIR: input.cacheDirectory,
      ARKTS_INDEX_SIDECAR_PATH: input.sidecar,
      ARKTS_LSP_LOG_DIR: path.join(input.cacheDirectory, "logs"),
      ARKTS_MEMORY_METRICS_FILE: metricsPath,
      ARKTS_BENCHMARK_CONTROL: "1",
    },
    capabilities: {
      general: { positionEncodings: ["utf-16"] },
      window: { workDoneProgress: true },
      textDocument: { publishDiagnostics: { versionSupport: true } },
    },
  })
  const sampler = macosSampler(session.transport.child.pid)
  const latency = {}
  const receipts = []
  const moduleVisits = []
  const diagnostics = []
  const catalog = { status: "NOT_STARTED", events: [] }
  const initializeReceipt = { request: { jsonrpc: "2.0", id: session.nextRequestId, method: "initialize",
    params: { processId: process.pid, rootUri: session.rootUri, capabilities: session.capabilities,
      initializationOptions: { sdk: { path: input.sdk } } } }, timeoutMs: 30_000, status: "PENDING" }
  const receive = createWorkflowReceiver(session, input, receipts)
  let indexedFiles = null
  let level3Observed = false
  let failure = null
  let closeResult = null
  try {
    const initializedAt = performance.now()
    try {
      initializeReceipt.response = await session.initialize({
        initializationOptions: initializeReceipt.request.params.initializationOptions, timeoutMs: 30_000,
      })
      initializeReceipt.status = "RECEIVED"
    } catch (error) {
      initializeReceipt.status = error.message.startsWith("Timed out waiting for LSP response ") ? "TIMEOUT" : "FAILED"
      initializeReceipt.failure = { name: error.name, message: error.message, code: error.code ?? null }
      throw error
    } finally { initializeReceipt.elapsedMs = performance.now() - initializedAt }
    indexedFiles = await readWorkflowCatalog(session, catalog, 180_000)
    latency.initializeAndIndexMs = performance.now() - initializedAt

    const uri = pathToFileURL(input.entryPath).href
    const completionSource = input.source.replace("return this.stableMember", "return this.")
    session.openDocument({ uri, version: 1, text: completionSource })
    latency.completionMs = await timed(async () => {
      const response = await receive("textDocument/completion", {
        textDocument: { uri }, position: positionAfter(completionSource, "return this."),
        context: { triggerKind: 1 },
      })
      requireCompletion(response, "stableMember")
    })

    session.changeDocument({ uri, version: 2, text: input.source })
    const memberPosition = positionAt(input.source, input.source.indexOf("this.stableMember") + "this.".length)
    latency.definitionMs = await timed(async () => {
      const response = await receive("textDocument/definition", {
        textDocument: { uri }, position: memberPosition,
      })
      const definitions = Array.isArray(response.result) ? response.result : response.result ? [response.result] : []
      if (!definitions.some((item) => item.uri === uri)) throw new Error("definition omitted benchmark entry")
    })
    latency.referencesMs = await timed(async () => {
      const response = await receive("textDocument/references", {
        textDocument: { uri }, position: memberPosition, context: { includeDeclaration: true },
      }, 60_000)
      if (!Array.isArray(response.result) || response.result.length < 2) {
        throw new Error(`references returned ${JSON.stringify(response.result)}`)
      }
    })

    const edited = completionSource.replace("// benchmark-edit", "// benchmark-edit changed")
    session.changeDocument({ uri, version: 3, text: edited })
    latency.editedCompletionMs = await timed(async () => {
      const response = await receive("textDocument/completion", {
        textDocument: { uri }, position: positionAfter(edited, "return this."),
        context: { triggerKind: 1 },
      })
      requireCompletion(response, "stableMember")
    })

    if (input.kind === "stress") {
      await visitModules(session, input, 20, moduleVisits)
      session.changeDocument({ uri, version: 4, text: completionSource })
      const pressure = await receive("arkts/benchmark/applyMemoryPressure", {
        level: "level3",
      })
      if (pressure.result?.applied !== "level3") throw new Error("Level 3 pressure was not applied")
      level3Observed = true
      latency.postPressureCompletionMs = await timed(async () => {
        const response = await receive("textDocument/completion", {
          textDocument: { uri }, position: positionAfter(completionSource, "return this."),
          context: { triggerKind: 1 },
        })
        requireCompletion(response, "stableMember")
      })
    }
    const version = session.documentVersions.get(uri)
    latency.latestDiagnosticsMs = await timed(async () => {
      diagnostics.push(await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params?.uri === uri && message.params?.version === version, 10_000))
    })
  } catch (error) {
    failure = error
  } finally {
    sampler.stop()
    try { closeResult = await session.close({ timeoutMs: 10_000 }) }
    catch (error) {
      await session.transport.close()
      closeResult = { error: error.message, exit: {
        code: session.transport.child.exitCode, signal: session.transport.child.signalCode } }
      failure ??= error
    }
  }
  if (closeResult.exit.code !== 0 || closeResult.exit.signal !== null) {
    failure ??= new Error(`WORKFLOW_NATIVE_EXIT=${JSON.stringify(closeResult.exit)}`)
  }
  const memory = await sampler.result()
  if (memory.samplingError) failure ??= new Error(memory.samplingError.message)
  const metricEvidence = readJsonLines(metricsPath, session.transport.child.pid)
  const metrics = metricEvidence.samples
  if (metricEvidence.metricsError) failure ??= new Error(metricEvidence.metricsError.message)
  const runtime = readWorkflowRuntimeLog(input.cacheDirectory, session.transport.child.pid)
  if (runtime.logError) failure ??= new Error(runtime.logError.message)
  if (!failure && ["server.started", "server.stopped"].some(event => (
    runtime.events.filter(row => row.event === event).length !== 1
  ))) failure = new Error("MACOS_RUNTIME_LIFECYCLE_INCOMPLETE")
  fs.rmSync(metricsPath, { force: true })
  if (!failure && memory.samples.length === 0) failure = new Error("macOS RSS sampler produced no samples")
  if (!failure && !metrics.some((sample) => sample.semanticWorkerCount === 1)) {
    failure = new Error("semantic worker metrics omitted the single-worker invariant")
  }
  if (!failure && metrics.some((sample) => sample.residentContextCount > 2)) {
    failure = new Error("resident semantic context count exceeded 2")
  }
  const run = {
    kind: input.kind,
    index: input.index,
    status: failure ? "FAIL" : "COMPLETE",
    targetPid: session.transport.child.pid,
    closeResult,
    indexedFiles,
    latency,
    initializeReceipt,
    catalog,
    receipts,
    moduleVisits,
    diagnostics,
    runtime,
    memory: {
      samples: memory.samples,
      samplingError: memory.samplingError,
      intervalClock: "sampler-monotonic-ms",
      timeOrigin: performance.timeOrigin,
      requestedIntervalMs: 250,
      peakProductRssBytes: observedMax(memory.samples.map((sample) => sample.totalRssBytes)),
      finalProductRssBytes: memory.samples.at(-1)?.totalRssBytes ?? null,
      sampleCount: memory.samples.length,
      maxProcessCount: observedMax(memory.samples.map((sample) => sample.processCount)),
    },
    semantic: {
      ...metricEvidence,
      maxResidentContexts: observedMax(metrics.map((sample) => sample.residentContextCount)),
      maxProjectFiles: observedMax(metrics.map((sample) => sample.projectFiles)),
      maxOpenDocuments: observedMax(metrics.map((sample) => sample.openDocuments)),
      level3Observed,
    },
  }
  if (failure) throw Object.assign(failure, { run })
  return run
}

function observedMax(values) { return values.length ? Math.max(...values) : null }

async function visitModules(session, input, count, visits) {
  for (let index = 0; index < count; index += 1) {
    const identity = String(index).padStart(6, "0")
    const modulePath = path.join(
      input.workspace,
      input.manifest.generatedSourceRoot,
      `Active${identity}.ets`,
    )
    const moduleUri = pathToFileURL(modulePath).href
    const source = `${fs.readFileSync(modulePath, "utf8")}\nclass Visit${identity} {
  stableMember: number = ${input.manifest.seed}
  visit(): number { return this. }
}\n`
    recordWorkflowModuleVisit(session, { uri: moduleUri, version: 1, text: source }, visits)
  }
}

function macosSampler(pid) {
  let stopped = false
  const samples = []
  const exec = promisify(execFile)
  const probe = createProcessResourceProbe({
    platform: "darwin",
    now: () => Date.now(),
    runPs: async ({ command, args, maxBuffer, env }) => (
      await exec(command, args, { maxBuffer, env: { ...process.env, ...env } })
    ).stdout,
  })
  const result = (async () => {
    const identity = await probe.identify(pid)
    while (!stopped) {
      const monotonicMs = performance.now()
      try {
        const sample = await probe.sample(identity)
        samples.push({
          ...sample,
          monotonicMs,
          totalRssBytes: sample.processes.reduce((sum, process) => sum + process.rssBytes, 0),
          processCount: sample.processes.length,
        })
      } catch (error) {
        if (!stopped) throw error
      }
      await delay(250)
    }
    return { samples, samplingError: null }
  })().catch(error => ({ samples, samplingError: {
    name: error.name, message: error.message, code: error.code ?? null,
    signal: error.signal ?? null, cmd: error.cmd ?? null, stdout: error.stdout ?? null, stderr: error.stderr ?? null,
  } }))
  return { stop() { stopped = true }, result: () => result }
}

function requireCompletion(response, label) {
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  if (!items.some((item) => item.label === label)) {
    throw new Error(`completion omitted ${label}; received ${items.length} items`)
  }
}

function benchmarkSource(source, seed) {
  if (source.includes("// benchmark-edit") && source.includes("return this.stableMember")) return source
  return `${source.trimEnd()}

export struct BenchmarkEntry {
  stableMember: number = ${seed}
  build(): number {
    // benchmark-edit
    return this.stableMember
  }
}
`
}

function parseArguments(args) {
  const values = new Map()
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (!flag?.startsWith("--") || value === undefined || values.has(flag)) throw new Error(usage)
    values.set(flag, value)
  }
  const expected = ["--workspace", "--sdk", "--sidecar", "--out"]
  if (expected.some((flag) => !values.has(flag))
    || [...values.keys()].some(flag => ![...expected, "--oracle", "--start-at"].includes(flag))) {
    throw new Error(usage)
  }
  return {
    workspace: path.resolve(values.get("--workspace")),
    sdk: path.resolve(values.get("--sdk")),
    sidecar: path.resolve(values.get("--sidecar")),
    out: path.resolve(values.get("--out")),
    oracle: values.has("--oracle") ? path.resolve(values.get("--oracle")) : null,
    startAt: values.get("--start-at") ?? null,
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

function readJsonLines(file, expectedPid) {
  let rawJsonLines = null
  try {
    if (fs.existsSync(file)) rawJsonLines = fs.readFileSync(file, "utf8")
    const samples = rawJsonLines === null ? [] : rawJsonLines.trim().split("\n").filter(Boolean).map(JSON.parse)
    const numeric = ["rss", "heapTotal", "heapUsed", "external", "arrayBuffers", "semanticWorkerCount",
      "residentContextCount", "projectFiles", "openDocuments", "leaseCount", "epochMs"]
    if (samples.some(sample => !sample || Array.isArray(sample) || typeof sample !== "object"
      || numeric.some(key => !Number.isSafeInteger(sample[key]) || sample[key] < 0)
      || sample.processId !== expectedPid || sample.rssScope !== "node-process"
      || sample.heapScope !== "semantic-worker-isolate" || typeof sample.monotonicNs !== "string"
      || !/^\d+$/u.test(sample.monotonicNs))) throw new Error("MACOS_METRICS_INVALID_SCHEMA")
    return { samples, rawJsonLines, metricsError: null }
  } catch (error) {
    return { samples: [], rawJsonLines,
      metricsError: { name: error.name, message: error.message, code: error.code ?? null } }
  }
}

function requireDirectory(candidate, label) {
  if (!fs.statSync(candidate, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`${label} directory is missing: ${candidate}`)
  }
}

function requireFile(candidate, label) {
  if (!fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`${label} file is missing: ${candidate}`)
  }
}

function positionAfter(source, anchor) {
  const offset = source.indexOf(anchor)
  if (offset < 0 || source.indexOf(anchor, offset + 1) >= 0) throw new Error(`anchor must be unique: ${anchor}`)
  return positionAt(source, offset + anchor.length)
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  const lastLine = prefix.lastIndexOf("\n")
  return { line: prefix.split("\n").length - 1, character: offset - lastLine - 1 }
}

async function timed(operation) {
  const startedAt = performance.now()
  await operation()
  return performance.now() - startedAt
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
