import { trySourceLocalNavigation } from "./source-local-navigation.js"
import { SourceReferenceOwner } from "./references/source-reference-owner.js"
import type { SemanticWorkerReferencesArgs } from "./worker-protocol.js"
import { DocumentSymbolOperation } from "./document-symbol-operation.js"
import { referenceCheckpoint } from "./references/reference-context-retention.js"
import { fileURLToPath, pathToFileURL } from "node:url"

import type {
  DocumentSnapshot,
  TextPosition,
  TextRange,
} from "../contracts/document.js"
import type { ProjectResolverPort } from "../contracts/project-resolver.js"
import { isProjectResourceFile, isProjectSourceNamespace } from "./resource-file-identity.js"
import type { SemanticReadinessQuery } from "../contracts/semantic-readiness.js"
import { ProjectReadinessLifecycle } from "./project-readiness.js"
import { prepareIncomingCallMembership } from "./incoming-call-membership.js"
import type {
  SemanticCallHierarchyItem,
  SemanticCallHierarchyItemQuery,
  SemanticCallHierarchyIncomingOutcome,
  SemanticCallHierarchyOutgoingOutcome,
  SemanticCallHierarchyPrepareOutcome,
  SemanticCodeAction,
  SemanticCodeActionQuery,
  SemanticCodeActionResolveQuery,
  SemanticCompletion,
  SemanticCompletionList,
  SemanticCompletionKind,
  SemanticCompletionResolveQuery,
  SemanticDiagnostic,
  SemanticDocumentHighlight,
  SemanticDocumentFormattingQuery,
  SemanticDocumentTextEdit,
  SemanticDocumentQuery,
  SemanticDocumentSymbol,
  SemanticEnginePort,
  SemanticFoldingRange,
  SemanticFoldingRangeQuery,
  SemanticHover,
  SemanticInlayHint,
  SemanticInlayHintQuery,
  SemanticQuery,
  SemanticPrepareRenameOutcome,
  SemanticReferencesOutcome,
  SemanticReferencesQuery,
  SemanticRenameOutcome,
  SemanticRenameQuery,
  SemanticResolvedCodeAction,
  SemanticSignatureHelp,
  SemanticSignatureHelpQuery,
  SemanticWorkspaceFileChangeBatch,
  VersionedSemanticResult,
  SemanticDefinition,
} from "../contracts/semantic-engine.js"
import type {
  SemanticCallHierarchyItemInfo,
  SemanticDocumentPosition,
  SemanticDocumentSymbolInfo,
} from "../core/protocol.js"
import { toFilePath } from "./semantic-worker-file-identity.js"
import { runDocumentFormattingQuery } from "./formatting-query.js"
import { FoldingRangeProvider } from "../core/syntax/folding-range-provider.js"
import type { SemanticTypeEngineRegistry } from "../core/types/type-engine.js"
import type { SemanticDocumentStore, SemanticWorkspaceView } from "../core/workspace/document-store.js"
import type { LocalPackageResolver } from "../core/sdk/local-package-resolver.js"
import { createSemanticEngineResources, applySemanticWorkspaceChanges } from "./semantic-engine-resources.js"
import { runNavigationQuery } from "./navigation-query.js"
import { runDiagnosticQuery } from "./diagnostic-operation.js"
import { withSynchronousInputPreparation } from "../project/request-input-validation.js"
import { runCompletionQuery, runCompletionResolveQuery, type CompletionPorts } from "./completion-operation.js"
import type { StructuredLogger } from "../observability/logger.js"
import type { SemanticMemoryLevel } from "./coordinator/semantic-coordinator.js"
import type { LegacySemanticEngineRuntimeOptions } from "./semantic-engine-runtime-options.js"
import { referenceQueryPosition, prepareReferenceAnchor, runResidentReferenceQuery, runOwnerReferenceQuery } from "./references/reference-anchor-preparation.js"
import { prepareCallHierarchyContext, prepareInteractiveContext, toLegacyPosition } from "./interactive-workspace.js"
import { toPublicCallHierarchyItem,
  toLegacyCallHierarchyItem, toPublicRange, toLegacyRange } from "./legacy-result-mappers.js"

export type { LegacySemanticEngineRuntimeOptions } from "./semantic-engine-runtime-options.js"

