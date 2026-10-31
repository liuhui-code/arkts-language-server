import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import type {
  DocumentSnapshot,
  TextPosition,
  TextRange,
} from "../contracts/document.js"
import type { ProjectResolverPort } from "../contracts/project-resolver.js"
import { isProjectResourceFile } from "./resource-file-identity.js"
import type { SemanticReadinessQuery } from "../contracts/semantic-readiness.js"
import { ProjectReadinessLifecycle } from "./project-readiness.js"
import { prepareIncomingCallMembership } from "./incoming-call-membership.js"
import { reusablePreparedCompletion } from "./prepared-completion-inputs.js"
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
  SemanticCompletionItem,
  SemanticDocumentPosition,
  SemanticDocumentSymbolInfo,
} from "../core/protocol.js"
import { isArkUIStringResourcePath } from "../core/arkui/resource-path.js"
import { formatArktsDocument } from "../core/formatting/arkts-document-formatter.js"
import { FoldingRangeProvider } from "../core/syntax/folding-range-provider.js"
import type { SemanticTypeEngineRegistry } from "../core/types/type-engine.js"
import { toFilePath } from "./semantic-worker-file-identity.js"
import { completionQueryPlan, semanticRootFingerprints, completionItemIdentity,
  completionItemDiscoveryProjectRoots, memberCompletionScope } from "./completion-batch-planning.js"
