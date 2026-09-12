import fs from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { Worker } from "node:worker_threads"

import type { DocumentSnapshot, TextPosition } from "../contracts/document.js"
import type { ProjectResolverPort } from "../contracts/project-resolver.js"
import type {
  WorkspaceExportIndexPort,
  WorkspaceReferenceCandidateResult,
  WorkspaceReferenceIndexPort,
  WorkspaceReferenceSourceResolution,
} from "../contracts/workspace-index.js"
import type * as Contract from "../contracts/semantic-engine.js"
import { isArkUIStringResourcePath } from "../core/arkui/resource-path.js"
import { LocalPackageResolver } from "../core/sdk/local-package-resolver.js"
import {
  isHarmonySdkModuleSpecifier,
  resolveHarmonySdkModule,
} from "../core/sdk/module-resolver.js"
import { discoverProjectSdk, type ProjectSdkSelection } from "../core/sdk/project-sdk.js"
import type { StructuredLogger } from "../observability/logger.js"
import { OHOS_TYPESCRIPT_BACKEND_IDENTITY } from "./backends/ohos-typescript/identity.js"
import type { SemanticBackend } from "./backends/semantic-backend.js"
import { semanticRuntimeConfig } from "./coordinator/runtime-config.js"
import { referenceSearchRuntimeConfig } from "./references/reference-runtime.js"
import {
  RootSemanticWorkerSupervisor,
  SemanticWorkerCancelState,
  isSemanticWorkerUriWithinRoot,
  type RootSemanticWorkerEndpoint,
  type RootSemanticWorkerEndpointHandlers,
  type RootSemanticWorkerMutationInput,
  type RootSemanticWorkerRequestInput,
} from "./semantic-worker-supervisor.js"
import type {
  SemanticWorkerJsonObject,
  SemanticWorkerJsonValue,
  SemanticWorkerMethod,
  SemanticWorkerRequestArgsByMethod,
} from "./worker-protocol.js"
import { MAX_SEMANTIC_WORKER_REFERENCE_CANDIDATES } from "./worker-protocol.js"

interface SemanticWorkerProxyOptions {
  readonly env?: NodeJS.ProcessEnv
  readonly workerPath?: string
  readonly exportIndex?: WorkspaceExportIndexPort
  readonly referenceIndex?: WorkspaceReferenceIndexPort
}

type TrackedDocument = DocumentSnapshot

