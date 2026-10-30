import fs from "node:fs"
import { randomUUID } from "node:crypto"
import path from "node:path"

import type { DocumentSnapshot } from "../contracts/document.js"
import type { ProjectResolverPort } from "../contracts/project-resolver.js"
import { type SemanticReadinessQuery, type SemanticReadinessReport } from "../contracts/semantic-readiness.js"
import { isProjectResourceFile } from "./resource-file-identity.js"
import type {
  WorkspaceExportIndexPort,
  WorkspaceReferenceIndexPort,
} from "../contracts/workspace-index.js"
import type * as Contract from "../contracts/semantic-engine.js"
import { LocalPackageResolver } from "../core/sdk/local-package-resolver.js"
import type { StructuredLogger } from "../observability/logger.js"
import { OHOS_TYPESCRIPT_BACKEND_IDENTITY } from "./backends/ohos-typescript/identity.js"
import type { SemanticBackend } from "./backends/semantic-backend.js"
import { referenceSearchRuntimeConfig } from "./references/reference-runtime.js"
import { routeReferenceQuery } from "./references/reference-query-router.js"
import { selectReferenceCandidates, type ReferenceCandidateSelection } from "./references/reference-candidate-selection.js"
import { interactiveSemanticRuntimeConfig } from "./interactive-runtime.js"
import { discoverCompletionCandidates } from "./completion-discovery.js"
import { PreparedCompletionReceipts } from "./prepared-completion-receipts.js"
import { resourceEventPath, toFilePath } from "./semantic-worker-file-identity.js"
import { SemanticWorkerHost, semanticWorkerData } from "./semantic-worker-host.js"
import { canFinishOverlaySynchronization } from "./semantic-worker-invalidation.js"
import { SemanticWorkerRecycle } from "./semantic-worker-recycle.js"
import { SemanticWorkerMutationTracker } from "./semantic-worker-mutation-tracker.js"
import { SemanticWorkerFailureRecovery } from "./semantic-worker-failure-recovery.js"
import { workerDocumentRequest } from "./semantic-worker-document-request.js"
import { workerCallHierarchyRequest } from "./semantic-worker-source-request.js"
import { WorkerProjectPreparation } from "./worker-project-preparation.js"
import { ReferenceIndexFreshness } from "./references/reference-index-freshness.js"
import { ReferenceInputState, type ReferenceInputSnapshot } from "./references/reference-input-snapshot.js"
import { ReferenceResultCache } from "./references/reference-result-cache.js"
import { cachedReferenceResult, referenceCacheAdmission } from "./references/reference-cache-admission.js"
import { logReferenceCache } from "./references/reference-cache-telemetry.js"
import {
  SemanticWorkerSupervisorError,
  isSemanticWorkerUriWithinRoot,
  type RootSemanticWorkerMutationInput,
} from "./semantic-worker-supervisor.js"
import type {
  SemanticWorkerJsonObject,
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
  readonly #exportIndex: WorkspaceExportIndexPort | undefined
  readonly #referenceIndex: WorkspaceReferenceIndexPort | undefined
  readonly #packageResolver = new LocalPackageResolver()
  readonly #documents = new Map<string, TrackedDocument>()
  readonly #referenceIndexFreshness = new ReferenceIndexFreshness()
  readonly #host: SemanticWorkerHost
  readonly #referenceResults = new ReferenceResultCache()
  readonly #referenceInputs = new ReferenceInputState()
  readonly #preparedCompletions = new PreparedCompletionReceipts()
  readonly #queriedRoots = new Set<string>()
  readonly #mutations: SemanticWorkerMutationTracker
  readonly #recycle: SemanticWorkerRecycle
  readonly #preparation: WorkerProjectPreparation
  readonly #recovery: SemanticWorkerFailureRecovery
  #inFlightPreparations = 0
  #projectConfiguration: unknown
  #sdkConfiguration: unknown
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
    const workerPath = options.workerPath ?? (fs.existsSync(adjacentWorker)
      ? adjacentWorker
      : path.resolve(process.cwd(), "dist", "semantic-worker.cjs"))
    this.#host = new SemanticWorkerHost({
      workerPath,
      logger,
      environment: this.#environment,
      onFailure: error => this.#recovery.workerFailed(error),
      onHealthy: () => this.#recovery.healthy(),
      canFinishSynchronization: mutation => canFinishOverlaySynchronization(mutation, this.#documents),
      initialPreparationConsumed: rootUri => this.#preparation.hasCompleted(rootUri),
      onPressureRecycle: () => this.#recycle.requestAutomatic(() => this.#recycleOptions()),
      workerData: rootUri => semanticWorkerData(rootUri, this.#environment,
        this.#projectConfiguration, this.#sdkConfiguration),
    })
    this.#recycle = new SemanticWorkerRecycle(this.#host, this.#environment, logger)
    this.#mutations = new SemanticWorkerMutationTracker(this.#host, this.#recycle,
      error => this.#recovery.mutationFailed(error), () => this.#recovery.acceptsMutations)
    this.#recovery = new SemanticWorkerFailureRecovery({ recycle: this.#recycle, mutations: this.#mutations,
      disposed: () => this.#disposed,
      options: () => this.#recycleOptions(), logger })
    this.#preparation = new WorkerProjectPreparation({
      admitRecovery: explicit => this.#recovery.admit(explicit),
      assertAvailable: () => this.#recovery.assertHealthy(), hasRoot: rootUri => this.#host.rootUris.includes(rootUri),
      queriedRoots: this.#queriedRoots,
      request: (rootUri, input, signal) => this.#recycle.request(rootUri, input, signal, () => this.#assertAvailable(input.method !== "diagnose" && (input.method !== "semanticReadiness" || input.args.prepare))),
    })
  }

  configureProject(selection: unknown): void {
    this.#preparation.configurationChanged()
    this.#recycle.configurationChanged()
    const ownedSelection = structuredClone(selection)
    this.#recovery.inputChanged("project", ownedSelection)
    this.#referenceInputs.configurationChanged()
    this.#referenceResults.clear()
    this.#projectConfiguration = ownedSelection
    this.#packageResolver.configureProject(ownedSelection)
    this.#host.sendControl({ control: "configureProject", value: ownedSelection })
  }

  configureSdk(selection: unknown): void {
    this.#preparation.configurationChanged()
    this.#recycle.configurationChanged()
    const ownedSelection = structuredClone(selection)
    this.#recovery.inputChanged("sdk", ownedSelection)
    this.#referenceInputs.configurationChanged()
    this.#referenceResults.clear()
    this.#sdkConfiguration = ownedSelection
    this.#host.sendControl({ control: "configureSdk", value: ownedSelection })
  }

  applyMemoryPressure(level: "level2" | "level3"): void {
    this.#referenceResults.clear()
    this.#host.sendControl({ control: "applyMemoryPressure", value: level })
  }

  recycleSemanticWorker(): Promise<{
    recycled: true; oldThreadId: number; newThreadId: number
  }> {
    return this.#recycle.run(this.#recycleOptions())
  }

  semanticReadiness(query: SemanticReadinessQuery): Promise<SemanticReadinessReport> { return this.#preparation.read(query) }
  initializeProject(query: Omit<SemanticReadinessQuery, "prepare">): Promise<SemanticReadinessReport> {
    return this.#preparation.initialize(query)
  }

  #recycleOptions() {
    return {
      documents: this.#documents,
      quiescent: !this.#preparation.active && this.#inFlightPreparations === 0 && this.#mutations.pendingCount === 0,
      checkHealth: () => this.#recovery.assertHealthy(),
      fail: (error: unknown) => this.#recovery.fail(error),
      invalidate: () => {
        this.#referenceResults.clear()
        this.#queriedRoots.clear()
        this.#referenceInputs.configurationChanged()
      },
    }
  }

  isResourceFile(rootUri: string, fileUri: string): boolean {
    return isProjectResourceFile(this.#packageResolver, rootUri, fileUri)
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
      if (query.document.source?.kind !== "disk") this.sync(query.document)
      const input = this.#referenceInputs.capture(query.document.workspaceId, [], this.#projectConfiguration, this.#sdkConfiguration)
      const discovery = await discoverCompletionCandidates(this.#exportIndex, query)
      const result = await this.#documentRequest<Contract.SemanticCompletionList>("complete", query, {
        position: query.position,
        snippets: query.completionOptions?.snippets === true,
        ...(discovery ? { discovery } : {}),
      })
      if (this.#referenceInputs.isCurrent(input)) this.#preparedCompletions.remember(result.value, input)
      return result
    } finally {
      this.#inFlightPreparations -= 1
      this.#recycle.retryAutomatic()
    }
  }

  resolveCompletion(query: Contract.SemanticCompletionResolveQuery) {
    if (query.document.source?.kind !== "disk") this.sync(query.document)
    const { preResolved, ...completion } = query.completion
    if (preResolved && interactiveSemanticRuntimeConfig(this.#environment).autoImportProjectRootProfile === "discovery") {
      const cached = this.#preparedCompletions.resolve(query, input => this.#referenceInputs.isCurrent(input),
        recipe => this.#documentRequest<Contract.SemanticCompletion>("resolveCompletion", query, {
          position: query.position, completion: recipe as unknown as SemanticWorkerJsonObject,
          snippets: query.completionOptions?.snippets === true,
        }))
      if (cached) return cached
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
    if (query.document.source?.kind !== "disk") this.sync(query.document)
    return cachedReferenceResult(query, this.#referenceResults, input => this.semanticReadiness(input), () =>
      logReferenceCache(this.#logger, this.#referenceResults, "references.cache.hit",
        traceId ?? (this.#environment.ARKTS_REFERENCES_TRACE === "1" ? randomUUID() : undefined)))
  }

  async references(query: Contract.SemanticReferencesQuery, allowLocalSeed = true): Promise<Contract.VersionedSemanticResult<Contract.SemanticReferencesOutcome>> {
    if (this.#recycle.active) await this.#recycle.wait(query.signal)
    this.#inFlightPreparations += 1
    try {
      query = Object.freeze({ ...query,
        document: Object.freeze({ ...query.document }),
        position: Object.freeze({ ...query.position }),
      })
      const traceId = this.#environment.ARKTS_REFERENCES_TRACE === "1" ? randomUUID() : undefined
      const cached = await this.cachedReferences(query, traceId)
      if (cached) return cached
      const cacheAdmission = query.document.source ? await referenceCacheAdmission(query, input => this.semanticReadiness(input)) : undefined
      const snapshot = this.#referenceInputs.capture(query.document.workspaceId,
        this.#documents.values(), this.#projectConfiguration, this.#sdkConfiguration)
      logReferenceCache(this.#logger, this.#referenceResults, "references.cache.miss", traceId)
      const runtime = referenceSearchRuntimeConfig(this.#environment)
      return await routeReferenceQuery(query, {
        traceId, logger: this.#logger, cache: this.#referenceResults, cacheAdmission,
        strategy: runtime.strategy,
        preferResident: this.#queriedRoots.has(query.document.workspaceId) && runtime.residentFastPath
          && (this.#environment.ARKTS_REFERENCES_RESIDENT_FIRST ?? "1") === "1",
        assertCurrent: () => this.#assertReferenceSnapshot(snapshot),
        selectCandidates: () => this.#referenceCandidates(query, snapshot, traceId, allowLocalSeed),
        forceLegacy: () => this.#referenceIndexFreshness.isDirty(query.document.workspaceId),
        dispatch: args => this.#documentRequest<Contract.SemanticReferencesOutcome | null>("references", query, args),
        retryWithoutSeed: () => this.references(query, false),
      })
    } finally {
      this.#inFlightPreparations -= 1
      this.#recycle.retryAutomatic()
    }
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
    this.#recycle.cancelAutomatic()
    this.#referenceResults.clear()
    this.#referenceInputs.clear()
    this.#queriedRoots.clear()
    await this.#recovery.settle()
    await this.#host.dispose()
  }

  async #documentRequest<Value, Method extends SemanticWorkerMethod = SemanticWorkerMethod>(
    method: Method,
    query: Contract.SemanticDocumentQuery,
    args: SemanticWorkerRequestArgsByMethod[Method],
  ): Promise<Contract.VersionedSemanticResult<Value>> {
    return workerDocumentRequest(method, query, args,
      { sync: document => this.sync(document), preparation: this.#preparation })
  }

  async #callHierarchyRequest<Value>(
    method: "outgoingCalls" | "incomingCalls",
    query: Contract.SemanticCallHierarchyItemQuery,
  ): Promise<Value> {
    return workerCallHierarchyRequest(method, query, {
      sync: document => this.sync(document),
      request: (operation, rootUri, uri, version, args, signal, diskSource) => this.#preparation.request(operation, rootUri, uri, version, args, signal, diskSource),
    })
  }

  #mutate(rootUri: string, mutation: RootSemanticWorkerMutationInput): void {
    if (mutation.kind !== "workspaceFilesChanged" || mutation.changes.length) this.#recovery.inputChanged()
    for (const knownRoot of this.#referenceInputs.changed(rootUri)) {
      this.#referenceResults.invalidateRoot(knownRoot)
    }
    this.#mutations.mutate(rootUri, mutation)
  }

  #assertAvailable(explicit = true): void {
    this.#recovery.assertHealthy(explicit)
    if (this.#recycle.active) throw new Error("Semantic Worker recycle is in progress")
  }

  #assertReferenceSnapshot(snapshot: ReferenceInputSnapshot): void {
    this.#assertAvailable()
    if (!this.#referenceInputs.isCurrent(snapshot)) {
      throw new SemanticWorkerSupervisorError("content-modified")
    }
  }
}
