import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { pathToFileURL } from "node:url"

import { LspSession } from "../../tests/support/lsp-session.mjs"
import { applyTextEdits } from "../../tests/support/lsp-edits.mjs"
import { gitValue, projectRoot } from "./reference-replay-input.mjs"
import { attachNearestRss, childExit, delay, readJsonLines, readStructuredLogs, waitForCatalog, waitForSample } from "./reference-replay-evidence.mjs"
import { capturePreparedIdentity, completionSelectionIdentity, isPreparedPayloadKind, loadPreparedOracle, readPreparedSuite } from "./prepared-suite-input.mjs"
import { checkPreparedLocations, checkPreparedPayload, preparedMemory, summarizePreparedBuckets, writePreparedReport } from "./prepared-query-report.mjs"
import { editCallKinds, isCallFollowup, preparedRequestMethod, selectCallItem } from "./prepared-edit-call.mjs"
import { observeSemanticReadiness, preparedOverlayDigest, queryReadySnapshotMatches, sameReadySnapshot } from "./prepared-semantic-readiness.mjs"

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
      ...(suite.targets.some(target => editCallKinds.includes(target.kind))
        ? { workspace: { workspaceEdit: { documentChanges: true, failureHandling: "transactional" } } } : {}),
      textDocument: { publishDiagnostics: { versionSupport: true },
        ...(suite.targets.some(target => editCallKinds.includes(target.kind))
          ? { rename: { prepareSupport: true }, callHierarchy: {} } : {}) } } })
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
  const completionResults = new Map()
  const callHierarchyResults = new Map()
  let snapshot = 0
  const blockedScenarios = []
  let initialize = null
  let candidate = { state: "unobserved", source: "workspace-index-progress" }
  let preparationMs = null
  let semantic = { status: "READINESS_UNSUPPORTED", reason: "NO_GENERATION_BOUND_PUBLIC_CONTRACT", observed: null }
  let semanticPreparationMs = null
  let timeToSemanticReadyMs = null
  let readyMode = false
  let readinessValidation = null
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
    if (!suite.readiness.candidateControl) {
      for (const targetId of suite.preOpenTargetIds ?? []) openTargetDocument(suite.targets.find(target => target.id === targetId), true)
    }
    mark("semantic-readiness-request-start", { rootUri: session.rootUri, prepare: true })
    const observation = await observeSemanticReadiness(session, suite)
    semantic = observation.semantic
    semanticPreparationMs = observation.elapsedMs
    if (semantic.status === "READY") timeToSemanticReadyMs = performance.now() - started
    mark("semantic-readiness-response-complete", { status: semantic.status,
      semanticGeneration: semantic.observed?.semanticGeneration ?? null, elapsedMs: semanticPreparationMs })
    readyMode = !suite.readiness.candidateControl && semantic.status === "READY"
    if (readyMode || (suite.readiness.candidateControl && candidate.state === "ready")) {
      for (const targetId of suite.readiness.candidateControl ? suite.preOpenTargetIds ?? [] : []) {
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
        if (scenario.bucket === "restart-after-validated-ready" || (!readyMode && scenario.bucket === "first-unopened-module")) {
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
        if (readyMode && scenario.bucket !== "first-unopened-module" && !session.documentVersions.has(uri)) {
          blockedScenarios.push({ id: scenario.id, reason: "TARGET_NOT_OPENED_BEFORE_READY" })
          continue
        }
        if (!readyMode || scenario.bucket !== "first-unopened-module") openTargetDocument(target)
        const queryIdentity = JSON.stringify([target.kind, target.file, target.position, target.includeDeclaration,
          ...completionSelectionIdentity(target)])
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
          const alreadyObserved = scenario.acceptObservedEviction === true ? observedEmptyContext() : null
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
          const eviction = alreadyObserved ?? await waitForPressureEviction(evictionsBefore)
          if (!eviction) {
            blockedScenarios.push({ id: scenario.id, reason: "EVICTION_NOT_OBSERVED" })
            continue
          }
          mark("memory-pressure-eviction-observed", { scenarioId: scenario.id,
            reason: eviction.reason, contextSequence: eviction.contextSequence,
            origin: alreadyObserved ? "already-observed" : "after-control", evictionTimestamp: eviction.ts })
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
          completionResults.clear()
          callHierarchyResults.clear()
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
          expected = loadPreparedOracle(scenario.edit.oracle.path, target.kind, suite.workspace, overlays)
        }
        queryOracles.set(queryIdentity, expected)
        const priorCompleteSnapshot = completedQueries.get(queryIdentity) === snapshot
        const begin = performance.now()
        const requestId = session.nextRequestId
        const method = preparedRequestMethod(target.kind)
        mark("request-start", { scenarioId: scenario.id, method })
        attemptedQueries.add(queryIdentity)
        let response
        let sourceItem
        let status = "COMPLETE"
        try {
          let params = {
            textDocument: { uri }, position: target.position,
            ...(target.kind === "references" ? { context: { includeDeclaration: target.includeDeclaration } } : {}),
            ...(target.kind === "rename" ? { newName: target.newName } : {}),
          }
          if (target.kind === "completionResolve") {
            const source = completionResults.get(target.completionTargetId)
            if (!source || source.snapshot !== snapshot || source.documentVersion !== session.documentVersions.get(uri)) {
              throw new Error("PREPARED_RESOLVE_BLOCKED=NO_CURRENT_VALIDATED_COMPLETION")
            }
            const matches = source.items.filter(item => Object.entries(target.completionSelector)
              .every(([key, value]) => item[key] === value))
            if (matches.length !== 1) throw new Error("PREPARED_RESOLVE_BLOCKED=AMBIGUOUS_OR_MISSING_ITEM")
            sourceItem = matches[0]
            params = sourceItem
          }
          if (isCallFollowup(target.kind)) {
            const source = callHierarchyResults.get(target.callHierarchyTargetId)
            if (!source || source.snapshot !== snapshot || source.documentVersion !== session.documentVersions.get(uri)) {
              throw new Error("PREPARED_CALL_BLOCKED=NO_CURRENT_VALIDATED_PREPARE")
            }
            sourceItem = selectCallItem(source.items, target.callHierarchySelector)
            params = { item: sourceItem }
          }
          response = await session.request(method, params, { timeoutMs: suite.runtime.timeoutMs })
          if (response.error) status = "ERROR"
        } catch (error) {
          status = /Timed out waiting/u.test(error.message) ? "TIMEOUT" : "ERROR"
          response = { error: { message: error.message } }
          if (status === "TIMEOUT") session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: requestId } })
        }
        const elapsedMs = performance.now() - begin
        const correctness = isPreparedPayloadKind(target.kind) ? checkPreparedPayload(response.result, expected, sourceItem,
          { workspace: suite.workspace, overlays, versions: session.documentVersions, sourceUri: uri })
          : checkPreparedLocations(response.result, expected, suite.workspace, overlays)
        requests.push({ scenarioId: scenario.id, targetId: target.id, kind: target.kind, method,
          ...(target.kind === "completionResolve" ? { completionSourceTargetId: target.completionTargetId } : {}),
          ...(isCallFollowup(target.kind) ? { callHierarchySourceTargetId: target.callHierarchyTargetId } : {}),
          bucket: scenario.bucket, measurementState: readyMode ? "post-semantic-ready-unverified" : "candidate-ready-control", elapsedMs,
          ...(readyMode ? { readiness: { originGeneration: semantic.observed.semanticGeneration,
            originInputSha256: semantic.observed.inputIdentity.sha256, snapshot, verified: false } } : {}),
          priorCompleteSnapshot, cacheEvidence: "unproven",
          elapsedLowerBound: status === "TIMEOUT", status, error: response.error ?? null,
          documentVersion: session.documentVersions.get(uri), correctness })
        if (status === "COMPLETE" && correctness.equal) {
          completedQueries.set(queryIdentity, snapshot)
          if (target.kind === "completion") completionResults.set(target.id, {
            items: response.result.items, snapshot, documentVersion: session.documentVersions.get(uri),
          })
          if (target.kind === "prepareCallHierarchy") callHierarchyResults.set(target.id, {
            items: response.result, snapshot, documentVersion: session.documentVersions.get(uri),
          })
        }
        mark("request-complete", { scenarioId: scenario.id, elapsedMs, status, exact: correctness.equal })
        if (readyMode) {
          mark("semantic-readiness-query-validation-start", { scenarioId: scenario.id, prepare: false })
          const receipt = await observeSemanticReadiness(session, suite, false)
          const request = requests.at(-1)
          request.readiness.expectedOverlaysSha256 = preparedOverlayDigest(overlays, session.documentVersions)
          request.readiness.observed = receipt.semantic.observed
          request.readiness.verified = queryReadySnapshotMatches(semantic.observed, receipt.semantic,
            snapshot, overlays, session.documentVersions)
          if (request.readiness.verified) request.measurementState = "semantic-ready-snapshot"
          mark("semantic-readiness-query-validation-complete", { scenarioId: scenario.id,
            status: receipt.semantic.status, current: request.readiness.verified, elapsedMs: receipt.elapsedMs })
        }
      }
      if (readyMode) {
        mark("semantic-readiness-validation-start", { prepare: false })
        readinessValidation = (await observeSemanticReadiness(session, suite, false)).semantic
        const current = readinessValidation.status === "READY"
          && requests.at(-1)?.readiness?.verified === true
          && sameReadySnapshot(requests.at(-1)?.readiness?.observed, readinessValidation.observed)
        if (!current || requests.some(request => ["after-eviction", "pressure-recovery-repeat"].includes(request.bucket))) {
          for (const request of requests) {
            request.readiness.verified = false
            request.measurementState = "post-semantic-ready-unverified"
          }
        }
        mark("semantic-readiness-validation-complete", { status: readinessValidation.status, current })
        // Observe normal diagnostics only after every unopened measurement and
        // its non-preparing snapshot validation; never prewarm a target query.
        for (const request of requests.filter(request => request.bucket === "first-unopened-module")) {
          openTargetDocument(suite.targets.find(target => target.id === request.targetId))
        }
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
    readiness: { candidate, semantic, ...(readyMode ? { validation: readinessValidation } : {}) },
    preparation: { measurementState: "candidate-preparation-only", elapsedMs: preparationMs,
      timeToSemanticReadyMs, semanticPreparationMs, targetQueries: 0 },
    targetPool: suite.targets.map(({ expected, ...target }) => target),
    requests, blockedScenarios, bucketSummaries: summarizePreparedBuckets(suite, requests, semantic.status), diagnostics,
    memory: { ...preparedMemory(samples, targetPid, suite.runtime.sampleIntervalMs, samplerStderr),
      peakHarnessEventRssBytes: Math.max(...timeline.map(event => event.harnessRssBytes)) },
    correctness: { plannedRequests: suite.scenarios.length, executedRequests: requests.length,
      status: requests.length && !failure && requests.length === suite.scenarios.length && inputUnchanged
        && requests.every(request => request.status === "COMPLETE" && request.correctness.equal)
        && diagnosticsStatus === "PASS" ? "PASS" : failure || requests.length ? "FAIL" : "NOT_RUN" },
    gateStatus: { ready: semantic.status !== "READY" || readyMode && requests.some(request =>
      request.status !== "COMPLETE" || !request.correctness.equal) ? "FAIL" : readyMode && inputUnchanged && !failure
      && requests.length === suite.scenarios.length && requests.length > 0
      && requests.every(request => request.readiness?.verified && request.status === "COMPLETE" && request.correctness.equal)
      ? "PASS" : "BLOCKED", latency: "BLOCKED", memory: "BLOCKED", portability: "NOT_RUN",
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

  function observedEmptyContext() {
    const start = timeline.find(event => event.phase === "request-start")?.timestamp
    if (start === undefined) return null
    const events = readStructuredLogs(logDir)
    const index = events.findLastIndex(event => event.event === "semantic.context.evict"
      && event.reason === "memory-level3" && event.residentContextCount === 0
      && Date.parse(event.ts) >= start)
    if (index < 0 || events.slice(index + 1).some(event => event.event === "semantic.context.create"
      || event.event === "semantic.worker.started")) return null
    return events[index]
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
