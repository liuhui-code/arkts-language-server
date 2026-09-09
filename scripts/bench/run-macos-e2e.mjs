#!/usr/bin/env node

import { execFile, execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { fileURLToPath, pathToFileURL } from "node:url"

import { LspSession } from "../../tests/support/lsp-session.mjs"
import { createProcessResourceProbe } from "../../tests/support/process-resource-probe.mjs"

const runFile = fileURLToPath(import.meta.url)
const projectRoot = path.resolve(path.dirname(runFile), "../..")
const usage = `usage: node scripts/bench/run-macos-e2e.mjs \\
  --workspace PATH --sdk PATH --sidecar PATH --out FILE

Runs the committed workflow counts: cold=3, warm=10, stress=5.`

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
  const manifestPath = path.join(options.workspace, "fixture-manifest.json")
  const manifest = readJson(manifestPath)
  const toolchain = readJson(path.join(projectRoot, "docs", "toolchains", "arkts-toolchain.lock.json"))
  const entryPath = path.join(options.workspace, manifest.entryFile)
  requireFile(entryPath, "benchmark entry")
  const source = benchmarkSource(fs.readFileSync(entryPath, "utf8"), manifest.seed)
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-macos-e2e-"))
  const runs = []

  try {
    for (let index = 0; index < workflow.runs.cold; index += 1) {
      runs.push(await runOnce({
        ...options, source, manifest, entryPath,
        kind: "cold", index,
        cacheDirectory: path.join(temporaryRoot, `cold-${index}`),
      }))
    }
    const warmCache = path.join(temporaryRoot, "warm")
    for (let index = 0; index < workflow.runs.warm; index += 1) {
      runs.push(await runOnce({
        ...options, source, manifest, entryPath,
        kind: "warm", index, cacheDirectory: warmCache,
      }))
    }
    for (let index = 0; index < workflow.runs.stress; index += 1) {
      runs.push(await runOnce({
        ...options, source, manifest, entryPath,
        kind: "stress", index, cacheDirectory: warmCache,
      }))
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }

  const report = createReport({ options, workflow, manifest, manifestPath, toolchain, runs })
  fs.mkdirSync(path.dirname(options.out), { recursive: true })
  fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" })
  process.stdout.write(`MACOS_E2E=PASS\nREPORT=${options.out}\n`)
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
    },
  })
  const sampler = macosSampler(session.transport.child.pid)
  const latency = {}
  let indexedFiles = null
  try {
    const initializedAt = performance.now()
    await session.initialize({
      initializationOptions: { sdk: { path: input.sdk } },
      timeoutMs: 30_000,
    })
    indexedFiles = await waitForCatalog(session, 180_000)
    latency.initializeAndIndexMs = performance.now() - initializedAt

    const uri = pathToFileURL(input.entryPath).href
    const completionSource = input.source.replace("return this.stableMember", "return this.")
    session.openDocument({ uri, version: 1, text: completionSource })
    latency.completionMs = await timed(async () => {
      const response = await request(session, "textDocument/completion", {
        textDocument: { uri }, position: positionAfter(completionSource, "return this."),
        context: { triggerKind: 1 },
      })
      requireCompletion(response, "stableMember")
    })

    session.changeDocument({ uri, version: 2, text: input.source })
    const memberPosition = positionAt(input.source, input.source.indexOf("this.stableMember") + "this.".length)
    latency.definitionMs = await timed(async () => {
      const response = await request(session, "textDocument/definition", {
        textDocument: { uri }, position: memberPosition,
      })
      const definitions = Array.isArray(response.result) ? response.result : response.result ? [response.result] : []
      if (!definitions.some((item) => item.uri === uri)) throw new Error("definition omitted benchmark entry")
    })
    latency.referencesMs = await timed(async () => {
      const response = await request(session, "textDocument/references", {
        textDocument: { uri }, position: memberPosition, context: { includeDeclaration: true },
      }, 60_000)
      if (!Array.isArray(response.result) || response.result.length < 2) {
        throw new Error(`references returned ${JSON.stringify(response.result)}`)
      }
    })

    const edited = completionSource.replace("// benchmark-edit", "// benchmark-edit changed")
    session.changeDocument({ uri, version: 3, text: edited })
    latency.editedCompletionMs = await timed(async () => {
      const response = await request(session, "textDocument/completion", {
        textDocument: { uri }, position: positionAfter(edited, "return this."),
        context: { triggerKind: 1 },
      })
      requireCompletion(response, "stableMember")
    })

    if (input.kind === "stress") {
      await visitModules(session, input, 20)
      session.changeDocument({ uri, version: 4, text: completionSource })
      const pressure = await request(session, "arkts/benchmark/applyMemoryPressure", {
        level: "level3",
      })
      if (pressure.result?.applied !== "level3") throw new Error("Level 3 pressure was not applied")
      latency.postPressureCompletionMs = await timed(async () => {
        const response = await request(session, "textDocument/completion", {
          textDocument: { uri }, position: positionAfter(completionSource, "return this."),
          context: { triggerKind: 1 },
        })
        requireCompletion(response, "stableMember")
      })
    }
  } finally {
    sampler.stop()
    await session.close({ timeoutMs: 10_000 }).catch(() => session.transport.close())
  }
  const memory = await sampler.result()
  const metrics = readJsonLines(metricsPath)
  fs.rmSync(metricsPath, { force: true })
  if (memory.samples.length === 0) throw new Error("macOS RSS sampler produced no samples")
  if (!metrics.some((sample) => sample.semanticWorkerCount === 1)) {
    throw new Error("semantic worker metrics omitted the single-worker invariant")
  }
  if (metrics.some((sample) => sample.residentContextCount > 2)) {
    throw new Error("resident semantic context count exceeded 2")
  }
  return {
    kind: input.kind,
    index: input.index,
    indexedFiles,
    latency,
    memory: {
      peakProductRssBytes: Math.max(...memory.samples.map((sample) => sample.totalRssBytes)),
      finalProductRssBytes: memory.samples.at(-1).totalRssBytes,
      sampleCount: memory.samples.length,
      maxProcessCount: Math.max(...memory.samples.map((sample) => sample.processCount)),
    },
    semantic: {
      maxResidentContexts: Math.max(...metrics.map((sample) => sample.residentContextCount)),
      maxProjectFiles: Math.max(...metrics.map((sample) => sample.projectFiles)),
      maxOpenDocuments: Math.max(...metrics.map((sample) => sample.openDocuments)),
      level3Observed: input.kind === "stress",
    },
  }
}

