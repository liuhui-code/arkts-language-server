import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { pathToFileURL } from "node:url"

import { LspSession } from "../../tests/support/lsp-session.mjs"
import { applyTextEdits } from "../../tests/support/lsp-edits.mjs"
import { loadOracle } from "./reference-location-oracle.mjs"
import { gitValue, projectRoot } from "./reference-replay-input.mjs"
import { attachNearestRss, childExit, delay, readJsonLines, readStructuredLogs, waitForCatalog, waitForSample } from "./reference-replay-evidence.mjs"
import { capturePreparedIdentity, readPreparedSuite } from "./prepared-suite-input.mjs"
import { checkPreparedLocations, preparedMemory, summarizePreparedBuckets, writePreparedReport } from "./prepared-query-report.mjs"

export async function runPreparedSuite(options) {
  const suite = await readPreparedSuite(options)
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-prepared-query-"))
  try { return await captureSuite(options, suite, temporary) }
  finally { fs.rmSync(temporary, { recursive: true, force: true }) }
}

async function captureSuite(options, suite, temporary) {
  const logDir = path.join(temporary, "logs")
  const cacheDir = path.join(temporary, "index")
  const samplesPath = path.join(temporary, "rss.jsonl")
  fs.mkdirSync(logDir)
  fs.mkdirSync(cacheDir)
  const timeline = []
  const started = performance.now()
  const mark = (phase, details = {}) => timeline.push({ phase, timestamp: Date.now(),
    monotonicMs: performance.now() - started, harnessRssBytes: process.memoryUsage().rss, ...details })
  const env = { ...Object.fromEntries(Object.keys(process.env).filter(key => key.startsWith("ARKTS_")).map(key => [key, undefined])),
    ...suite.runtime.env, ARKTS_LSP_LOG_DIR: logDir, ARKTS_INDEX_CACHE_DIR: cacheDir,
    ARKTS_INDEX_SIDECAR_PATH: suite.sidecar }
  const session = new LspSession({ command: process.execPath, args: [suite.server, "--stdio"],
    cwd: projectRoot, env, rootUri: pathToFileURL(suite.workspace).href,
    capabilities: { general: { positionEncodings: ["utf-16"] }, window: { workDoneProgress: true },
      textDocument: { publishDiagnostics: { versionSupport: true } } } })
  const targetPid = session.transport.child.pid
  const sampler = spawn(process.execPath, [path.join(projectRoot, "scripts/bench/sample-process-tree-rss.mjs"),
    String(targetPid), samplesPath, String(suite.runtime.sampleIntervalMs)], { stdio: ["ignore", "ignore", "pipe"] })
  let samplerStderr = ""
  sampler.stderr.setEncoding("utf8")
  sampler.stderr.on("data", chunk => { samplerStderr += chunk })
  const requests = []
  const diagnostics = []
  const diagnosticObservers = new Map()
  const overlays = new Map()
  const openedModules = new Set()
  const completedQueries = new Map()
  const attemptedQueries = new Set()
  const queryOracles = new Map()
  let snapshot = 0
  const blockedScenarios = []
  let initialize = null
  let candidate = { state: "unobserved", source: "workspace-index-progress" }
  let preparationMs = null
  let failure = null
  let closeResult = null
  try {
    mark("server-process-started", { targetPid, samplerPid: sampler.pid })
    await waitForSample(samplesPath, 10000)
    const samplingDeadline = performance.now() + 10000
    while (readJsonLines(samplesPath).length < 2) {
      if (performance.now() >= samplingDeadline || sampler.exitCode !== null) {
        throw new Error("external RSS sampler did not produce an interval")
      }
      await delay(25)
    }
    mark("initialize-request-start")
    initialize = await session.initialize({ initializationOptions: { sdk: { path: suite.sdk } }, timeoutMs: suite.runtime.timeoutMs })
    mark("initialize-response-complete")
    const message = await waitForCatalog(session, suite.runtime.timeoutMs)
    const terminal = readStructuredLogs(logDir).findLast(event => event.event === "index.catalog.terminal")
    const state = terminal?.phase ?? (/^ready\b/iu.test(message ?? "") ? "ready" : "unproven")
    candidate = { state, source: terminal ? "index.catalog.terminal" : "workspace-index-progress", message }
    preparationMs = performance.now() - started
    mark("candidate-readiness-observed", candidate)
    // No current server-owned generation/input/capability readiness contract exists.
    // Unknown experimental capabilities, timers and catalog progress are never trusted.
    mark("semantic-readiness-unsupported", { reason: "NO_GENERATION_BOUND_PUBLIC_CONTRACT" })
    if (suite.readiness.candidateControl && candidate.state === "ready") {
      for (const targetId of suite.preOpenTargetIds ?? []) {
        openTargetDocument(suite.targets.find(target => target.id === targetId), true)
      }
      for (const scenario of suite.scenarios) {
        if (scenario.waitForPreOpenDiagnostics) {
          const expected = suite.preOpenTargetIds.map(targetId => {
            const target = suite.targets.find(item => item.id === targetId)
            const uri = pathToFileURL(path.join(suite.workspace, target.file)).href
            return { targetId, uri, observer: diagnosticObservers.get(uri) }
          })
          await Promise.all(expected.map(item => item.observer?.promise))
          for (const { targetId, uri, observer } of expected) {
            if (!observer || observer.version !== 1 || observer.superseded
              || observer.result?.uri !== uri || observer.result?.version !== 1
              || observer.result.error || !Array.isArray(observer.result.diagnostics)) {
              throw new Error(`PREOPEN_DIAGNOSTIC_BARRIER_FAILED=${targetId}`)
            }
          }
          mark("pre-open-diagnostics-barrier-complete", { scenarioId: scenario.id,
            targetIds: suite.preOpenTargetIds, version: 1 })
        }
        if (["first-unopened-module", "restart-after-validated-ready"].includes(scenario.bucket)) {
          blockedScenarios.push({ id: scenario.id, reason: scenario.bucket === "first-unopened-module"
            ? "UNOPENED_QUERY_PATH_NOT_VERIFIED" : "LIFECYCLE_CONTROL_UNAVAILABLE" })
          continue
        }
        const target = suite.targets.find(item => item.id === scenario.targetId)
        const uri = pathToFileURL(path.join(suite.workspace, target.file)).href
        if (scenario.bucket === "first-unopened-module" && openedModules.has(target.moduleId)) {
          blockedScenarios.push({ id: scenario.id, reason: "MODULE_ALREADY_OPENED" })
          continue
        }
        openTargetDocument(target)
        const queryIdentity = JSON.stringify([target.kind, target.file, target.position, target.includeDeclaration])
        if (["after-eviction", "pressure-recovery-repeat"].includes(scenario.bucket)) {
          if (scenario.bucket === "after-eviction"
            && (attemptedQueries.size === 0 || attemptedQueries.has(queryIdentity))) {
            blockedScenarios.push({ id: scenario.id, reason: "UNSEEN_RECOVERY_TARGET_REQUIRED" })
            continue
          }
          if (scenario.bucket === "pressure-recovery-repeat"
            && completedQueries.get(queryIdentity) !== snapshot) {
            blockedScenarios.push({ id: scenario.id, reason: "COMPLETE_SNAPSHOT_REQUIRED" })
            continue
          }
          if (suite.runtime.env.ARKTS_BENCHMARK_CONTROL !== "1"
            || suite.runtime.env.ARKTS_REFERENCES_TRACE !== "1") {
            blockedScenarios.push({ id: scenario.id, reason: "LIFECYCLE_CONTROL_UNAVAILABLE" })
            continue
          }
          const evictionsBefore = pressureEvictions().length
          mark("memory-pressure-request-start", { scenarioId: scenario.id, level: "level3" })
          let pressure
          try {
            pressure = await session.request("arkts/benchmark/applyMemoryPressure",
              { level: "level3" }, { timeoutMs: suite.runtime.timeoutMs })
          } catch (error) {
            pressure = { error: { message: error.message } }
          }
          mark("memory-pressure-response-complete", { scenarioId: scenario.id,
            applied: pressure.result?.applied ?? null, error: pressure.error?.message ?? null })
          if (pressure.result?.applied !== "level3") {
            blockedScenarios.push({ id: scenario.id, reason: "LIFECYCLE_CONTROL_UNAVAILABLE" })
            continue
          }
          const eviction = await waitForPressureEviction(evictionsBefore)
          if (!eviction) {
            blockedScenarios.push({ id: scenario.id, reason: "EVICTION_NOT_OBSERVED" })
            continue
          }
          mark("memory-pressure-eviction-observed", { scenarioId: scenario.id,
            reason: eviction.reason, contextSequence: eviction.contextSequence })
          const observationStart = performance.now()
          if (suite.runtime.afterEvictionObservationMs > 0) {
            mark("post-eviction-observation-start", { scenarioId: scenario.id,
              durationMs: suite.runtime.afterEvictionObservationMs })
          }
          if (suite.runtime.env.ARKTS_L01_SEMANTIC_WORKER_RECYCLE === "1") {
            mark("semantic-worker-recycle-request-start", { scenarioId: scenario.id })
            let recycle
            try {
              recycle = await session.request("arkts/benchmark/recycleSemanticWorker", {},
                { timeoutMs: suite.runtime.timeoutMs })
            } catch (error) {
              recycle = { error: { message: error.message } }
            }
            mark("semantic-worker-recycle-complete", { scenarioId: scenario.id,
              recycled: recycle.result?.recycled ?? false,
              oldThreadId: recycle.result?.oldThreadId ?? null,
              newThreadId: recycle.result?.newThreadId ?? null,
              error: recycle.error?.message ?? null })
            if (recycle.result?.recycled !== true
              || !Number.isSafeInteger(recycle.result.oldThreadId)
              || !Number.isSafeInteger(recycle.result.newThreadId)
              || recycle.result.oldThreadId === recycle.result.newThreadId) {
              blockedScenarios.push({ id: scenario.id, reason: "WORKER_RECYCLE_FAILED" })
              continue
            }
          }
          if (suite.runtime.afterEvictionObservationMs > 0) {
            await delay(Math.max(0, suite.runtime.afterEvictionObservationMs
              - (performance.now() - observationStart)))
            const elapsedMs = performance.now() - observationStart
            mark("post-eviction-observation-complete", { scenarioId: scenario.id, elapsedMs,
              overrunMs: Math.max(0, elapsedMs - suite.runtime.afterEvictionObservationMs) })
          }
        }
        let expected = queryOracles.get(queryIdentity) ?? target.expected
        if (scenario.edit) {
          snapshot++
          queryOracles.clear()
          const editedUri = pathToFileURL(path.join(suite.workspace, scenario.edit.file)).href
          const version = (session.documentVersions.get(editedUri) ?? 0) + 1
          const text = applyTextEdits(overlays.get(editedUri)
            ?? fs.readFileSync(path.join(suite.workspace, scenario.edit.file), "utf8"), scenario.edit.changes)
          if (!session.documentVersions.has(editedUri)) {
            session.openDocument({ uri: editedUri, version: 1,
              text: fs.readFileSync(path.join(suite.workspace, scenario.edit.file), "utf8") })
            openedModules.add(suite.targets.find(item => item.file === scenario.edit.file)?.moduleId ?? scenario.edit.file)
          }
          const nextVersion = Math.max(version, 2)
          overlays.set(editedUri, text)
          observeDiagnostics(editedUri, nextVersion)
          session.changeDocument({ uri: editedUri, version: nextVersion, text })
          mark("didChange-sent", { scenarioId: scenario.id, version: nextVersion })
          expected = loadOracle(scenario.edit.oracle.path, suite.workspace, overlays)
        }
        queryOracles.set(queryIdentity, expected)
        const priorCompleteSnapshot = completedQueries.get(queryIdentity) === snapshot
        const begin = performance.now()
        const requestId = session.nextRequestId
        mark("request-start", { scenarioId: scenario.id, method: `textDocument/${target.kind}` })
        attemptedQueries.add(queryIdentity)
        let response
        let status = "COMPLETE"
        try {
          response = await session.request(`textDocument/${target.kind}`, {
            textDocument: { uri }, position: target.position,
            ...(target.kind === "references" ? { context: { includeDeclaration: target.includeDeclaration } } : {}),
          }, { timeoutMs: suite.runtime.timeoutMs })
          if (response.error) status = "ERROR"
        } catch (error) {
          status = /Timed out waiting/u.test(error.message) ? "TIMEOUT" : "ERROR"
          response = { error: { message: error.message } }
          session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: requestId } })
        }
        const elapsedMs = performance.now() - begin
        const correctness = checkPreparedLocations(response.result, expected, suite.workspace, overlays)
        requests.push({ scenarioId: scenario.id, targetId: target.id, kind: target.kind,
          bucket: scenario.bucket, measurementState: "candidate-ready-control", elapsedMs,
          priorCompleteSnapshot, cacheEvidence: "unproven",
          elapsedLowerBound: status === "TIMEOUT", status, error: response.error ?? null,
          documentVersion: session.documentVersions.get(uri), correctness })
        if (status === "COMPLETE" && correctness.equal) {
          completedQueries.set(queryIdentity, snapshot)
        }
        mark("request-complete", { scenarioId: scenario.id, elapsedMs, status, exact: correctness.equal })
      }
      await Promise.all([...diagnosticObservers.values()].map(observer => observer.promise))
      if (suite.runtime.postIdleMs > 0) {
        mark("post-query-idle-start", { durationMs: suite.runtime.postIdleMs })
        await delay(suite.runtime.postIdleMs)
        mark("post-query-idle-complete")
      }
    }
  } catch (error) { failure = { message: error.message }; mark("failure", failure) }
  finally {
    closeResult = await session.close({ timeoutMs: 10000 }).catch(async error => {
      await session.transport.close()
      return { error: error.message }
    })
    sampler.kill("SIGINT")
    await childExit(sampler)
    mark("server-process-closed", { closeResult })
  }
  const samples = readJsonLines(samplesPath)
  const postflightPins = await capturePreparedIdentity(suite)
  const inputUnchanged = JSON.stringify(postflightPins) === JSON.stringify(suite.pins)
  const diagnosticsStatus = diagnosticObservers.size === 0 ? "NOT_RUN"
    : [...diagnosticObservers.values()].every(observer => observer.result && !observer.result.error) ? "PASS" : "FAIL"
  const report = {
    schema: "arkts-language-server.prepared-query-report", schemaVersion: 1, status: "FAIL",
    inputIdentity: { ...suite.pins, suiteDigest: suite.suiteDigest, targetPoolDigest: suite.poolDigest,
      benchmarkId: suite.benchmarkId, seed: suite.seed, postflightPins, inputUnchanged },
    environment: { platform: `${os.type()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length, ramBytes: os.totalmem(), node: process.execPath,
      workspace: suite.workspace, sdk: suite.sdk, hostname: os.hostname(),
      serverWorktreeStatus: gitValue(projectRoot, ["status", "--porcelain"]),
      traceMode: suite.runtime.env.ARKTS_REFERENCES_TRACE === "1" ? "attribution-only" : "trace-off",
      launch: { command: process.execPath, args: [suite.server, "--stdio"],
        nodeOptions: process.env.NODE_OPTIONS ?? null },
      effectiveArktsFlags: suite.runtime.env,
      parentArktsFlagsCleared: Object.keys(process.env).filter(key => key.startsWith("ARKTS_")) },
    readiness: { candidate, semantic: { status: "READINESS_UNSUPPORTED",
      reason: "NO_GENERATION_BOUND_PUBLIC_CONTRACT", observed: null } },
    preparation: { measurementState: "candidate-preparation-only", elapsedMs: preparationMs,
      timeToSemanticReadyMs: null, targetQueries: 0 },
    targetPool: suite.targets.map(({ expected, ...target }) => target),
    requests, blockedScenarios, bucketSummaries: summarizePreparedBuckets(suite, requests), diagnostics,
    memory: { ...preparedMemory(samples, targetPid, suite.runtime.sampleIntervalMs, samplerStderr),
      peakHarnessEventRssBytes: Math.max(...timeline.map(event => event.harnessRssBytes)) },
    correctness: { plannedRequests: suite.scenarios.length, executedRequests: requests.length,
      status: requests.length && !failure && requests.length === suite.scenarios.length && inputUnchanged
        && requests.every(request => request.status === "COMPLETE" && request.correctness.equal)
        && diagnosticsStatus === "PASS" ? "PASS" : failure || requests.length ? "FAIL" : "NOT_RUN" },
    gateStatus: { ready: "FAIL", latency: "BLOCKED", memory: "BLOCKED", portability: "NOT_RUN",
      lifecycle: "NOT_RUN", diagnostics: diagnosticsStatus },
    timeline: attachNearestRss(timeline, samples), serverEvents: readStructuredLogs(logDir),
    transcript: session.transport.diagnosticSnapshot(), initializeCapabilities: initialize?.result?.capabilities,
    closeResult, failure,
  }
  writePreparedReport(options.out, report)
  return report

  function openTargetDocument(target, preOpen = false) {
    const uri = pathToFileURL(path.join(suite.workspace, target.file)).href
    if (session.documentVersions.has(uri)) return
    const text = fs.readFileSync(path.join(suite.workspace, target.file), "utf8")
    overlays.set(uri, text)
    observeDiagnostics(uri, 1)
    session.openDocument({ uri, version: 1, text })
    openedModules.add(target.moduleId)
    mark("didOpen-sent", { targetId: target.id, version: 1, ...(preOpen ? { preOpen: true } : {}) })
  }

  function observeDiagnostics(uri, version) {
    const current = diagnosticObservers.get(uri)
    if (current) {
      mark("diagnostic-version-superseded", { uri, fromVersion: current.version, toVersion: version })
      current.superseded = true
      if (current.result) current.result.supersededByVersion = version
    }
    const observer = { version, superseded: false, result: null, promise: null }
    diagnosticObservers.set(uri, observer)
    observer.promise = session.transport.notification("textDocument/publishDiagnostics",
      message => !observer.superseded && message.params?.uri === uri && message.params?.version === version,
      suite.runtime.diagnosticTimeoutMs)
      .then(message => {
        if (observer.superseded) return
        observer.result = { uri, version, timestamp: Date.now(), diagnostics: message.params.diagnostics }
        diagnostics.push(observer.result)
        mark("publishDiagnostics", { uri, version, count: message.params.diagnostics.length })
      })
      .catch(error => {
        if (observer.superseded) return
        observer.result = { uri, version, error: error.message }
        diagnostics.push(observer.result)
        mark("diagnostic-not-observed", { uri, version })
      })
  }

  function pressureEvictions() {
    return readStructuredLogs(logDir).filter(event => event.event === "semantic.context.evict"
      && event.reason === "memory-level3")
  }

  async function waitForPressureEviction(previousCount) {
    const deadline = performance.now() + Math.min(suite.runtime.timeoutMs, 5000)
    while (performance.now() < deadline) {
      const eviction = pressureEvictions()[previousCount]
      if (eviction) return eviction
      await delay(25)
    }
    return null
  }
}
