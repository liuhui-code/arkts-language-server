import { sourceReferenceAuthority, sourceReferenceBudgetAllows } from "./references/source-reference-input.js"
import { createReferenceNamespaceAdmission } from "./references/create-reference-namespace-admission.js"
import { resolveSemanticWorkerPath } from "./semantic-worker-runtime-path.js"
import { WorkerManagedSourceNamespaces } from "./worker-managed-source-namespaces.js"
import type { ManagedSourceDirectory } from "../contracts/managed-source-namespace.js"
import { applyWorkerWorkspaceChanges } from "./apply-worker-workspace-changes.js"
import { randomUUID } from "node:crypto"

import type { DocumentSnapshot } from "../contracts/document.js"
import type { ProjectResolverPort } from "../contracts/project-resolver.js"
import { type SemanticReadinessQuery, type SemanticReadinessReport } from "../contracts/semantic-readiness.js"
import { isProjectResourceFile, isProjectSourceNamespace } from "./resource-file-identity.js"
import type {
  WorkspaceExportIndexPort,
  WorkspaceReferenceIndexPort,
} from "../contracts/workspace-index.js"
import type * as Contract from "../contracts/semantic-engine.js"
import { LocalPackageResolver } from "../core/sdk/local-package-resolver.js"
import type { StructuredLogger } from "../observability/logger.js"
import { OHOS_TYPESCRIPT_BACKEND_IDENTITY } from "./backends/ohos-typescript/identity.js"
import type { SemanticBackend } from "./backends/semantic-backend.js"
import { runWorkerReferenceQuery } from "./references/reference-query-entry.js"
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
import type { ReferenceNamespaceAdmission } from "./references/reference-namespace-admission.js"
import { ReferenceResultCache } from "./references/reference-result-cache.js"
import { cachedReferenceResult } from "./references/reference-cache-admission.js"
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
  readonly onUnobservedSourceNamespace?: (rootUri: string, kind: "namespace" | "content") => void
}

type TrackedDocument = DocumentSnapshot