interface WorkerControlMessage {
  readonly control: "registerRoot" | "configureProject" | "configureSdk" | "applyMemoryPressure"
  readonly epoch?: number
  readonly rootUri?: string
  readonly value?: unknown
}

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
  readonly #supervisors = new Map<string, RootSemanticWorkerSupervisor>()
  readonly #handlers = new Map<number, RootSemanticWorkerEndpointHandlers>()
  #worker: Worker | undefined
  #nextEpoch = 1
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
  }

  configureProject(selection: unknown): void {
    this.#projectConfiguration = selection
    this.#packageResolver.configureProject(selection)
    this.#sendControl({ control: "configureProject", value: selection })
  }

  configureSdk(selection: unknown): void {
    this.#sdkConfiguration = selection
    this.#sendControl({ control: "configureSdk", value: selection })
  }

  applyMemoryPressure(level: "level3"): void {
    this.#sendControl({ control: "applyMemoryPressure", value: level })
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
    for (const batch of batches) {
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

  async complete(query: Contract.SemanticQuery) {
    const discovery = await this.#completionDiscovery(query)
    return this.#documentRequest<Contract.SemanticCompletionList>("complete", query, {
      position: query.position,
      snippets: query.completionOptions?.snippets === true,
      ...(discovery ? { discovery } : {}),
    })
  }

  resolveCompletion(query: Contract.SemanticCompletionResolveQuery) {
    return this.#documentRequest<Contract.SemanticCompletion>("resolveCompletion", query, {
      position: query.position,
      completion: query.completion as unknown as SemanticWorkerJsonObject,
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

  async references(query: Contract.SemanticReferencesQuery) {
    const candidateUris = await this.#referenceCandidates(query)
    return this.#documentRequest<Contract.SemanticReferencesOutcome>("references", query, {
      position: query.position,
      includeDeclaration: query.includeDeclaration,
      ...(candidateUris ? { candidateUris } : {}),
    })
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

  async #completionDiscovery(
    query: Contract.SemanticQuery,
  ): Promise<Contract.SemanticCompletionDiscovery | undefined> {
    if (!this.#exportIndex) return undefined
    const context = completionPrefixContext(query.document.text, query.position)
    if (context.memberAccess || Array.from(context.prefix).length < 2) return undefined
    try {
      const result = await this.#exportIndex.searchExports(
        query.document.workspaceId,
        context.prefix,
        128,
        query.signal,
      )
      return {
        incomplete: result.completeness !== "ready",
        candidates: result.items
          .filter(candidate => candidate.uri !== query.document.uri)
          .flatMap(candidate => {
            const importSpecifier = candidate.importSpecifier
              ?? relativeImportSpecifier(query.document.uri, candidate.uri)
            return importSpecifier
              ? [{
                  exportedName: candidate.exportedName,
                  kind: candidate.kind,
                  uri: candidate.uri,
                  ordinal: candidate.ordinal,
                  ...(candidate.declarationIdentity
                    ? { declarationIdentity: candidate.declarationIdentity }
                    : {}),
                  importSpecifier,
                  ...(candidate.moduleId ? { moduleId: candidate.moduleId } : {}),
                  ...(candidate.targetScope ? { targetScope: candidate.targetScope } : {}),
                }]
              : []
          }),
      }
    } catch {
      return undefined
    }
  }

  async #referenceCandidates(
    query: Contract.SemanticReferencesQuery,
  ): Promise<readonly string[] | undefined> {
    if (referenceSearchRuntimeConfig(this.#environment).strategy !== "indexed-batched"
      || !this.#referenceIndex) return undefined
    try {
      const admittedRootUris = this.#referenceAdmissionRoots(query.document.workspaceId)
      let direct = await this.#referenceIndex.searchReferenceCandidates(
        query.document.workspaceId,
        query.document.uri,
        query.position,
        MAX_SEMANTIC_WORKER_REFERENCE_CANDIDATES,
        undefined,
        admittedRootUris,
        query.signal,
      )
      direct = await this.#resolveReferenceCandidateSources(
        query.document.workspaceId,
        query.document.uri,
        query.position,
        direct,
        admittedRootUris,
        query.signal,
      )
      if (await this.#eligibleReferenceCandidates(query.document.workspaceId, direct)) {
        const candidateUris = identityReferenceUris(direct)
        this.#logger?.info("references.index.accepted", {
          anchorMode: direct.identityComplete ? "indexed-declaration-identity" : "indexed-declaration",
          candidateFiles: candidateUris.length,
          conservativeCandidateFiles: direct.uris.length,
          servedGeneration: direct.servedGeneration,
        })
        return candidateUris
      }
      if (direct.completeness !== "ready" || direct.supported) {
        this.#logger?.info("references.index.fallback", {
          reason: "direct-candidate-ineligible",
          supported: direct.supported,
          complete: direct.complete,
          completeness: direct.completeness,
          hasDeclarationIdentity: Boolean(direct.declarationIdentity),
          servedGeneration: direct.servedGeneration,
        })
        return undefined
      }
      const definition = await this.#documentRequest<Contract.SemanticDefinition[]>(
        "define",
        query,
        { position: query.position, isolate: true },
      )
      if (definition.value.length !== 1) {
        this.#logger?.info("references.index.fallback", {
          reason: "definition-count",
          definitionCount: definition.value.length,
        })
        return undefined
      }
      const target = definition.value[0]
      let result = await this.#referenceIndex.searchReferenceCandidates(
        query.document.workspaceId,
        target.uri,
        target.range.start,
        MAX_SEMANTIC_WORKER_REFERENCE_CANDIDATES,
        undefined,
        admittedRootUris,
        query.signal,
      )
      result = await this.#resolveReferenceCandidateSources(
        query.document.workspaceId,
        target.uri,
        target.range.start,
        result,
        admittedRootUris,
        query.signal,
      )
      const status = await this.#referenceIndex.status(query.document.workspaceId)
      if (!result.supported
        || !result.complete
        || result.completeness !== "ready"
        || !result.declarationIdentity
        || result.servedGeneration !== status.committedGeneration) {
        this.#logger?.info("references.index.fallback", {
          reason: "candidate-ineligible",
          targetUri: target.uri,
          targetLine: target.range.start.line,
          targetCharacter: target.range.start.character,
          supported: result.supported,
          complete: result.complete,
          completeness: result.completeness,
          hasDeclarationIdentity: Boolean(result.declarationIdentity),
          servedGeneration: result.servedGeneration,
          committedGeneration: status.committedGeneration,
        })
        return undefined
      }
      const candidateUris = identityReferenceUris(result)
      this.#logger?.info("references.index.accepted", {
        anchorMode: result.identityComplete ? "compiler-definition-identity" : "compiler-definition",
        candidateFiles: candidateUris.length,
        conservativeCandidateFiles: result.uris.length,
        servedGeneration: result.servedGeneration,
      })
      return candidateUris
    } catch (error) {
      this.#logger?.info("references.index.fallback", {
        reason: "index-error",
        message: error instanceof Error ? error.message : String(error),
      })
      return undefined
    }
  }

  async #eligibleReferenceCandidates(
    workspaceId: string,
    result: WorkspaceReferenceCandidateResult,
  ): Promise<boolean> {
    if (!result.supported || !result.complete || result.completeness !== "ready"
      || !result.declarationIdentity) return false
    const status = await this.#referenceIndex?.status(workspaceId)
    return status !== undefined && result.servedGeneration === status.committedGeneration
  }

  async #resolveReferenceCandidateSources(
    workspaceId: string,
    declarationUri: string,
    declarationPosition: TextPosition,
    result: WorkspaceReferenceCandidateResult,
    admittedRootUris: readonly string[] | undefined,
    signal?: AbortSignal,
  ): Promise<WorkspaceReferenceCandidateResult> {
    if (result.identityComplete || !await this.#eligibleReferenceCandidates(workspaceId, result)) {
      return result
    }
    const rootPath = toFilePath(workspaceId)
    if (!rootPath) return result
    const packageResolver = new LocalPackageResolver()
    packageResolver.configureProject(this.#projectConfiguration)
    const sdk = discoverProjectSdk(
      rootPath,
      this.#environment.ARKLINE_HARMONY_SDK_PATH,
      this.#sdkConfiguration,
    )
    const sdkTerminals = new Map<string, string | undefined>()
    const resolutions = new Map<string, WorkspaceReferenceSourceResolution>()
    let unresolvedBindings = 0
    const unresolvedByKind = {
      sdk: 0,
      package: 0,
      relative: 0,
      other: 0,
    }
    const recordUnresolved = (sourceSpecifier: string): void => {
      unresolvedBindings += 1
      unresolvedByKind[referenceSourceKind(sourceSpecifier)] += 1
    }
    for (const binding of result.bindings ?? []) {
      if (binding.sourceResolution === "unique") continue
      const bindingPath = toFilePath(binding.uri)
      if (!bindingPath) {
        recordUnresolved(binding.sourceSpecifier)
        continue
      }
      if (isHarmonySdkModuleSpecifier(binding.sourceSpecifier)) {
        let externalTerminalIdentity = sdkTerminals.get(binding.sourceSpecifier)
        if (!sdkTerminals.has(binding.sourceSpecifier)) {
          externalTerminalIdentity = sdkExternalTerminalIdentity(sdk, binding.sourceSpecifier)
          sdkTerminals.set(binding.sourceSpecifier, externalTerminalIdentity)
        }
        if (!externalTerminalIdentity) {
          recordUnresolved(binding.sourceSpecifier)
          continue
        }
        const key = `${binding.uri}\0${binding.sourceSpecifier}`
        resolutions.set(key, {
          bindingUri: binding.uri,
          sourceSpecifier: binding.sourceSpecifier,
          externalTerminalIdentity,
        })
        continue
      }
      const resolved = packageResolver.resolve(
        rootPath,
        bindingPath,
        binding.sourceSpecifier,
      )
      if (!resolved?.path) {
        recordUnresolved(binding.sourceSpecifier)
        continue
      }
      const resolvedSourceUri = pathToFileURL(resolved.path).href
      if (!isSemanticWorkerUriWithinRoot(resolvedSourceUri, workspaceId)) {
        recordUnresolved(binding.sourceSpecifier)
        continue
      }
      const key = `${binding.uri}\0${binding.sourceSpecifier}`
      resolutions.set(key, {
        bindingUri: binding.uri,
        sourceSpecifier: binding.sourceSpecifier,
        resolvedSourceUri,
      })
    }
    if (resolutions.size > 0 || unresolvedBindings > 0) {
      this.#logger?.info("references.index.source-resolutions", {
        resolvedBindings: resolutions.size,
        unresolvedBindings,
        unresolvedSdkBindings: unresolvedByKind.sdk,
        unresolvedPackageBindings: unresolvedByKind.package,
        unresolvedRelativeBindings: unresolvedByKind.relative,
        unresolvedOtherBindings: unresolvedByKind.other,
        servedGeneration: result.servedGeneration,
      })
    }
    if (resolutions.size === 0) return result
    return this.#referenceIndex!.searchReferenceCandidates(
      workspaceId,
      declarationUri,
      declarationPosition,
      MAX_SEMANTIC_WORKER_REFERENCE_CANDIDATES,
      [...resolutions.values()],
      admittedRootUris,
      signal,
    )
  }

  #referenceAdmissionRoots(workspaceId: string): readonly string[] | undefined {
    const rootPath = toFilePath(workspaceId)
    if (!rootPath) return undefined
    const graph = this.#packageResolver.projectFor(rootPath).semanticGraph()
    if (graph.status !== "ready" || !graph.complete || graph.units.length === 0) return undefined
    return [...new Set(graph.units.flatMap(unit => unit.sourceRoots).map(sourceRoot => (
      pathToFileURL(sourceRoot).href
    )))].sort()
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return
    this.#disposed = true
    await Promise.all([...this.#supervisors.values()].map(supervisor => supervisor.dispose()))
    this.#supervisors.clear()
    this.#handlers.clear()
    await this.#worker?.terminate()
    this.#worker = undefined
  }

  async #documentRequest<Value, Method extends SemanticWorkerMethod = SemanticWorkerMethod>(
    method: Method,
    query: Contract.SemanticDocumentQuery,
    args: SemanticWorkerRequestArgsByMethod[Method],
  ): Promise<Contract.VersionedSemanticResult<Value>> {
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
    const supervisor = this.#supervisor(rootUri)
    const handle = supervisor.request({
      method,
      uri,
      expectedDocumentVersion,
      args,
    } as RootSemanticWorkerRequestInput)
    const abort = () => handle.cancel(abortState(signal))
    signal?.addEventListener("abort", abort, { once: true })
    if (signal?.aborted) abort()
    try {
      return await handle.result
    } finally {
      signal?.removeEventListener("abort", abort)
    }
  }

  #mutate(rootUri: string, mutation: RootSemanticWorkerMutationInput): void {
    try {
      void this.#supervisor(rootUri).mutate(mutation).catch(error => {
        this.#failure = error
      })
    } catch (error) {
      this.#failure = error
    }
  }

  #supervisor(rootUri: string): RootSemanticWorkerSupervisor {
    this.#assertAvailable()
    const existing = this.#supervisors.get(rootUri)
    if (existing) return existing
    const worker = this.#ensureWorker(rootUri)
    const epoch = this.#nextEpoch++
    const endpoint: RootSemanticWorkerEndpoint = {
      listen: (handlers) => {
        this.#handlers.set(epoch, handlers)
        return () => { this.#handlers.delete(epoch) }
      },
      send: message => worker.postMessage(message),
      terminate: () => { this.#handlers.delete(epoch) },
    }
    worker.postMessage({ control: "registerRoot", epoch, rootUri } satisfies WorkerControlMessage)
    const supervisor = new RootSemanticWorkerSupervisor({
      rootUri,
      epoch,
      endpoint,
      waitForDisposeDeadline: () => new Promise(resolve => setTimeout(resolve, 100)),
    })
    this.#supervisors.set(rootUri, supervisor)
    return supervisor
  }

  #ensureWorker(rootUri: string): Worker {
    if (this.#worker) return this.#worker
    const config = semanticRuntimeConfig(this.#environment)
    const references = referenceSearchRuntimeConfig(this.#environment)
    const worker = new Worker(this.#workerPath, {
      workerData: {
        rootUri,
        projectConfiguration: this.#projectConfiguration,
        sdkConfiguration: this.#sdkConfiguration,
        runtimeConfig: config,
        references,
        metricsPath: this.#environment.ARKTS_MEMORY_METRICS_FILE,
      },
    })
    worker.on("message", (message: unknown) => {
      const log = workerLogMessage(message)
      if (log) {
        this.#logger?.[log.level](log.event, log.fields)
        return
      }
      const epoch = messageEpoch(message)
      if (epoch !== undefined) this.#handlers.get(epoch)?.message(message)
    })
    worker.on("error", error => {
      this.#failure = error
      for (const handlers of this.#handlers.values()) handlers.error(error)
    })
    worker.on("exit", code => {
      if (!this.#disposed && code !== 0) this.#failure = new Error(`Semantic worker exited ${code}`)
      if (!this.#disposed) for (const handlers of this.#handlers.values()) handlers.exit(code)
    })
    this.#worker = worker
    this.#logger?.info("semantic.worker.started", { semanticWorkerCount: 1 })
    return worker
  }

  #sendControl(message: WorkerControlMessage): void {
    this.#worker?.postMessage(message)
  }

  #assertAvailable(): void {
    if (this.#disposed) throw new Error("Semantic worker is disposed")
    if (this.#failure) throw this.#failure
  }
}

function referenceSourceKind(
  sourceSpecifier: string,
): "sdk" | "package" | "relative" | "other" {
  if (isHarmonySdkModuleSpecifier(sourceSpecifier)) return "sdk"
  if (sourceSpecifier.startsWith("./") || sourceSpecifier.startsWith("../")) return "relative"
  if (/^(?:@[\w.-]+\/)?[\w.-]+(?:\/[^/\\]+)*$/.test(sourceSpecifier)) return "package"
  return "other"
}

function sdkExternalTerminalIdentity(
  sdk: ProjectSdkSelection,
  sourceSpecifier: string,
): string | undefined {
  if (!sdk.ready || !sdk.path || sdk.identity?.status !== "identified") return undefined
  try {
    const sdkRoot = fs.realpathSync.native(sdk.path)
    const candidate = resolveHarmonySdkModule(sdkRoot, sourceSpecifier)
    if (!candidate) return undefined
    const resolved = fs.realpathSync.native(candidate)
    const relative = path.relative(sdkRoot, resolved)
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`)
      || path.isAbsolute(relative) || !fs.statSync(resolved).isFile()) return undefined
    const identity = createHash("sha256")
      .update("arkts-sdk-terminal-v1\0")
      .update(sdkRoot)
      .update("\0")
      .update(sdk.identity.apiVersion ?? "")
      .update("\0")
      .update(sdk.identity.componentVersion ?? "")
      .update("\0")
      .update(sourceSpecifier)
      .update("\0")
      .update(relative.split(path.sep).join("/"))
      .digest("hex")
    return `sdk:${identity}`
  } catch {
    return undefined
  }
}

function identityReferenceUris(
  result: WorkspaceReferenceCandidateResult,
): readonly string[] {
  return result.identityComplete && result.identityUris.length > 0
    ? result.identityUris
    : result.uris
}

function completionPrefixContext(
  text: string,
  position: { line: number; character: number },
): { prefix: string; memberAccess: boolean } {
  const lines = text.split(/\r?\n/u)
  const line = lines[position.line] ?? ""
  let utf16 = 0
  let offset = 0
  while (offset < line.length && utf16 < position.character) {
    const codePoint = line.codePointAt(offset)
    if (codePoint === undefined) break
    const width = codePoint > 0xffff ? 2 : 1
    if (utf16 + width > position.character) break
    utf16 += width
    offset += width
  }
  const before = line.slice(0, offset)
  const prefix = /[\p{ID_Continue}$_]*$/u.exec(before)?.[0] ?? ""
  return {
    prefix,
    memberAccess: before.slice(0, before.length - prefix.length).endsWith("."),
  }
}

function relativeImportSpecifier(fromUri: string, candidateUri: string): string | undefined {
  if (!fromUri.startsWith("file:") || !candidateUri.startsWith("file:")) return undefined
  try {
    const fromDirectory = path.dirname(fileURLToPath(fromUri))
    const candidatePath = fileURLToPath(candidateUri)
      .replace(/\.(?:d\.)?(?:ets|ts)$/u, "")
      .replace(/[\\/]index$/u, "")
    let relative = path.relative(fromDirectory, candidatePath).split(path.sep).join("/")
    if (!relative.startsWith(".")) relative = `./${relative}`
    return relative
  } catch {
    return undefined
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

function messageEpoch(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined
  const epoch = (value as { epoch?: unknown }).epoch
  return Number.isSafeInteger(epoch) ? epoch as number : undefined
}

function workerLogMessage(value: unknown): {
  level: "info" | "error"
  event: string
  fields: Readonly<Record<string, string | number | boolean | null | undefined>>
} | undefined {
  if (!value || typeof value !== "object") return undefined
  const candidate = value as {
    workerEvent?: unknown
    level?: unknown
    event?: unknown
    fields?: unknown
  }
  if (candidate.workerEvent !== "log"
    || (candidate.level !== "info" && candidate.level !== "error")
    || typeof candidate.event !== "string"
    || candidate.event.length === 0
    || !candidate.fields
    || typeof candidate.fields !== "object"
    || Array.isArray(candidate.fields)) return undefined
  for (const field of Object.values(candidate.fields)) {
    if (field !== null && field !== undefined
      && typeof field !== "string" && typeof field !== "number" && typeof field !== "boolean") {
      return undefined
    }
  }
  return {
    level: candidate.level,
    event: candidate.event,
    fields: candidate.fields as Readonly<Record<string, string | number | boolean | null | undefined>>,
  }
}

function resourceEventPath(candidate: string): string {
  try { return fs.realpathSync.native(candidate) }
  catch {
    try { return path.join(fs.realpathSync.native(path.dirname(candidate)), path.basename(candidate)) }
    catch { return path.resolve(candidate) }
  }
}

function toFilePath(uri: string): string | undefined {
  try { return uri.startsWith("file:") ? fileURLToPath(uri) : undefined }
  catch { return undefined }
}