export class LegacySemanticEngine implements SemanticEnginePort {
  private readonly packageResolver: LocalPackageResolver
  private readonly documents: SemanticDocumentStore
  private readonly engines: SemanticTypeEngineRegistry
  private readonly foldingRangeProvider = new FoldingRangeProvider()
  private readonly interactiveProjectRootProfile: "closure" | "current"
  private readonly memberCompletionProjectRootProfile: "group" | "workspace" | "current"
  private readonly autoImportProjectRootProfile: "workspace" | "discovery"
  private readonly autoImportBatchRootLimit: number
  private readonly autoImportTrimBetweenBatches: boolean
  private readonly projectPreparation = new ProjectReadinessLifecycle()
  private readonly documentSymbolOperation: DocumentSymbolOperation
  private readonly sourceReferenceOwner = new SourceReferenceOwner()

  constructor(
    private readonly projects: ProjectResolverPort,
    private readonly logger?: StructuredLogger,
    private readonly runtime: LegacySemanticEngineRuntimeOptions = {},
  ) {
    const resources = createSemanticEngineResources(logger, runtime)
    this.packageResolver = resources.packageResolver
    this.documents = resources.documents
    this.engines = resources.engines
    this.documentSymbolOperation = new DocumentSymbolOperation(referenceCheckpoint(runtime.hostCancellationToken) ?? (() => {}))
    this.interactiveProjectRootProfile = runtime.interactiveProjectRootProfile ?? "closure"
    this.memberCompletionProjectRootProfile = runtime.memberCompletionProjectRootProfile ?? "group"
    this.autoImportProjectRootProfile = runtime.autoImportProjectRootProfile ?? "workspace"
    this.autoImportBatchRootLimit = runtime.autoImportBatchRootLimit ?? 128
    this.autoImportTrimBetweenBatches = runtime.autoImportTrimBetweenBatches ?? false
  }

  runtimeStats() {
    return this.engines.runtimeStats()
  }

  async semanticReadiness(query: SemanticReadinessQuery) { return this.projectPreparation.read(query, this.projects, this.documents, this.engines) }
  restoreInitialPreparation(rootUri: string): void { this.projectPreparation.restoreCompleted(rootUri) }

  applyMemoryPressure(level: SemanticMemoryLevel): void {
    this.engines.applyMemoryPressure(level)
    this.sourceReferenceOwner.applyMemoryPressure(level)
    if (level === "level2" || level === "level3") this.documentSymbolOperation.dispose()
  }

  sync(document: DocumentSnapshot): void {
    if (document.source?.kind === "disk") return
    if (!document.uri.startsWith("file:")) return
    const workspace = this.projects.projectFor(document.uri)
    this.documents.sync({
      path: fileURLToPath(document.uri),
      content: document.text,
      documentVersion: document.version,
      workspaceRoot: fileURLToPath(workspace.rootUri),
    })
  }

  configureProject(selection: unknown): void {
    this.packageResolver.configureProject(selection)
    this.engines.configureProject(selection)
    this.documentSymbolOperation.configureProject(selection)
  }

  configureSdk(selection: unknown): void {
    this.engines.configureSdk(selection)
    this.documentSymbolOperation.configureSdk(selection)
  }

  isResourceFile = (rootUri: string, fileUri: string): boolean => isProjectResourceFile(this.packageResolver, rootUri, fileUri)
  isSourceNamespace = (rootUri: string, fileUri: string): boolean => isProjectSourceNamespace(this.packageResolver, rootUri, fileUri)
  close(documentUri: string): void {
    this.documentSymbolOperation.close(documentUri)
    if (documentUri.startsWith("file:")) this.documents.close(fileURLToPath(documentUri),
      fileURLToPath(this.projects.projectFor(documentUri).rootUri))
  }

  workspaceFilesChanged(batches: readonly SemanticWorkspaceFileChangeBatch[]): void {
    applySemanticWorkspaceChanges(batches, this.documents, this.engines)
    for (const batch of batches) if (batch.configurationChanged) {
      const root = toFilePath(batch.rootUri)
      if (root) this.documentSymbolOperation.invalidate(root)
    }
  }

