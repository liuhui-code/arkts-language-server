import fs from "node:fs"
import { parentPort, workerData, type MessagePort } from "node:worker_threads"

import type { DocumentSnapshot } from "../contracts/document.js"
import type * as Contract from "../contracts/semantic-engine.js"
import type { StructuredLogger } from "../observability/logger.js"
import { SingleRootProjectResolver } from "../project/single-root-project-resolver.js"
import { OhosTypeScriptSemanticEngine } from "./backends/ohos-typescript/engine.js"
import { semanticRuntimeMetrics } from "./coordinator/metrics.js"
import { SemanticMemoryPolicy } from "./coordinator/memory-policy.js"
import type { SemanticRuntimeConfig } from "./coordinator/runtime-config.js"
import { SemanticCancellationScope } from "./semantic-cancellation-scope.js"
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
  readonly metricsPath?: string
}

interface RegisterRootControl {
  readonly control: "registerRoot"
  readonly epoch: number
  readonly rootUri: string
}

type ConfigurationControl =
  | { readonly control: "configureProject"; readonly value: unknown }
  | { readonly control: "configureSdk"; readonly value: unknown }

interface MemoryPressureControl {
  readonly control: "applyMemoryPressure"
  readonly value: "level3"
}

type WorkerControl = RegisterRootControl | ConfigurationControl | MemoryPressureControl

const port = requireParentPort(parentPort)
const data = workerData as RuntimeWorkerData
const roots = new Map<number, string>()
const configuredRoots = new Set([data.rootUri])
const documents = new Map<string, DocumentSnapshot>()
const appliedRevisions = new Map<number, number>()
const projects = new SingleRootProjectResolver(data.rootUri)
const cancellation = new SemanticCancellationScope()
const logger: StructuredLogger = {
  info: (event, fields) => postLog("info", event, fields),
  error: (event, fields) => postLog("error", event, fields),
}
const engine = new OhosTypeScriptSemanticEngine(projects, logger, {
  maxResidentContexts: data.runtimeConfig.maxResidentContexts,
  hostCancellationToken: cancellation.hostToken,
})
const memoryPolicy = new SemanticMemoryPolicy(data.runtimeConfig)

engine.configureProject(data.projectConfiguration)
engine.configureSdk(data.sdkConfiguration)

let queue = Promise.resolve()
let disposed = false
const sampleTimer = setInterval(sampleMemory, data.runtimeConfig.sampleIntervalMs)
sampleTimer.unref()

port.on("message", (message: unknown) => {
  queue = queue.then(() => dispatch(message)).catch((error) => {
    process.stderr.write(`semantic worker fatal: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
    dispose()
  })
})

port.on("close", dispose)

async function dispatch(message: unknown): Promise<void> {
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
  await answerRequest(request)
  sampleMemory()
}

function applyControl(control: WorkerControl): void {
  if (control.control === "registerRoot") {
    roots.set(control.epoch, control.rootUri)
    configuredRoots.add(control.rootUri)
    projects.configure([...configuredRoots])
    appliedRevisions.set(control.epoch, 0)
  } else if (control.control === "configureProject") {
    engine.configureProject(control.value)
  } else if (control.control === "configureSdk") {
    engine.configureSdk(control.value)
  } else {
    engine.applyMemoryPressure(control.value)
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
    case "define": return valueOf(engine.define({ document, position: request.args.position, signal }))
    case "typeDefinitions": return valueOf(engine.typeDefinitions({ document, position: request.args.position, signal }))
    case "implementations": return valueOf(engine.implementations({ document, position: request.args.position, signal }))
    case "references": return valueOf(engine.references({
      document,
      position: request.args.position,
      includeDeclaration: request.args.includeDeclaration,
      signal,
    }))
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
    case "diagnose": return valueOf(engine.diagnose({ document, signal }))
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
  engine.applyMemoryPressure(memoryPolicy.levelFor(
    memory.rss,
    data.runtimeConfig.memoryBudgetBytes,
  ))
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

function isWorkerControl(value: unknown): value is WorkerControl {
  if (!value || typeof value !== "object") return false
  const control = (value as { control?: unknown }).control
  if (control === "registerRoot") {
    const candidate = value as Partial<RegisterRootControl>
    return Number.isSafeInteger(candidate.epoch)
      && typeof candidate.rootUri === "string"
      && candidate.rootUri.startsWith("file:")
  }
  if (control === "applyMemoryPressure") {
    return (value as Partial<MemoryPressureControl>).value === "level3"
  }
  return control === "configureProject" || control === "configureSdk"
}

function requireParentPort(candidate: MessagePort | null): MessagePort {
  if (!candidate) throw new Error("semantic worker requires a parent port")
  return candidate
}
