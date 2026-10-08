import fs from "node:fs"
import { AsyncLocalStorage } from "node:async_hooks"
import { parentPort, threadId, workerData } from "node:worker_threads"

import type { DocumentSnapshot } from "../contracts/document.js"
import type * as Contract from "../contracts/semantic-engine.js"
import type { StructuredLogger } from "../observability/logger.js"
import { SingleRootProjectResolver } from "../project/single-root-project-resolver.js"
import { OhosTypeScriptSemanticEngine } from "./backends/ohos-typescript/engine.js"
import { semanticRuntimeMetrics } from "./coordinator/metrics.js"
import { SemanticMemoryPolicy } from "./coordinator/memory-policy.js"
import { createPostEvictionGcProbe } from "./coordinator/post-eviction-gc-probe.js"
import type { SemanticMemoryLevel } from "./coordinator/semantic-coordinator.js"
import type { SemanticRuntimeConfig } from "./coordinator/runtime-config.js"
import { runTransientDiagnosis } from "./diagnostics/transient-diagnosis.js"
import type { ReferenceSearchRuntimeConfig } from "./references/reference-runtime.js"
import type { InteractiveSemanticRuntimeConfig } from "./interactive-runtime.js"
import { SemanticCancellationScope } from "./semantic-cancellation-scope.js"
import { isInteractiveSemanticWorkerMethod } from "./semantic-request-lanes.js"
import { isWorkerControl, requireParentPort, type WorkerControl } from "./semantic-worker-runtime-control.js"
import {
  SEMANTIC_WORKER_PROTOCOL_VERSION,
  SemanticWorkerCancelState,
  createSemanticWorkerError,
  decodeSemanticWorkerMutation,
  decodeSemanticWorkerRequest,
  readSemanticWorkerCancellationState,
  type SemanticWorkerErrorCode,
  type SemanticWorkerMutation,
  type SemanticWorkerRequest,
} from "./worker-protocol.js"

interface RuntimeWorkerData {
  readonly rootUri: string
  readonly projectConfiguration?: unknown
  readonly sdkConfiguration?: unknown
  readonly runtimeConfig: SemanticRuntimeConfig & { readonly memoryBudgetBytes: number }
  readonly references?: ReferenceSearchRuntimeConfig
  readonly interactive?: InteractiveSemanticRuntimeConfig
  readonly metricsPath?: string
}

const port = requireParentPort(parentPort)
const data = workerData as RuntimeWorkerData
const roots = new Map<number, string>()
const configuredRoots = new Set([data.rootUri])
const documents = new Map<string, DocumentSnapshot>()
const appliedRevisions = new Map<number, number>()
const projects = new SingleRootProjectResolver(data.rootUri)
const cancellation = new SemanticCancellationScope()
const referenceTraces = new AsyncLocalStorage<string | undefined>()
const testDiagnoseHoldMs = Number(process.env.ARKTS_TEST_WORKER_DIAGNOSE_HOLD_MS ?? 0)
const testDiagnoseHoldSuffix = process.env.ARKTS_TEST_WORKER_DIAGNOSE_HOLD_URI_SUFFIX
let testDiagnoseHeld = false
const logger: StructuredLogger = {
  info: (event, fields) => postLog("info", event, referenceFields(event, fields)),
  error: (event, fields) => postLog("error", event, referenceFields(event, fields)),
}
const engine = new OhosTypeScriptSemanticEngine(projects, logger, {
  maxResidentContexts: data.runtimeConfig.maxResidentContexts,
  hostCancellationToken: cancellation.hostToken,
  references: data.references,
  interactiveSdkAmbientProfile: data.interactive?.sdkAmbientProfile,
  interactiveProjectRootProfile: data.interactive?.projectRootProfile,
  memberCompletionProjectRootProfile: data.interactive?.memberCompletionProjectRootProfile,
  autoImportProjectRootProfile: data.interactive?.autoImportProjectRootProfile,
  autoImportBatchRootLimit: data.interactive?.autoImportBatchRootLimit,
  autoImportTrimBetweenBatches: data.interactive?.autoImportTrimBetweenBatches,
})
const memoryPolicy = new SemanticMemoryPolicy(data.runtimeConfig)
const postEvictionGcProbe = createPostEvictionGcProbe(
  process.env.ARKTS_BENCHMARK_CONTROL === "1" && process.env.ARKTS_L01_POST_EVICTION_GC_PROBE === "1",
  logger, () => engine.runtimeStats())