import { publicReferenceResult } from "./references/reference-result-mapping.js"
import type { SemanticDocumentStore, SemanticWorkspaceView } from "../core/workspace/document-store.js"
import type { LocalPackageResolver } from "../core/sdk/local-package-resolver.js"
import { createSemanticEngineResources } from "./semantic-engine-resources.js"
import { runNavigationQuery } from "./navigation-query.js"
import type { StructuredLogger } from "../observability/logger.js"
import type { SemanticMemoryLevel } from "./coordinator/semantic-coordinator.js"
import type { LegacySemanticEngineRuntimeOptions } from "./semantic-engine-runtime-options.js"
import { prepareReferenceAnchor, prepareReferenceSearchWorkspace, runOwnerReferenceQuery } from "./references/reference-anchor-preparation.js"
import { interactiveWorkspace, prepareInteractiveContext, prepareSourceWorkspace, refreshInteractiveReadiness, toLegacyPosition } from "./interactive-workspace.js"
import { toPublicCompletion, toLegacyCompletion, toPublicCallHierarchyItem,
  toLegacyCallHierarchyItem, toPublicRange, toLegacyRange, toPublicDocumentSymbol } from "./legacy-result-mappers.js"

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

  constructor(
    private readonly projects: ProjectResolverPort,
    private readonly logger?: StructuredLogger,
    private readonly runtime: LegacySemanticEngineRuntimeOptions = {},
  ) {
    const resources = createSemanticEngineResources(logger, runtime)
    this.packageResolver = resources.packageResolver
    this.documents = resources.documents
    this.engines = resources.engines
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
  }

  configureSdk(selection: unknown): void {
    this.engines.configureSdk(selection)
  }

  isResourceFile(rootUri: string, fileUri: string): boolean {
    return isProjectResourceFile(this.packageResolver, rootUri, fileUri)
  }
  close(documentUri: string): void {
    if (documentUri.startsWith("file:")) this.documents.close(fileURLToPath(documentUri),
      fileURLToPath(this.projects.projectFor(documentUri).rootUri))
  }

  workspaceFilesChanged(batches: readonly SemanticWorkspaceFileChangeBatch[]): void {
    for (const batch of batches) {
      const rootPath = toFilePath(batch.rootUri)
      if (!rootPath) continue
      const changes = batch.changes.flatMap((change) => {
        const changedPath = toFilePath(change.uri)
        return changedPath ? [{ path: changedPath, kind: change.kind }] : []
      })
      if (batch.resourceChanged || batch.resourceDirty || changes.some(({ path: changedPath }) => (
        isArkUIStringResourcePath(changedPath)
      ))) {
        this.engines.invalidateArkUIResources(rootPath)
      }
      const sourceChanges = changes.filter(({ path: changedPath }) => (
        changedPath.endsWith(".ets") || changedPath.endsWith(".ts")
      ))
      if (!batch.rootDirty && sourceChanges.length === 0) continue
      this.documents.workspaceFilesChanged({
        rootPath,
        rootDirty: batch.rootDirty,
        changes: sourceChanges,
      })
    }
  }

  async complete(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticCompletionList>> {
    assertActive(query.signal)
    this.sync(query.document)
    const plan = completionQueryPlan(query, {
      projectRootProfile: this.interactiveProjectRootProfile, memberCompletionProjectRootProfile: this.memberCompletionProjectRootProfile,
      autoImportProjectRootProfile: this.autoImportProjectRootProfile, autoImportBatchRootLimit: this.autoImportBatchRootLimit,
    }, () => this.engines.hasSemanticGroups(toFilePath(query.document.workspaceId)),
      () => this.documents.membershipFor(toFilePath(query.document.workspaceId)!).status === "complete")
    const autoImportBatches = plan.discovery, preparation = plan.scope
    const batches = autoImportBatches ?? [{
      roots: [] as readonly string[],
      candidates: query.completionDiscovery?.candidates ?? [],
    }]
    const mergedItems: SemanticCompletionItem[] = []
    const itemIndexes = new Map<string, number>()
    let isIncomplete = !plan.memberAccess && preparation.scopeIncomplete
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      assertActive(query.signal)
      const batch = batches[batchIndex]
      const prepared = this.prepare(query.document, query.position,
        preparation.includeWorkspaceFiles, preparation.projectRootProfile, batch.roots)
      const traceContext = autoImportBatches
        ? {
            completionBatchIndex: batchIndex,
            completionBatchCount: batches.length,
            discoveryRootCount: batch.roots.length,
            discoveryCandidateCount: batch.candidates.length,
            discoveryRootFingerprints: semanticRootFingerprints(
              query.document.workspaceId,
              batch.roots,
            ),
          }
        : undefined
      const completion = prepared.engine.complete(
        {
          ...prepared.position,
          allowSnippets: query.completionOptions?.snippets === true,
          completionDiscovery: query.completionDiscovery
            ? {
                ...query.completionDiscovery,
                candidates: batch.candidates,
                preResolve: autoImportBatches !== undefined,
              }
            : undefined,
        },
        traceContext,
      )
      isIncomplete ||= completion.isIncomplete
      for (const item of completion.items) {
        const identity = completionItemIdentity(item)
        const existingIndex = itemIndexes.get(identity)
        if (existingIndex !== undefined) {
          if (!mergedItems[existingIndex].preResolved && item.preResolved) {
            mergedItems[existingIndex] = item
          }
          continue
        }
        itemIndexes.set(identity, mergedItems.length)
        mergedItems.push(item)
      }
      if (
        this.autoImportTrimBetweenBatches
        && traceContext
        && batchIndex < batches.length - 1
      ) {
        prepared.engine.trimCompletion(traceContext)
      }
    }
    const items = mergedItems
      .map((item) => toPublicCompletion(item, query.document.version))
    return {
      documentVersion: query.document.version,
      value: { items, isIncomplete },
    }
  }

  async resolveCompletion(
    query: SemanticCompletionResolveQuery,
  ): Promise<VersionedSemanticResult<SemanticCompletion>> {
    assertActive(query.signal)
    this.sync(query.document)
    const autoImportRoots = completionItemDiscoveryProjectRoots(query.completion, query.document.workspaceId)
    const reusable = reusablePreparedCompletion(query, this.packageResolver, toFilePath(query.document.workspaceId),
      autoImportRoots !== undefined, () => assertActive(query.signal))
    if (reusable) return { documentVersion: query.document.version, value: reusable }
    const member = autoImportRoots === undefined ? memberCompletionScope(query,
      this.interactiveProjectRootProfile, this.memberCompletionProjectRootProfile,
      () => this.engines.hasSemanticGroups(toFilePath(query.document.workspaceId)),
      () => this.documents.membershipFor(toFilePath(query.document.workspaceId)!).status === "complete") : undefined
    const prepared = autoImportRoots === undefined
      ? this.prepare(query.document, query.position, ...member!.preparation)
      : this.prepare(query.document, query.position, false, "current", autoImportRoots)
    const item = prepared.engine.resolveCompletion(
      { ...prepared.position, allowSnippets: query.completionOptions?.snippets === true },
      toLegacyCompletion(query.completion),
    )
    return {
      documentVersion: query.document.version,
      value: toPublicCompletion(item, query.document.version),
    }
  }

  async define(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticDefinition[]>> {
    return runNavigationQuery("define", query, { sync: () => this.sync(query.document),
      prepare: scope => this.prepare(query.document, query.position, scope) })
  }

  async typeDefinitions(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticDefinition[]>> {
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

  async residentReferences(query: SemanticReferencesQuery, synchronize = false): Promise<VersionedSemanticResult<SemanticReferencesOutcome | null>> {
    assertActive(query.signal)
    this.sync(query.document)
    const workspace = this.projects.projectFor(query.document.uri)
    const position = toLegacyPosition(query.document, query.position, workspace)
    const prepare = () => prepareReferenceSearchWorkspace(position, this.documents,
      this.runtime.references?.trace ? this.logger : undefined, query.document)
    const result = synchronize ? this.engines.retainedReferences(fileURLToPath(workspace.rootUri), prepare, position, query.includeDeclaration)
      : this.engines.residentReferences(prepare(), position, query.includeDeclaration)
    return result ? publicReferenceResult(query.document.version, result)
      : { documentVersion: query.document.version, value: null }
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
    const workspace = this.projects.projectFor(query.document.uri)
    const position = toLegacyPosition(query.document, query.position, workspace)
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
    const workspace = this.projects.projectFor(query.document.uri)
    const position = toLegacyPosition(query.document, query.position, workspace)
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
    const prepared = this.prepare(query.document, { line: 0, character: 0 })
    return {
      documentVersion: query.document.version,
      value: prepared.engine.documentSymbols(prepared.position).map(toPublicDocumentSymbol),
    }
  }

  async documentHighlights(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticDocumentHighlight[]>> {
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
  }

  async inlayHints(
    query: SemanticInlayHintQuery,
  ): Promise<VersionedSemanticResult<SemanticInlayHint[]>> {
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

  async formatDocument(
    query: SemanticDocumentFormattingQuery,
  ): Promise<VersionedSemanticResult<SemanticDocumentTextEdit[]>> {
    assertActive(query.signal)
    const source = query.document.text
    const lineStarts = sourceLineStarts(source)
    const value = formatArktsDocument(
      fileURLToPath(query.document.uri),
      source,
      query.options,
    ).map((edit) => ({
      range: {
        start: positionAtOffset(lineStarts, edit.start),
        end: positionAtOffset(lineStarts, edit.start + edit.length),
      },
      newText: edit.newText,
    }))
    assertActive(query.signal)
    return { documentVersion: query.document.version, value }
  }

  async diagnose(
    query: SemanticDocumentQuery,
  ): Promise<VersionedSemanticResult<SemanticDiagnostic[]>> {
    assertActive(query.signal)
    this.sync(query.document)
    const prepared = this.prepare(query.document, { line: 0, character: 0 }, false,
      this.interactiveProjectRootProfile, [], false)
    const value = prepared.engine.diagnostics(prepared.position).map((diagnostic) => ({
      range: toPublicRange(diagnostic.range),
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      source: "arkts" as const,
    }))
    return { documentVersion: query.document.version, value }
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
    assertActive(query.signal)
    this.sync(query.document)
    const prepared = this.prepare(query.document, query.position)
    return {
      documentVersion: query.document.version,
      value: prepared.engine.signatureHelp(prepared.position, query.triggerReason),
    }
  }

  async hover(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticHover | null>> {
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
  }

  dispose(): void {
    this.engines.dispose()
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
    const prepared = prepareSourceWorkspace(this.documents, source, position, includeWorkspaceFiles)
    refreshInteractiveReadiness(this.documents, this.engines, prepared.workspace)
    return {
      engine: includeWorkspaceFiles || this.interactiveProjectRootProfile === "current" ? this.engines.prepare(interactiveWorkspace(
        prepared.workspace,
        prepared.position.path,
        includeWorkspaceFiles,
        this.interactiveProjectRootProfile,
      )) : this.engines.prepareInteractive(prepared.workspace, () => this.documents.membershipFor(prepared.workspace.rootPath)),
      position: prepared.position,
    }
  }

}

function resourceEventPath(candidate: string): string {
  try { return fs.realpathSync.native(candidate) }
  catch {
    try { return path.join(fs.realpathSync.native(path.dirname(candidate)), path.basename(candidate)) }
    catch { return path.resolve(candidate) }
  }
}

function sourceLineStarts(source: string): number[] {
  const starts = [0]
  for (let offset = 0; offset < source.length; offset += 1) {
    const character = source[offset]
    if (character === "\r" && source[offset + 1] === "\n") offset += 1
    else if (character !== "\r" && character !== "\n") continue
    starts.push(offset + 1)
  }
  return starts
}

function positionAtOffset(
  lineStarts: readonly number[],
  offset: number,
): TextPosition {
  let low = 0
  let high = lineStarts.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    if ((lineStarts[middle] ?? Number.POSITIVE_INFINITY) <= offset) low = middle + 1
    else high = middle
  }
  const line = Math.max(0, low - 1)
  return { line, character: offset - (lineStarts[line] ?? 0) }
}

function assertActive(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error ? signal.reason : new Error("Semantic request cancelled")
}