  async complete(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticCompletionList>> {
    return runCompletionQuery(query, this.completionPorts(query))
  }

  async resolveCompletion(
    query: SemanticCompletionResolveQuery,
  ): Promise<VersionedSemanticResult<SemanticCompletion>> {
    return runCompletionResolveQuery(query, this.completionPorts(query), this.packageResolver)
  }

  async define(query: SemanticQuery): Promise<VersionedSemanticResult<SemanticDefinition[]>> {
    this.runtime.refreshMemoryPressure?.()
    return trySourceLocalNavigation(query, this.sourceReferenceOwner, this.runtime.sourceDocuments,
      referenceCheckpoint(this.runtime.hostCancellationToken) ?? (() => {}), this.logger)
      ?? runNavigationQuery("define", query, { sync: () => this.sync(query.document),
        prepare: scope => this.prepare(query.document, query.position, scope) })
  }

  async typeDefinitions(query: SemanticQuery): Promise<VersionedSemanticResult<SemanticDefinition[]>> {
    return runNavigationQuery("typeDefinitions", query, { sync: () => this.sync(query.document),
      prepare: scope => this.prepare(query.document, query.position, scope) })
  }

  async implementations(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticDefinition[]>> {
    assertActive(query.signal)
    this.sync(query.document)
    const prepared = this.prepare(query.document, query.position, true)
    const value = prepared.engine.implementations(prepared.position).map((target) => ({
      uri: pathToFileURL(target.path).href,
      range: toPublicRange(target.range),
    }))
    return { documentVersion: query.document.version, value }
  }

  async references(
    query: SemanticReferencesQuery,
  ): Promise<VersionedSemanticResult<SemanticReferencesOutcome>> {
    return this.referencesWithCandidates(query)
  }

  async residentReferences(query: SemanticReferencesQuery, synchronize = false, qualification?: SemanticWorkerReferencesArgs["qualifiedOnly"]): Promise<VersionedSemanticResult<SemanticReferencesOutcome | null>> {
    assertActive(query.signal)
    if (qualification === "source") {
      this.runtime.refreshMemoryPressure?.()
      return this.sourceReferenceOwner.references(query, referenceCheckpoint(this.runtime.hostCancellationToken) ?? (() => {}), this.runtime.references?.trace ? this.logger : undefined)
    }
    this.sync(query.document)
    const { position, rootPath } = referenceQueryPosition(query, this.projects)
    return runResidentReferenceQuery(query, position, rootPath,
      this.documents, this.engines, synchronize, this.runtime.references?.trace ? this.logger : undefined, qualification)
  }

  async referencesWithCandidates(
    query: SemanticReferencesQuery,
    candidateUris?: readonly string[],
    candidateIdentityComplete = false,
    candidateAnchorUri?: string,
    candidateSupportUris?: readonly string[],
    forceLegacy = false,
    candidateAnchorPosition?: TextPosition,
  ): Promise<VersionedSemanticResult<SemanticReferencesOutcome>> {
    assertActive(query.signal)
    this.sync(query.document)
    const { position } = referenceQueryPosition(query, this.projects)
    if (candidateAnchorUri && candidateAnchorPosition) position.expectedReferenceAnchor = {
      path: toFilePath(candidateAnchorUri)!, line: candidateAnchorPosition.line + 1,
      column: candidateAnchorPosition.character + 1,
    }
    return runOwnerReferenceQuery(query, position, this.documents, this.engines,
      { candidateUris, candidateIdentityComplete, candidateAnchorUri, candidateSupportUris, forceLegacy },
      this.runtime.references?.trace ? this.logger : undefined)
  }

  async referenceAnchor(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticDefinition[]>> {
    assertActive(query.signal)
    this.sync(query.document)
    const { position } = referenceQueryPosition(query, this.projects)
    return prepareReferenceAnchor(
      position, query.document.version, this.documents, this.engines,
      this.runtime.references?.trace ? this.logger : undefined, query.document,
    )
  }

  async prepareRename(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticPrepareRenameOutcome>> {
    assertActive(query.signal)
    this.sync(query.document)
    const prepared = this.prepare(query.document, query.position, true)
    const result = prepared.engine.prepareRename(prepared.position)
    return {
      documentVersion: query.document.version,
      value: result.status === "ready"
        ? {
            status: "ready",
            range: toPublicRange(result.range),
            placeholder: result.placeholder,
          }
        : result,
    }
  }

  async rename(
    query: SemanticRenameQuery,
  ): Promise<VersionedSemanticResult<SemanticRenameOutcome>> {
    assertActive(query.signal)
    this.sync(query.document)
    const prepared = this.prepare(query.document, query.position, true)
    const result = prepared.engine.rename(prepared.position, query.newName)
    return {
      documentVersion: query.document.version,
      value: result.status === "complete"
        ? {
            status: "complete",
            edits: result.edits.map((edit) => ({
              uri: pathToFileURL(edit.path).href,
              range: toPublicRange(edit.range),
              newText: edit.newText,
              expectedVersion: edit.expectedVersion,
            })),
          }
        : result,
    }
  }

  async documentSymbols(
    query: SemanticDocumentQuery,
  ): Promise<VersionedSemanticResult<SemanticDocumentSymbol[]>> {
    assertActive(query.signal)
    this.sync(query.document)
    const root = fileURLToPath(this.projects.projectFor(query.document.uri).rootUri)
    return this.documentSymbolOperation.run(root, query)
  }

  async documentHighlights(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticDocumentHighlight[]>> {
    return withSynchronousInputPreparation(() => {
      assertActive(query.signal)
      this.sync(query.document)
      const prepared = this.prepare(query.document, query.position)
      return {
        documentVersion: query.document.version,
        value: prepared.engine.documentHighlights(prepared.position).map((highlight) => ({
          range: toPublicRange(highlight.range),
          kind: highlight.kind,
        })),
      }
    })
  }

  async inlayHints(
    query: SemanticInlayHintQuery,
  ): Promise<VersionedSemanticResult<SemanticInlayHint[]>> {
    return withSynchronousInputPreparation(() => {
      assertActive(query.signal)
      this.sync(query.document)
      const prepared = this.prepare(query.document, query.range.start)
      return {
        documentVersion: query.document.version,
        value: prepared.engine.inlayHints(prepared.position, toLegacyRange(query.range)).map((hint) => ({
          ...hint,
          position: {
            line: hint.position.line - 1,
            character: hint.position.column - 1,
          },
        })),
      }
    })
  }

  async prepareCallHierarchy(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticCallHierarchyPrepareOutcome>> {
    assertActive(query.signal)
    this.sync(query.document)
    const prepared = this.prepare(query.document, query.position)
    const result = prepared.engine.prepareCallHierarchy(prepared.position)
    return {
      documentVersion: query.document.version,
      value: result.status === "complete"
        ? {
            status: "complete",
            items: result.items.map(toPublicCallHierarchyItem),
          }
        : result,
    }
  }

  async outgoingCalls(
    query: SemanticCallHierarchyItemQuery,
  ): Promise<SemanticCallHierarchyOutgoingOutcome> {
    assertActive(query.signal)
    const prepared = this.prepareCallHierarchySource(
      query.source,
      query.item.selectionRange.start,
    )
    const result = prepared.engine.outgoingCalls(
      prepared.position,
      toLegacyCallHierarchyItem(query.item),
    )
    return result.status === "complete"
      ? {
          status: "complete",
          calls: result.calls.map((call) => ({
            to: toPublicCallHierarchyItem(call.to),
            fromRanges: call.fromRanges.map(toPublicRange),
          })),
        }
      : result
  }

  async incomingCalls(
    query: SemanticCallHierarchyItemQuery,
  ): Promise<SemanticCallHierarchyIncomingOutcome> {
    assertActive(query.signal)
    const membershipFailure = prepareIncomingCallMembership(this.documents, query.source.workspaceRootUri)
    if (membershipFailure) return membershipFailure
    const prepared = this.prepareCallHierarchySource(
      query.source,
      query.item.selectionRange.start,
      true,
    )
    const result = prepared.engine.incomingCalls(
      prepared.position,
      toLegacyCallHierarchyItem(query.item),
    )
    return result.status === "complete"
      ? {
          status: "complete",
          calls: result.calls.map((call) => ({
            from: toPublicCallHierarchyItem(call.from),
            fromRanges: call.fromRanges.map(toPublicRange),
          })),
        }
      : result
  }

  async foldingRanges(
    query: SemanticFoldingRangeQuery,
  ): Promise<VersionedSemanticResult<SemanticFoldingRange[]>> {
    assertActive(query.signal)
    return {
      documentVersion: query.document.version,
      value: this.foldingRangeProvider.provide(query.document.text, {
        lineFoldingOnly: query.lineFoldingOnly,
        rangeLimit: query.rangeLimit,
      }).map((range) => ({ ...range })),
    }
  }

  async formatDocument(query: SemanticDocumentFormattingQuery): Promise<VersionedSemanticResult<SemanticDocumentTextEdit[]>> {
    return runDocumentFormattingQuery(query, () => assertActive(query.signal))
  }

  async diagnose(
    query: SemanticDocumentQuery,
  ): Promise<VersionedSemanticResult<SemanticDiagnostic[]>> {
    return runDiagnosticQuery(query, {
      sync: () => this.sync(query.document),
      prepare: () => this.prepare(query.document, { line: 0, character: 0 }, false,
        this.interactiveProjectRootProfile, [], false),
    })
  }

  async codeActions(
    query: SemanticCodeActionQuery,
  ): Promise<VersionedSemanticResult<SemanticCodeAction[]>> {
    assertActive(query.signal)
    this.sync(query.document)
    const prepared = this.prepare(query.document, query.range.start)
    const value = prepared.engine
      .codeActions(prepared.position, toLegacyRange(query.range))
      .map((action) => ({
        title: action.title,
        kind: action.kind,
        diagnostic: {
          range: toPublicRange(action.diagnostic.range),
          severity: action.diagnostic.severity,
          code: action.diagnostic.code,
          message: action.diagnostic.message,
          source: "arkts" as const,
        },
        fingerprint: action.fingerprint,
      }))
    return { documentVersion: query.document.version, value }
  }

  async resolveCodeAction(
    query: SemanticCodeActionResolveQuery,
  ): Promise<VersionedSemanticResult<SemanticResolvedCodeAction | null>> {
    assertActive(query.signal)
    this.sync(query.document)
    const prepared = this.prepare(query.document, query.action.diagnostic.range.start)
    const action = prepared.engine.resolveCodeAction(
      prepared.position,
      toLegacyRange(query.action.diagnostic.range),
      query.action.fingerprint,
    )
    return {
      documentVersion: query.document.version,
      value: action
        ? {
            title: action.title,
            kind: action.kind,
            diagnostic: {
              range: toPublicRange(action.diagnostic.range),
              severity: action.diagnostic.severity,
              code: action.diagnostic.code,
              message: action.diagnostic.message,
              source: "arkts",
            },
            fingerprint: action.fingerprint,
            edits: action.edits.map((edit) => ({
              uri: pathToFileURL(edit.path).href,
              range: toPublicRange(edit.range),
              newText: edit.newText,
              expectedVersion: edit.expectedVersion,
            })),
          }
        : null,
    }
  }

  async signatureHelp(
    query: SemanticSignatureHelpQuery,
  ): Promise<VersionedSemanticResult<SemanticSignatureHelp | null>> {
    return withSynchronousInputPreparation(() => {
      assertActive(query.signal)
      this.sync(query.document)
      const prepared = this.prepare(query.document, query.position)
      return {
        documentVersion: query.document.version,
        value: prepared.engine.signatureHelp(prepared.position, query.triggerReason),
      }
    })
  }

  async hover(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticHover | null>> {
    return withSynchronousInputPreparation(() => {
      assertActive(query.signal)
      this.sync(query.document)
      const prepared = this.prepare(query.document, query.position)
      const hover = prepared.engine.hover(prepared.position)
      return {
        documentVersion: query.document.version,
        value: hover
          ? {
              signature: hover.signature,
              documentation: hover.documentation,
              range: toPublicRange(hover.range),
            }
          : null,
      }
    })
  }

  dispose(): void {
    this.sourceReferenceOwner.dispose()
    this.documentSymbolOperation.dispose()
    this.engines.dispose()
  }

  private completionPorts(query: Pick<SemanticQuery, "document" | "signal">): CompletionPorts {
    return {
      sync: () => this.sync(query.document), checkpoint: () => assertActive(query.signal),
      operationScoped: () => this.engines.hasOperationScopes(toFilePath(query.document.workspaceId)),
      hasGroups: () => this.engines.hasSemanticGroups(toFilePath(query.document.workspaceId)),
      membershipComplete: () => this.documents.membershipFor(toFilePath(query.document.workspaceId)!).status === "complete",
      runtime: { projectRootProfile: this.interactiveProjectRootProfile, memberCompletionProjectRootProfile: this.memberCompletionProjectRootProfile,
        autoImportProjectRootProfile: this.autoImportProjectRootProfile, autoImportBatchRootLimit: this.autoImportBatchRootLimit,
        autoImportTrimBetweenBatches: this.autoImportTrimBetweenBatches },
      prepare: (...args) => this.prepare(...args),
    }
  }

  private prepare(
    document: DocumentSnapshot,
    position: TextPosition,
    includeWorkspaceFiles: boolean | "definition-fallback" = false,
    projectRootProfile = this.interactiveProjectRootProfile,
    additionalSemanticRoots: readonly string[] = [],
    certifyReadiness = true,
  ) {
    return prepareInteractiveContext(this.documents, this.engines, this.projects, document, position,
      { includeWorkspaceFiles, projectRootProfile, additionalSemanticRoots, certifyReadiness })
  }

  private prepareCallHierarchySource(
    source: SemanticCallHierarchyItemQuery["source"],
    position: TextPosition,
    includeWorkspaceFiles = false,
  ) {
    return prepareCallHierarchyContext(this.documents, this.engines, source, position,
      includeWorkspaceFiles, this.interactiveProjectRootProfile)
  }

}

function assertActive(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error ? signal.reason : new Error("Semantic request cancelled")
}