let projectConfiguration = data.projectConfiguration
let sdkConfiguration = data.sdkConfiguration
let memoryLevel: SemanticMemoryLevel = "level0"
let witnessedL3Eviction = false

engine.configureProject(data.projectConfiguration)
engine.configureSdk(data.sdkConfiguration)

let queue = Promise.resolve()
let disposed = false
let activeGlobalReferenceTraceId: string | undefined
const sampleTimer = setInterval(sampleMemory, data.runtimeConfig.sampleIntervalMs)
sampleTimer.unref()

port.on("message", (message: unknown) => {
  const receivedAt = performance.now()
  queue = queue.then(() => dispatch(message, receivedAt)).catch((error) => {
    process.stderr.write(`semantic worker fatal: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
    dispose()
  })
})

port.on("close", dispose)

async function dispatch(message: unknown, receivedAt: number): Promise<void> {
  if (isWorkerControl(message)) {
    applyControl(message)
    return
  }
  if (isMutationLike(message)) {
    applyMutation(decodeSemanticWorkerMutation(message))
    sampleMemory()
    return
  }
  const request = decodeSemanticWorkerRequest(message)
  const traceId = request.method === "references" || request.method === "define"
    ? request.args.traceId : undefined
  if (request.method === "references" && data.references?.trace) {
    logger.info("references.queue.start", {
      traceId,
      requestId: request.id,
      requiredRevision: request.requiredRevision,
      queueWaitMs: Math.round((performance.now() - receivedAt) * 100) / 100,
    })
  } else if (
    activeGlobalReferenceTraceId
    && data.references?.trace
    && isInteractiveSemanticWorkerMethod(request.method)
  ) {
    logger.info("references.interactive.start", {
      traceId: activeGlobalReferenceTraceId,
      method: request.method,
      queueWaitMs: Math.round((performance.now() - receivedAt) * 100) / 100,
    })
  }
  const run = () => referenceTraces.run(traceId, () => answerRequest(request))
  if (request.method === "references") {
    activeGlobalReferenceTraceId = traceId
    void run().then(sampleMemory, failRuntime).finally(() => {
      if (activeGlobalReferenceTraceId === traceId) activeGlobalReferenceTraceId = undefined
    })
    return
  }
  await run()
  sampleMemory()
}

function referenceFields(
  event: string,
  fields: Parameters<StructuredLogger["info"]>[1],
): Parameters<StructuredLogger["info"]>[1] {
  const traceId = referenceTraces.getStore()
  return traceId && event.startsWith("references.")
    ? { ...fields, traceId }
    : fields
}

function failRuntime(error: unknown): void {
  process.stderr.write(`semantic worker fatal: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
  dispose()
}

function applyControl(control: WorkerControl): void {
  if (control.control === "registerRoot") {
    roots.set(control.epoch, control.rootUri)
    configuredRoots.add(control.rootUri)
    projects.configure([...configuredRoots])
    appliedRevisions.set(control.epoch, 0)
  } else if (control.control === "configureProject") {
    projectConfiguration = control.value
    engine.configureProject(control.value)
  } else if (control.control === "configureSdk") {
    sdkConfiguration = control.value
    engine.configureSdk(control.value)
  } else if (control.control === "recycleWitness") {
    const stats = engine.runtimeStats()
    const eligible = witnessedL3Eviction && stats.residentContextCount === 0
      && stats.leaseCount === 0 && activeGlobalReferenceTraceId === undefined
    port.postMessage({ workerEvent: "recycleWitness", token: control.token,
      eligible, reason: eligible ? "ready" : !witnessedL3Eviction
        ? "no-l3-eviction" : "worker-not-quiescent", threadId })
  } else {
    memoryLevel = control.value
    const before = engine.runtimeStats()
    engine.applyMemoryPressure(control.value)
    if (control.value === "level3"
      && engine.runtimeStats().residentContextCount < before.residentContextCount) {
      witnessedL3Eviction = true
    }
    postEvictionGcProbe("explicit-control", control.value, before)
  }
}

function applyMutation(mutation: SemanticWorkerMutation): void {
  const rootUri = roots.get(mutation.epoch)
  if (!rootUri) throw new Error("semantic worker mutation has no registered root")
  const previousRevision = appliedRevisions.get(mutation.epoch) ?? 0
  if (mutation.revision !== previousRevision + 1) {
    throw new Error("semantic worker mutation revision is not contiguous")
  }
  if (mutation.kind === "workspaceFilesChanged") {
    engine.workspaceFilesChanged([{
      rootUri: mutation.rootUri,
      rootDirty: mutation.rootDirty,
      resourceDirty: mutation.resourceDirty,
      resourceChanged: mutation.resourceChanged,
      changes: [...mutation.changes],
    }])
  } else if (mutation.kind === "close") {
    const previous = documents.get(mutation.uri)
    documents.delete(mutation.uri)
    if (previous?.version !== 0) engine.close(mutation.uri)
  } else {
    const snapshot = Object.freeze({
      uri: mutation.uri,
      version: mutation.documentVersion,
      text: mutation.text as string,
      workspaceId: rootUri,
    })
    documents.set(mutation.uri, snapshot)
    if (snapshot.version !== 0) engine.sync(snapshot)
  }
  appliedRevisions.set(mutation.epoch, mutation.revision)
  port.postMessage({
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: mutation.epoch,
    appliedRevision: mutation.revision,
  })
}

async function answerRequest(request: SemanticWorkerRequest): Promise<void> {
  const rootUri = roots.get(request.epoch)
  const appliedRevision = appliedRevisions.get(request.epoch) ?? 0
  if (!rootUri || appliedRevision !== request.requiredRevision) {
    postError(request, "restart-required")
    return
  }
  const document = documents.get(request.uri)
  if (!document || (
    request.expectedDocumentVersion !== null
    && document.version !== request.expectedDocumentVersion
  )) {
    postError(request, "content-modified")
    return
  }
  try {
    const value = await cancellation.run(request.cancelCell, () => invoke(request, document, rootUri))
    port.postMessage({
      protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
      epoch: request.epoch,
      id: request.id,
      appliedRevision: request.requiredRevision,
      documentVersion: request.expectedDocumentVersion,
      ok: true,
      value,
    })
  } catch {
    const state = readSemanticWorkerCancellationState(request.cancelCell)
    const code: SemanticWorkerErrorCode = state === SemanticWorkerCancelState.clientCancelled
      ? "client-cancelled"
      : state === SemanticWorkerCancelState.contentModified
        ? "content-modified"
        : state === SemanticWorkerCancelState.supervisorDisposing
          ? "worker-unavailable"
          : "internal-error"
    postError(request, code)
  }
}

function invoke(
  request: SemanticWorkerRequest,
  document: DocumentSnapshot,
  rootUri: string,
): Promise<unknown> {
  const signal = cancellationSignal(request.cancelCell)
  switch (request.method) {
    case "complete": return valueOf(engine.complete({
      document,
      position: request.args.position,
      completionOptions: { snippets: request.args.snippets === true },
      completionDiscovery: request.args.discovery,
      signal,
    }))
    case "resolveCompletion": return valueOf(engine.resolveCompletion({
      document,
      position: request.args.position,
      completion: request.args.completion as unknown as Contract.SemanticCompletion,
      completionOptions: { snippets: request.args.snippets === true },
      signal,
    }))
    case "define": return valueOf(request.args.isolate
      ? engine.referenceAnchor({ document, position: request.args.position, signal })
      : engine.define({ document, position: request.args.position, signal }))
    case "typeDefinitions": return valueOf(engine.typeDefinitions({ document, position: request.args.position, signal }))
    case "implementations": return valueOf(engine.implementations({ document, position: request.args.position, signal }))
    case "references": return valueOf(engine.referencesWithCandidates({
      document,
      position: request.args.position,
      includeDeclaration: request.args.includeDeclaration,
      signal,
    }, request.args.candidateUris, request.args.candidateIdentityComplete === true,
    request.args.candidateAnchorUri, request.args.candidateSupportUris,
    request.args.forceLegacy === true, request.args.candidateAnchorPosition))
    case "prepareRename": return valueOf(engine.prepareRename({ document, position: request.args.position, signal }))
    case "rename": return valueOf(engine.rename({
      document,
      position: request.args.position,
      newName: request.args.newName,
      signal,
    }))
    case "documentHighlights": return valueOf(engine.documentHighlights({
      document,
      position: request.args.position,
      signal,
    }))
    case "inlayHints": return valueOf(engine.inlayHints({ document, range: request.args.range, signal }))
    case "foldingRanges": return valueOf(engine.foldingRanges({ document, ...request.args, signal }))
    case "formatDocument": return valueOf(engine.formatDocument({ document, options: request.args.options, signal }))
    case "documentSymbols": return valueOf(engine.documentSymbols({ document, signal }))
    case "diagnose": return diagnose(document, signal)
    case "codeActions": return valueOf(engine.codeActions({ document, range: request.args.range, signal }))
    case "resolveCodeAction": return valueOf(engine.resolveCodeAction({
      document,
      action: request.args.action as unknown as Contract.SemanticCodeAction,
      signal,
    }))
    case "hover": return valueOf(engine.hover({ document, position: request.args.position, signal }))
    case "signatureHelp": return valueOf(engine.signatureHelp({
      document,
      position: request.args.position,
      triggerReason: request.args.triggerReason,
      signal,
    }))
    case "prepareCallHierarchy": return valueOf(engine.prepareCallHierarchy({
      document,
      position: request.args.position,
      signal,
    }))
    case "outgoingCalls": return engine.outgoingCalls({
      source: callHierarchySource(document, rootUri),
      item: { ...request.args.item, sourceFingerprint: request.args.sourceFingerprint },
      signal,
    })
    case "incomingCalls": return engine.incomingCalls({
      source: callHierarchySource(document, rootUri),
      item: { ...request.args.item, sourceFingerprint: request.args.sourceFingerprint },
      signal,
    })
  }
}

function diagnose(document: DocumentSnapshot, signal: AbortSignal): Promise<unknown> {
  if (!testDiagnoseHeld
    && typeof testDiagnoseHoldSuffix === "string"
    && testDiagnoseHoldSuffix.length > 0
    && document.uri.endsWith(testDiagnoseHoldSuffix)
    && Number.isSafeInteger(testDiagnoseHoldMs)
    && testDiagnoseHoldMs > 0
    && testDiagnoseHoldMs <= 5_000) {
    testDiagnoseHeld = true
    return holdTestDiagnosis(document, signal)
  }
  if (process.env.ARKTS_BENCHMARK_CONTROL === "1"
    && process.env.ARKTS_L01_TRANSIENT_DIAGNOSTICS === "1"
    && memoryLevel === "level3") {
    logger.info("diagnostics.transient.start", { uri: document.uri, documentVersion: document.version, memoryLevel })
    return runTransientDiagnosis({
      rootUri: document.workspaceId,
      documents: [...documents.values()].filter(snapshot => snapshot.workspaceId === document.workspaceId),
      document,
      projectConfiguration,
      sdkConfiguration,
      interactiveSdkAmbientProfile: data.interactive?.sdkAmbientProfile,
      interactiveProjectRootProfile: data.interactive?.projectRootProfile,
    }, signal).then(result => {
      logger.info("diagnostics.transient.complete", {
        uri: document.uri, documentVersion: document.version, memoryLevel,
        diagnosticCount: result.value.length,
      })
      return result.value
    })
  }
  return valueOf(engine.diagnose({ document, signal }))
}

async function holdTestDiagnosis(document: DocumentSnapshot, signal: AbortSignal): Promise<unknown> {
  logger.info("semantic.test.diagnose.hold.start", { uri: document.uri, delayMs: testDiagnoseHoldMs })
  await new Promise(resolve => setTimeout(resolve, testDiagnoseHoldMs))
  logger.info("semantic.test.diagnose.hold.end", { uri: document.uri })
  return valueOf(engine.diagnose({ document, signal }))
}

async function valueOf<Value>(result: Promise<Contract.VersionedSemanticResult<Value>>): Promise<Value> {
  return (await result).value
}

function callHierarchySource(
  document: DocumentSnapshot,
  workspaceRootUri: string,
): Contract.SemanticCallHierarchySource {
  return document.version === 0
    ? {
        kind: "disk",
        uri: document.uri,
        text: document.text,
        workspaceId: document.workspaceId,
        workspaceRootUri,
      }
    : { kind: "open", document, workspaceRootUri }
}

function postError(request: SemanticWorkerRequest, code: SemanticWorkerErrorCode): void {
  port.postMessage({
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: request.epoch,
    id: request.id,
    appliedRevision: request.requiredRevision,
    documentVersion: request.expectedDocumentVersion,
    ok: false,
    error: createSemanticWorkerError(code),
  })
}

function cancellationSignal(cell: SharedArrayBuffer): AbortSignal {
  const reason = new Error("Semantic worker request cancelled")
  return {
    get aborted() {
      return readSemanticWorkerCancellationState(cell) !== SemanticWorkerCancelState.active
    },
    get reason() { return reason },
  } as AbortSignal
}

function sampleMemory(): void {
  if (disposed) return
  const memory = process.memoryUsage()
  const before = engine.runtimeStats()
  writeMetrics(semanticRuntimeMetrics({
    memoryUsage: memory,
    semanticWorkerCount: 1,
    residentContextCount: before.residentContextCount,
    projectFiles: before.projectFiles,
    openDocuments: before.openDocuments,
    leaseCount: before.leaseCount,
  }))
  memoryLevel = memoryPolicy.levelFor(
    memory.rss,
    data.runtimeConfig.memoryBudgetBytes,
  )
  engine.applyMemoryPressure(memoryLevel)
  if (memoryLevel === "level3"
    && engine.runtimeStats().residentContextCount < before.residentContextCount) {
    witnessedL3Eviction = true
  }
  postEvictionGcProbe("automatic-sample", memoryLevel, before)
}

function writeMetrics(metrics: ReturnType<typeof semanticRuntimeMetrics>): void {
  if (!data.metricsPath) return
  try { fs.appendFileSync(data.metricsPath, `${JSON.stringify(metrics)}\n`) }
  catch (error) {
    process.stderr.write(`semantic metrics write failed: ${error instanceof Error ? error.message : String(error)}\n`)
  }
}

function postLog(
  level: "info" | "error",
  event: string,
  fields: Parameters<StructuredLogger["info"]>[1],
): void {
  port.postMessage({ workerEvent: "log", level, event, fields: fields ?? {} })
}

function dispose(): void {
  if (disposed) return
  disposed = true
  clearInterval(sampleTimer)
  engine.dispose()
}

function isMutationLike(value: unknown): boolean {
  return value !== null && typeof value === "object" && "revision" in value
}
