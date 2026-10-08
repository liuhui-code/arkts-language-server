import fs from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import path from "node:path"

import type { DocumentSnapshot } from "../contracts/document.js"
import type { ProjectResolverPort } from "../contracts/project-resolver.js"
import type {
  WorkspaceExportIndexPort,
  WorkspaceReferenceIndexPort,
} from "../contracts/workspace-index.js"
import type * as Contract from "../contracts/semantic-engine.js"
import { isArkUIStringResourcePath } from "../core/arkui/resource-path.js"
import { LocalPackageResolver } from "../core/sdk/local-package-resolver.js"
import type { StructuredLogger } from "../observability/logger.js"
import { OHOS_TYPESCRIPT_BACKEND_IDENTITY } from "./backends/ohos-typescript/identity.js"
import type { SemanticBackend } from "./backends/semantic-backend.js"
import { referenceSearchRuntimeConfig } from "./references/reference-runtime.js"
import { logReferenceCandidateSelection } from "./references/reference-index-telemetry.js"
import { selectReferenceCandidates, type ReferenceCandidateSelection } from "./references/reference-candidate-selection.js"
import { interactiveSemanticRuntimeConfig } from "./interactive-runtime.js"
import { discoverCompletionCandidates } from "./completion-discovery.js"
import { resourceEventPath, toFilePath } from "./semantic-worker-file-identity.js"
import { SemanticWorkerHost, semanticWorkerData,
  type DeferredSemanticMutation } from "./semantic-worker-host.js"
import { ReferenceIndexFreshness } from "./references/reference-index-freshness.js"
import { ReferenceInputState, type ReferenceInputSnapshot } from "./references/reference-input-snapshot.js"
import { ReferenceResultCache } from "./references/reference-result-cache.js"
import { logReferenceCache } from "./references/reference-cache-telemetry.js"
import {
  SemanticWorkerCancelState,
  SemanticWorkerSupervisorError,
  isSemanticWorkerUriWithinRoot,
  type RootSemanticWorkerMutationInput,
  type RootSemanticWorkerRequestInput,
} from "./semantic-worker-supervisor.js"
import type {
  SemanticWorkerJsonObject,
  SemanticWorkerJsonValue,
  SemanticWorkerMethod,
  SemanticWorkerRequestArgsByMethod,
} from "./worker-protocol.js"

interface SemanticWorkerProxyOptions {
  readonly env?: NodeJS.ProcessEnv
  readonly workerPath?: string
  readonly exportIndex?: WorkspaceExportIndexPort
  readonly referenceIndex?: WorkspaceReferenceIndexPort
}

type TrackedDocument = DocumentSnapshot

export class SemanticWorkerEngine implements Contract.SemanticEnginePort, SemanticBackend {
  readonly backendIdentity = OHOS_TYPESCRIPT_BACKEND_IDENTITY
  readonly #projects: ProjectResolverPort
  readonly #logger: StructuredLogger | undefined
  readonly #environment: NodeJS.ProcessEnv
  readonly #workerPath: string
  readonly #exportIndex: WorkspaceExportIndexPort | undefined
  readonly #referenceIndex: WorkspaceReferenceIndexPort | undefined
  readonly #packageResolver = new LocalPackageResolver()
  readonly #documents = new Map<string, TrackedDocument>()
  readonly #referenceIndexFreshness = new ReferenceIndexFreshness()
  readonly #host: SemanticWorkerHost
  readonly #referenceResults = new ReferenceResultCache()
  readonly #referenceInputs = new ReferenceInputState()
  readonly #pendingMutations = new Set<Promise<void>>()
  readonly #deferredMutations: DeferredSemanticMutation[] = []
  #inFlightPreparations = 0
  #inFlightRequests = 0
  #recycling = false
  #recycleMutationObserved = false
  #projectConfiguration: unknown
  #sdkConfiguration: unknown
  #failure: unknown
  #disposed = false