export class SemanticWorkerEngine implements Contract.SemanticEnginePort, SemanticBackend {
  readonly backendIdentity = OHOS_TYPESCRIPT_BACKEND_IDENTITY
  readonly #managedSources = new WorkerManagedSourceNamespaces()
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
  readonly #referenceAdmission: ReferenceNamespaceAdmission
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
    this.#referenceAdmission = createReferenceNamespaceAdmission({
      readiness: query => this.semanticReadiness(query), results: this.#referenceResults,
      inputs: this.#referenceInputs, freshness: this.#referenceIndexFreshness,
      index: this.#referenceIndex, reconcile: options.onUnobservedSourceNamespace,
    })
    const workerPath = resolveSemanticWorkerPath(__dirname, options.workerPath)
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
        this.#projectConfiguration, this.#sdkConfiguration, this.#managedSources.sources.registrations()),
    })
    this.#recycle = new SemanticWorkerRecycle(this.#host, this.#environment, logger)
    this.#mutations = new SemanticWorkerMutationTracker(this.#host, this.#recycle,
      error => this.#recovery.mutationFailed(error), () => this.#recovery.acceptsMutations)
    this.#recovery = new SemanticWorkerFailureRecovery({ recycle: this.#recycle, mutations: this.#mutations,
      disposed: () => this.#disposed,
      options: () => this.#recycleOptions(), logger })
    this.#preparation = new WorkerProjectPreparation({
      generation: async (rootUri, signal) => { await this.#recycle.wait(signal); this.#recovery.assertHealthy();
        return this.#host.supervisor(rootUri) },
      admitRecovery: explicit => this.#recovery.admit(explicit),
      assertAvailable: () => this.#recovery.assertHealthy(), hasRoot: rootUri => this.#host.rootUris.includes(rootUri),
      queriedRoots: this.#queriedRoots,
      request: (rootUri, input, signal) => this.#recycle.request(rootUri, input, signal, () => this.#assertAvailable(input.method !== "diagnose" && (input.method !== "semanticReadiness" || input.args.prepare || input.args.captureSourceInputs !== undefined))),
    })
  }

  configureProject(selection: unknown): void {
    this.#preparation.configurationChanged()
    this.#recycle.configurationChanged()
    const ownedSelection = structuredClone(selection)
    this.#recovery.inputChanged("project", ownedSelection)
    this.#referenceAdmission.clear(); this.#referenceInputs.configurationChanged()
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
    this.#referenceAdmission.clear(); this.#referenceInputs.configurationChanged()
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

  setManagedSourceNamespace = (root: string, directories: readonly ManagedSourceDirectory[] | null) =>
    this.#managedSources.update(root, directories, () => this.#preparation.settled(root),
      batch => this.workspaceFilesChanged([batch]), () => this.#disposed)
  isManagedCachePath = (root: string, uri: string) => this.#managedSources.sources.excludedUri(root, uri)

  isResourceFile(rootUri: string, fileUri: string): boolean {
    return isProjectResourceFile(this.#packageResolver, rootUri, fileUri)
  }
  isSourceNamespace(rootUri: string, fileUri: string): boolean {
    return isProjectSourceNamespace(this.#packageResolver, rootUri, fileUri)
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
    applyWorkerWorkspaceChanges(batches, { cache: this.#referenceResults,
      freshness: this.#referenceIndexFreshness, index: this.#referenceIndex, packages: this.#packageResolver,
      mutate: (root, mutation) => this.#mutate(root, mutation) })
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
    return cachedReferenceResult(query, this.#referenceResults, input => this.#referenceAdmission.read(input), proof =>
      logReferenceCache(this.#logger, this.#referenceResults, "references.cache.hit",
        traceId ?? (this.#environment.ARKTS_REFERENCES_TRACE === "1" ? randomUUID() : undefined), undefined, proof),
      () => { try { this.#assertAvailable(false) } catch { return false }; return !this.#recycle.active && sourceReferenceBudgetAllows(this.#environment) && sourceReferenceAuthority(query, this.#documents.values()) })
  }

  async references(query: Contract.SemanticReferencesQuery, allowLocalSeed = true): Promise<Contract.VersionedSemanticResult<Contract.SemanticReferencesOutcome>> {
    if (this.#recycle.active) await this.#recycle.wait(query.signal)
    this.#inFlightPreparations += 1
    try {
      return await runWorkerReferenceQuery(query, {
        environment: this.#environment, logger: this.#logger, cache: this.#referenceResults,
        inputs: this.#referenceInputs, projectConfiguration: this.#projectConfiguration,
        sdkConfiguration: this.#sdkConfiguration, queriedRoots: this.#queriedRoots, documents: () => this.#documents.values(),
        cached: (input, traceId) => this.cachedReferences(input, traceId),
        readiness: input => this.#referenceAdmission.read(input),
        assertCurrent: snapshot => this.#assertReferenceSnapshot(snapshot),
        candidates: (input, snapshot, traceId) => this.#referenceCandidates(input, snapshot, traceId, allowLocalSeed),
        forceLegacy: root => this.#referenceAdmission.hasOverlayOnly(root),
        dispatch: (input, args) => this.#documentRequest<Contract.SemanticReferencesOutcome | null>("references", input, args),
        retry: input => this.references(input, false),
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
    if (query.document.source?.kind !== "disk") this.sync(query.document)
    return this.#referenceAdmission.run(query, this.#referenceInputs, () => this.#documentRequest<Contract.SemanticRenameOutcome>("rename", query, {
      position: query.position,
      newName: query.newName,
    }))
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
      sourceFingerprint: this.#referenceAdmission.diskFingerprint(query.document.workspaceId),
      requestReconciliation: () => this.#referenceAdmission.requestReconciliation(query.document.workspaceId),
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
  onDidRecover(listener: () => void): () => void { return this.#recovery.onDidRecover(listener) }

  async dispose(): Promise<void> {
    if (this.#disposed) return
    this.#disposed = true
    this.#recycle.cancelAutomatic()
    this.#referenceResults.clear()
    this.#referenceAdmission.clear(); this.#referenceInputs.clear(); this.#managedSources.clear()
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

  #assertReferenceSnapshot(snapshot: Pick<ReferenceInputSnapshot, "rootUri" | "rootRevision" | "configurationRevision">): void {
    this.#assertAvailable()
    if (!this.#referenceInputs.isCurrent(snapshot)) {
      throw new SemanticWorkerSupervisorError("content-modified")
    }
  }
}