async function waitForCatalog(session, timeoutMs) {
  const create = await session.transport.serverRequest("window/workDoneProgress/create", () => true, timeoutMs)
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  const token = create.params.token
  await session.transport.progress(token, (message) => message.params.value.kind === "begin", timeoutMs)
  const terminal = await session.transport.progress(token, (message) => (
    message.params.value.kind === "report" && message.params.value.percentage === 100
  ), timeoutMs)
  await session.transport.progress(token, (message) => message.params.value.kind === "end", timeoutMs)
  const match = /^Indexed (\d+)\/(\d+) files; skipped (\d+) entries$/u.exec(terminal.params.value.message)
  if (!match || match[1] !== match[2]) throw new Error(`catalog was not complete: ${terminal.params.value.message}`)
  return Number(match[1])
}

async function visitModules(session, input, count) {
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
    session.openDocument({ uri: moduleUri, version: 1, text: source })
    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: moduleUri } },
    })
  }
}

function createReport({ options, workflow, manifest, manifestPath, toolchain, runs }) {
  const warm = runs.filter((run) => run.kind === "warm")
  const stress = runs.filter((run) => run.kind === "stress")
  return {
    schemaVersion: 1,
    measurementStatus: "complete",
    measurementKind: "macos-rss-development-gate",
    releasePssComparable: false,
    comparisonIdentity: {
      gitRevision: gitRevision(),
      sdkApiLevel: toolchain.sdkApiLevel,
      sdkDeclarationDigest: toolchain.sdkDeclarationDigest,
      workspaceManifestDigest: sha256(manifestPath),
      workspaceFiles: manifest.workspaceFiles,
      activeDependencyFiles: manifest.activeDependencyFiles,
      platform: `${os.type()} ${os.release()} ${os.arch()}`,
    },
    workflowRuns: workflow.runs,
    correctness: {
      failures: 0,
      operationsPerRun: ["completion", "definition", "references", "edit-comment", "completion"],
      stressModuleVisits: 20,
    },
    memory: {
      steadyWarmRssBytes: median(warm.map((run) => run.memory.finalProductRssBytes)),
      peakRssBytes: Math.max(...runs.map((run) => run.memory.peakProductRssBytes)),
      initialWarmRssBytes: warm[0].memory.finalProductRssBytes,
      postEvictionRssBytes: median(stress.map((run) => run.memory.finalProductRssBytes)),
    },
    latency: {
      warmCompletionP95Ms: percentile(warm.map((run) => run.latency.completionMs), 0.95),
      warmDefinitionP95Ms: percentile(warm.map((run) => run.latency.definitionMs), 0.95),
      warmReferencesP95Ms: percentile(warm.map((run) => run.latency.referencesMs), 0.95),
    },
    runs,
    note: "macOS RSS counts the server process tree only; it is not Linux PSS and cannot satisfy the release comparison gate.",
    output: path.resolve(options.out),
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
      try {
        const sample = await probe.sample(identity)
        samples.push({
          timestamp: sample.timestamp,
          totalRssBytes: sample.processes.reduce((sum, process) => sum + process.rssBytes, 0),
          processCount: sample.processes.length,
        })
      } catch (error) {
        if (!stopped) throw error
      }
      await delay(250)
    }
    return { samples }
  })()
  return { stop() { stopped = true }, result: () => result }
}

async function request(session, method, params, timeoutMs = 30_000) {
  const response = await session.request(method, params, { timeoutMs })
  if (response.error) throw new Error(`${method} failed: ${JSON.stringify(response.error)}`)
  return response
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
  if (values.size !== expected.length || expected.some((flag) => !values.has(flag))) {
    throw new Error(usage)
  }
  return {
    workspace: path.resolve(values.get("--workspace")),
    sdk: path.resolve(values.get("--sdk")),
    sidecar: path.resolve(values.get("--sidecar")),
    out: path.resolve(values.get("--out")),
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

function readJsonLines(file) {
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
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

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * ratio) - 1]
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex")
}

function gitRevision() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: projectRoot,
    encoding: "utf8",
  }).trim()
}