  constructor(
    projects: ProjectResolverPort,
    logger?: StructuredLogger,
    options: SemanticWorkerProxyOptions = {},
  ) {
    this.#projects = projects
    this.#logger = logger
    this.#environment = options.env ?? process.env
    this.#exportIndex = options.exportIndex
    this.#referenceIndex = options.referenceIndex
    const adjacentWorker = path.join(__dirname, "semantic-worker.cjs")
    this.#workerPath = options.workerPath ?? (fs.existsSync(adjacentWorker)
      ? adjacentWorker
      : path.resolve(process.cwd(), "dist", "semantic-worker.cjs"))
    this.#host = new SemanticWorkerHost({
      workerPath: this.#workerPath,
      logger,
      environment: this.#environment,
      onFailure: error => { this.#failure = error },
      workerData: rootUri => semanticWorkerData(rootUri, this.#environment,
        this.#projectConfiguration, this.#sdkConfiguration),
    })
  }

  configureProject(selection: unknown): void {
    if (this.#recycling) this.#recycleMutationObserved = true
    const ownedSelection = structuredClone(selection)
    this.#referenceInputs.configurationChanged()
    this.#referenceResults.clear()
    this.#projectConfiguration = ownedSelection
    this.#packageResolver.configureProject(ownedSelection)
    this.#host.sendControl({ control: "configureProject", value: ownedSelection })
  }

  configureSdk(selection: unknown): void {
    if (this.#recycling) this.#recycleMutationObserved = true
    const ownedSelection = structuredClone(selection)
    this.#referenceInputs.configurationChanged()
    this.#referenceResults.clear()
    this.#sdkConfiguration = ownedSelection
    this.#host.sendControl({ control: "configureSdk", value: ownedSelection })
  }

  applyMemoryPressure(level: "level2" | "level3"): void {
    this.#referenceResults.clear()
    this.#host.sendControl({ control: "applyMemoryPressure", value: level })
  }

  async recycleSemanticWorker(): Promise<{
    recycled: true; oldThreadId: number; newThreadId: number
  }> {
    if (this.#environment.ARKTS_BENCHMARK_CONTROL !== "1"
      || this.#environment.ARKTS_L01_SEMANTIC_WORKER_RECYCLE !== "1") {
      throw new Error("Semantic Worker recycle is disabled")
    }
    this.#assertAvailable()
    if (this.#recycling || this.#host.rootCount !== 1 || this.#documents.size === 0
      || this.#inFlightPreparations !== 0 || this.#inFlightRequests !== 0
      || this.#pendingMutations.size !== 0) {
      throw new Error("Semantic Worker recycle requires one quiescent root")
    }
    const rootUri = this.#host.singleRootUri as string
    if ([...this.#documents.values()].some(document => document.workspaceId !== rootUri)) {
      throw new Error("Semantic Worker recycle requires one quiescent root")
    }
    this.#recycling = true
    this.#recycleMutationObserved = false
    this.#referenceResults.clear()
    this.#referenceInputs.configurationChanged()
    let replacing = false
    try {
      const witness = await this.#host.recycleWitness()
      if (this.#recycleMutationObserved) {
        throw new Error("Semantic Worker changed during recycle witness")
      }
      if (!witness.eligible) throw new Error(`Semantic Worker recycle unavailable: ${witness.reason}`)
      if (this.#failure) throw this.#failure
      replacing = true
      const oldThreadId = await this.#host.replaceWorker()
      const supervisor = this.#host.supervisor(rootUri)
      for (const document of this.#documents.values()) {
        await supervisor.mutate({ kind: "open", uri: document.uri,
          documentVersion: document.version, text: document.text })
      }
      await this.#host.flushMutations(this.#deferredMutations)
      const newThreadId = this.#host.threadId()
      if (oldThreadId < 1 || newThreadId < 1 || oldThreadId === newThreadId) {
        throw new Error("Semantic Worker recycle did not establish a new thread")
      }
      if (this.#failure) throw this.#failure
      replacing = false
      if (this.#recycleMutationObserved) {
        throw new Error("Semantic Worker changed during recycle")
      }
      return { recycled: true, oldThreadId, newThreadId }
    } catch (error) {
      if (replacing) this.#failure = error
      else await this.#host.flushMutations(this.#deferredMutations)
        .catch(failure => { this.#failure = failure; throw failure })
      throw error
    } finally {
      this.#recycling = false
    }
  }

  isResourceFile(rootUri: string, fileUri: string): boolean {
    const root = toFilePath(rootUri)
    const candidate = toFilePath(fileUri)
    if (!root || !candidate) return false
    const scope = this.#packageResolver.projectFor(root).scopeFor(candidate)
    if (scope.status === "unconfigured") return isArkUIStringResourcePath(candidate)
    if (scope.status !== "ready") return false
    const physicalCandidate = resourceEventPath(candidate)
    return scope.resourceRoots.some((resourceRoot) => {
      const segments = path.relative(resourceEventPath(resourceRoot), physicalCandidate).split(path.sep)
      return segments.length === 3 && segments[0] !== ".."
        && segments[1] === "element" && segments[2] === "string.json"
    })
  }

  sync(document: DocumentSnapshot): void {
    if (!document.uri.startsWith("file:")) return
    if (!isSemanticWorkerUriWithinRoot(document.uri, document.workspaceId)) return
    const snapshot = Object.freeze({ ...document })
    const previous = this.#documents.get(document.uri)
    this.#documents.set(document.uri, snapshot)
    if (previous?.version === snapshot.version && previous.text === snapshot.text) return
    this.#mutate(snapshot.workspaceId, {
      kind: previous ? "change" : "open",
      uri: snapshot.uri,
      documentVersion: snapshot.version,
      text: snapshot.text,
    })
  }

  close(documentUri: string): void {
    const document = this.#documents.get(documentUri)
    if (!document) return
    this.#documents.delete(documentUri)
    this.#mutate(document.workspaceId, {
      kind: "close",
      uri: documentUri,
      documentVersion: document.version,
    })
  }

  workspaceFilesChanged(batches: readonly Contract.SemanticWorkspaceFileChangeBatch[]): void {
    if (batches.length > 0) this.#referenceResults.clear()
    for (const batch of batches) {
      this.#referenceIndexFreshness.workspaceFilesChanged(batch, this.#referenceIndex)
      const rootPath = toFilePath(batch.rootUri)
      if (rootPath) this.#packageResolver.invalidate(rootPath)
      this.#mutate(batch.rootUri, {
        kind: "workspaceFilesChanged",
        rootUri: batch.rootUri,
        rootDirty: batch.rootDirty,
        resourceDirty: batch.resourceDirty === true,
        resourceChanged: batch.resourceChanged === true,
        changes: batch.changes,
      })
    }
  }

  indexCatalog(workspaceId: string, phase: "starting" | "ready"): Promise<void> | void { if (this.#referenceIndex) return this.#referenceIndexFreshness.catalog(workspaceId, phase, this.#referenceIndex) }

  async complete(query: Contract.SemanticQuery) {
    this.#inFlightPreparations += 1
    try {
      const discovery = await discoverCompletionCandidates(this.#exportIndex, query)
      return this.#documentRequest<Contract.SemanticCompletionList>("complete", query, {
        position: query.position,
        snippets: query.completionOptions?.snippets === true,
        ...(discovery ? { discovery } : {}),
      })
    } finally { this.#inFlightPreparations -= 1 }
  }

  resolveCompletion(query: Contract.SemanticCompletionResolveQuery) {
    this.sync(query.document)
    const { preResolved, ...completion } = query.completion
    if (
      interactiveSemanticRuntimeConfig(this.#environment).autoImportProjectRootProfile
        === "discovery"
      && preResolved?.documentVersion === query.document.version
      && (preResolved.additionalTextEdits ?? []).every((edit) => (
        edit.uri === query.document.uri && edit.expectedVersion === query.document.version
      ))
    ) {
      return Promise.resolve({
        documentVersion: query.document.version,
        value: {
          ...completion,
          detail: preResolved.detail,
          documentation: preResolved.documentation,
          additionalTextEdits: preResolved.additionalTextEdits,
          data: { ...completion.data, resolved: true },
        },
      })
    }
    return this.#documentRequest<Contract.SemanticCompletion>("resolveCompletion", query, {
      position: query.position,
      completion: completion as unknown as SemanticWorkerJsonObject,
      snippets: query.completionOptions?.snippets === true,
    })
  }

  define(query: Contract.SemanticQuery) {
    return this.#documentRequest<Contract.SemanticDefinition[]>("define", query, {
      position: query.position,
    })
  }

  typeDefinitions(query: Contract.SemanticQuery) {
    return this.#documentRequest<Contract.SemanticDefinition[]>("typeDefinitions", query, {
      position: query.position,
    })
  }

  implementations(query: Contract.SemanticQuery) {
    return this.#documentRequest<Contract.SemanticDefinition[]>("implementations", query, {
      position: query.position,
    })
  }

  cachedReferences(query: Contract.SemanticReferencesQuery, traceId?: string) {
    if (query.signal?.aborted) return undefined
    this.sync(query.document)
    const cached = query.signal?.aborted ? undefined : this.#referenceResults.get(query)
    if (!cached) return undefined
    logReferenceCache(this.#logger, this.#referenceResults, "references.cache.hit",
      traceId ?? (this.#environment.ARKTS_REFERENCES_TRACE === "1" ? randomUUID() : undefined))
    return { documentVersion: query.document.version, value: cached }
  }

  async references(query: Contract.SemanticReferencesQuery, allowLocalSeed = true): Promise<Contract.VersionedSemanticResult<Contract.SemanticReferencesOutcome>> {
    this.#inFlightPreparations += 1
    try {
      query = Object.freeze({ ...query,
        document: Object.freeze({ ...query.document }),
        position: Object.freeze({ ...query.position }),
      })
      const traceId = this.#environment.ARKTS_REFERENCES_TRACE === "1" ? randomUUID() : undefined
      const cached = this.cachedReferences(query, traceId)
      if (cached) return cached
      const snapshot = this.#referenceInputs.capture(query.document.workspaceId,
        this.#documents.values(), this.#projectConfiguration, this.#sdkConfiguration)
      logReferenceCache(this.#logger, this.#referenceResults, "references.cache.miss", traceId)
      const selectionStarted = performance.now()
      const candidates = await this.#referenceCandidates(query, snapshot, traceId, allowLocalSeed)
      this.#assertReferenceSnapshot(snapshot)
      logReferenceCandidateSelection(this.#logger,
        referenceSearchRuntimeConfig(this.#environment).strategy, traceId, selectionStarted, candidates)
      const response = await this.#documentRequest<Contract.SemanticReferencesOutcome>("references", query, {
        position: query.position,
        includeDeclaration: query.includeDeclaration,
        ...(traceId ? { traceId } : {}),
        ...(this.#referenceIndexFreshness.isDirty(query.document.workspaceId)
          ? { forceLegacy: true } : {}),
        ...(candidates ? {
          candidateUris: candidates.uris,
          candidateIdentityComplete: candidates.identityComplete,
          ...(candidates.anchorUri ? { candidateAnchorUri: candidates.anchorUri } : {}),
          ...(candidates.anchorPosition ? { candidateAnchorPosition: candidates.anchorPosition } : {}),
          ...(candidates.supportUris ? { candidateSupportUris: candidates.supportUris } : {}),
        } : {}),
      })
      this.#assertReferenceSnapshot(snapshot)
      if (candidates?.anchorPosition && response.value.status === "incomplete" && response.value.reason !== "resource-budget-exceeded") {
        this.#logger?.info("references.anchor.seed.fallback", { traceId, reason: response.value.reason })
        return this.references(query, false)
      }
      if (!query.signal?.aborted && this.#referenceResults.set(query, response.value)) {
        logReferenceCache(this.#logger, this.#referenceResults, "references.cache.store", traceId,
          response.value.status === "complete" ? response.value.references.length : 0)
      }
      return response
    } finally { this.#inFlightPreparations -= 1 }
  }

  prepareRename(query: Contract.SemanticQuery) {
    return this.#documentRequest<Contract.SemanticPrepareRenameOutcome>("prepareRename", query, {
      position: query.position,
    })
  }

  rename(query: Contract.SemanticRenameQuery) {
    if (!isSemanticWorkerUriWithinRoot(query.document.uri, query.document.workspaceId)) {
      return Promise.resolve({
        documentVersion: query.document.version,
        value: { status: "incomplete" as const, reason: "source-outside-workspace" as const },
      })
    }
    return this.#documentRequest<Contract.SemanticRenameOutcome>("rename", query, {
      position: query.position,
      newName: query.newName,
    })
  }

  documentHighlights(query: Contract.SemanticQuery) {
    return this.#documentRequest<Contract.SemanticDocumentHighlight[]>("documentHighlights", query, {
      position: query.position,
    })
  }

  inlayHints(query: Contract.SemanticInlayHintQuery) {
    return this.#documentRequest<Contract.SemanticInlayHint[]>("inlayHints", query, {
      range: query.range,
    })
  }

  prepareCallHierarchy(query: Contract.SemanticQuery) {
    return this.#documentRequest<Contract.SemanticCallHierarchyPrepareOutcome>(
      "prepareCallHierarchy",
      query,
      { position: query.position },
    )
  }

  outgoingCalls(query: Contract.SemanticCallHierarchyItemQuery) {
    return this.#callHierarchyRequest<Contract.SemanticCallHierarchyOutgoingOutcome>(
      "outgoingCalls",
      query,
    )
  }

  incomingCalls(query: Contract.SemanticCallHierarchyItemQuery) {
    return this.#callHierarchyRequest<Contract.SemanticCallHierarchyIncomingOutcome>(
      "incomingCalls",
      query,
    )
  }

  foldingRanges(query: Contract.SemanticFoldingRangeQuery) {
    return this.#documentRequest<Contract.SemanticFoldingRange[]>("foldingRanges", query, {
      ...(query.lineFoldingOnly === undefined ? {} : { lineFoldingOnly: query.lineFoldingOnly }),
      ...(query.rangeLimit === undefined ? {} : { rangeLimit: query.rangeLimit }),
    })
  }

  formatDocument(query: Contract.SemanticDocumentFormattingQuery) {
    return this.#documentRequest<Contract.SemanticDocumentTextEdit[]>("formatDocument", query, {
      options: query.options,
    })
  }

  documentSymbols(query: Contract.SemanticDocumentQuery) {
    return this.#documentRequest<Contract.SemanticDocumentSymbol[]>("documentSymbols", query, {})
  }

  diagnose(query: Contract.SemanticDocumentQuery) {
    return this.#documentRequest<Contract.SemanticDiagnostic[]>("diagnose", query, {})
  }

  codeActions(query: Contract.SemanticCodeActionQuery) {
    return this.#documentRequest<Contract.SemanticCodeAction[]>("codeActions", query, {
      range: query.range,
    })
  }

  resolveCodeAction(query: Contract.SemanticCodeActionResolveQuery) {
    return this.#documentRequest<Contract.SemanticResolvedCodeAction | null>(
      "resolveCodeAction",
      query,
      { action: query.action as unknown as SemanticWorkerJsonObject },
    )
  }

  hover(query: Contract.SemanticQuery) {
    return this.#documentRequest<Contract.SemanticHover | null>("hover", query, {
      position: query.position,
    })
  }

  signatureHelp(query: Contract.SemanticSignatureHelpQuery) {
    return this.#documentRequest<Contract.SemanticSignatureHelp | null>("signatureHelp", query, {
      position: query.position,
      triggerReason: query.triggerReason,
    })
  }

  async #referenceCandidates(
    query: Contract.SemanticReferencesQuery,
    snapshot: ReferenceInputSnapshot,
    traceId?: string,
    allowLocalSeed = true,
  ): Promise<ReferenceCandidateSelection | undefined> {
    return selectReferenceCandidates({
      environment: this.#environment,
      index: this.#referenceIndex,
      exportIndex: this.#exportIndex,
      freshness: this.#referenceIndexFreshness,
      packageResolver: this.#packageResolver,
      projectConfiguration: snapshot.projectConfiguration,
      sdkConfiguration: snapshot.sdkConfiguration,
      sourceOverlays: snapshot.sourceOverlays,
      assertCurrent: () => this.#assertReferenceSnapshot(snapshot),
      logger: this.#logger,
      define: (definitionQuery, definitionTraceId) => {
        this.#assertReferenceSnapshot(snapshot)
        return this.#documentRequest<Contract.SemanticDefinition[]>(
          "define", definitionQuery,
          { position: definitionQuery.position, isolate: true, ...(definitionTraceId ? { traceId: definitionTraceId } : {}) },
        )
      },
    }, query, traceId, allowLocalSeed)
  }
  async dispose(): Promise<void> {
    if (this.#disposed) return
    this.#disposed = true
    this.#referenceResults.clear()
    this.#referenceInputs.clear()
    await this.#host.dispose()
  }

  async #documentRequest<Value, Method extends SemanticWorkerMethod = SemanticWorkerMethod>(
    method: Method,
    query: Contract.SemanticDocumentQuery,
    args: SemanticWorkerRequestArgsByMethod[Method],
  ): Promise<Contract.VersionedSemanticResult<Value>> {
    if (query.signal?.aborted) throw new SemanticWorkerSupervisorError(
      abortState(query.signal) === SemanticWorkerCancelState.contentModified
        ? "content-modified" : "client-cancelled",
    )
    this.sync(query.document)
    const value = await this.#request(method, query.document.workspaceId, query.document.uri,
      query.document.version, args, query.signal)
    return { documentVersion: query.document.version, value: value as unknown as Value }
  }

  async #callHierarchyRequest<Value>(
    method: "outgoingCalls" | "incomingCalls",
    query: Contract.SemanticCallHierarchyItemQuery,
  ): Promise<Value> {
    const rootUri = query.source.workspaceRootUri
    const document = query.source.kind === "open"
      ? query.source.document
      : {
          uri: query.source.uri,
          version: 0,
          text: query.source.text,
          workspaceId: query.source.workspaceId,
        }
    const tracked = this.#documents.has(document.uri)
    if (query.source.kind === "open") this.sync(document)
    else this.#mutate(rootUri, {
      kind: "open",
      uri: document.uri,
      documentVersion: document.version,
      text: document.text,
    })
    const { sourceFingerprint: itemFingerprint, ...item } = query.item
    const sourceFingerprint = itemFingerprint ?? createHash("sha256")
      .update(document.text)
      .digest("hex")
    try {
      const value = await this.#request(method, rootUri, document.uri, null, {
        item,
        sourceFingerprint,
      }, query.signal)
      return value as unknown as Value
    } finally {
      if (query.source.kind === "disk" && !tracked) {
        this.#mutate(rootUri, {
          kind: "close",
          uri: document.uri,
          documentVersion: document.version,
        })
      }
    }
  }

  async #request<Method extends SemanticWorkerMethod>(
    method: Method,
    rootUri: string,
    uri: string,
    expectedDocumentVersion: number | null,
    args: SemanticWorkerRequestArgsByMethod[Method],
    signal?: AbortSignal,
  ): Promise<SemanticWorkerJsonValue> {
    this.#assertAvailable()
    this.#inFlightRequests += 1
    try {
      const handle = this.#host.supervisor(rootUri).request({
        method, uri, expectedDocumentVersion, args,
      } as RootSemanticWorkerRequestInput)
      const abort = () => handle.cancel(abortState(signal))
      signal?.addEventListener("abort", abort, { once: true })
      if (signal?.aborted) abort()
      try { return await handle.result }
      finally { signal?.removeEventListener("abort", abort) }
    } finally {
      this.#inFlightRequests -= 1
    }
  }

  #mutate(rootUri: string, mutation: RootSemanticWorkerMutationInput): void {
    for (const knownRoot of this.#referenceInputs.changed(rootUri)) {
      this.#referenceResults.invalidateRoot(knownRoot)
    }
    if (this.#recycling) {
      this.#recycleMutationObserved = true
      this.#deferredMutations.push({ rootUri, mutation })
      return
    }
    try {
      const pending = this.#host.supervisor(rootUri).mutate(mutation)
      this.#pendingMutations.add(pending)
      void pending.catch(error => { this.#failure = error })
        .finally(() => { this.#pendingMutations.delete(pending) })
    } catch (error) {
      this.#failure = error
    }
  }

  #assertAvailable(): void {
    if (this.#disposed) throw new Error("Semantic worker is disposed")
    if (this.#failure) throw this.#failure
    if (this.#recycling) throw new Error("Semantic Worker recycle is in progress")
  }

  #assertReferenceSnapshot(snapshot: ReferenceInputSnapshot): void {
    this.#assertAvailable()
    if (!this.#referenceInputs.isCurrent(snapshot)) {
      throw new SemanticWorkerSupervisorError("content-modified")
    }
  }
}
function abortState(signal: AbortSignal | undefined) {
  const kind = signal?.reason && typeof signal.reason === "object"
    ? (signal.reason as { kind?: unknown }).kind
    : undefined
  if (kind === "content-modified" || kind === "superseded") {
    return SemanticWorkerCancelState.contentModified
  }
  if (kind === "shutdown") return SemanticWorkerCancelState.supervisorDisposing
  return SemanticWorkerCancelState.clientCancelled
}
