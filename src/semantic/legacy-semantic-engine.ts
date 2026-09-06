import { fileURLToPath, pathToFileURL } from "node:url"

import type {
  DocumentSnapshot,
  TextPosition,
  TextRange,
  WorkspaceDescriptor,
} from "../contracts/document.js"
import type { ProjectResolverPort } from "../contracts/project-resolver.js"
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
import { SemanticTypeEngineRegistry } from "../core/types/type-engine.js"
import { SemanticDocumentStore } from "../core/workspace/document-store.js"

export class LegacySemanticEngine implements SemanticEnginePort {
  private readonly documents = new SemanticDocumentStore()
  private readonly engines = new SemanticTypeEngineRegistry()
  private readonly foldingRangeProvider = new FoldingRangeProvider()

  constructor(private readonly projects: ProjectResolverPort) {}

  sync(document: DocumentSnapshot): void {
    if (!document.uri.startsWith("file:")) return
    const workspace = this.projects.projectFor(document.uri)
    this.documents.sync({
      path: fileURLToPath(document.uri),
      content: document.text,
      documentVersion: document.version,
      workspaceRoot: fileURLToPath(workspace.rootUri),
    })
  }

  close(documentUri: string): void {
    if (documentUri.startsWith("file:")) this.documents.close(fileURLToPath(documentUri))
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
    const prepared = this.prepare(query.document, query.position, true)
    const completion = prepared.engine.complete(prepared.position)
    const items = completion.items
      .map((item) => toPublicCompletion(item, query.document.version))
    return {
      documentVersion: query.document.version,
      value: { items, isIncomplete: completion.isIncomplete },
    }
  }

  async resolveCompletion(
    query: SemanticCompletionResolveQuery,
  ): Promise<VersionedSemanticResult<SemanticCompletion>> {
    assertActive(query.signal)
    this.sync(query.document)
    const prepared = this.prepare(query.document, query.position, true)
    const item = prepared.engine.resolveCompletion(
      prepared.position,
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
    assertActive(query.signal)
    this.sync(query.document)
    const prepared = this.prepare(query.document, query.position)
    const value = prepared.engine.define(prepared.position).map((target) => ({
      uri: pathToFileURL(target.path).href,
      range: toPublicRange(target.range),
    }))
    return { documentVersion: query.document.version, value }
  }

  async typeDefinitions(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticDefinition[]>> {
    assertActive(query.signal)
    this.sync(query.document)
    const prepared = this.prepare(query.document, query.position)
    const value = prepared.engine.typeDefinitions(prepared.position).map((target) => ({
      uri: pathToFileURL(target.path).href,
      range: toPublicRange(target.range),
    }))
    return { documentVersion: query.document.version, value }
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
    assertActive(query.signal)
    this.sync(query.document)
    const prepared = this.prepare(query.document, query.position, true)
    const result = prepared.engine.references(prepared.position, query.includeDeclaration)
    return {
      documentVersion: query.document.version,
      value: result.status === "complete"
        ? {
            status: "complete",
            references: result.references.map((reference) => ({
              uri: pathToFileURL(reference.path).href,
              range: toPublicRange(reference.range),
            })),
          }
        : result,
    }
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
    const workspaceRoot = fileURLToPath(query.source.workspaceRootUri)
    const membershipRefresh = this.documents.refreshProjectMembership(workspaceRoot)
    if (membershipRefresh.removedPaths.length > 0) {
      return { status: "incomplete", reason: "source-unavailable" }
    }
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
    const prepared = this.prepare(query.document, { line: 0, character: 0 })
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
    includeWorkspaceFiles = false,
  ) {
    const workspace = this.projects.projectFor(document.uri)
    const legacyPosition = toLegacyPosition(document, position, workspace)
    const engine = this.engines.prepare(
      this.documents.prepare(legacyPosition, includeWorkspaceFiles),
    )
    return { engine, position: legacyPosition }
  }

  private prepareCallHierarchySource(
    source: SemanticCallHierarchyItemQuery["source"],
    position: TextPosition,
    includeWorkspaceFiles = false,
  ) {
    const documentUri = source.kind === "open" ? source.document.uri : source.uri
    const workspaceRoot = fileURLToPath(source.workspaceRootUri)
    const legacyPosition: SemanticDocumentPosition = {
      path: fileURLToPath(documentUri),
      line: position.line + 1,
      column: position.character + 1,
      workspaceRoot,
      ...(source.kind === "open" ? { documentVersion: source.document.version } : {}),
    }
    const workspace = source.kind === "open"
      ? (() => {
          this.documents.sync({
            path: legacyPosition.path,
            content: source.document.text,
            documentVersion: source.document.version,
            workspaceRoot,
          })
          return this.documents.prepare(legacyPosition, includeWorkspaceFiles)
        })()
      : this.documents.prepareDiskSnapshot(
          legacyPosition,
          source.text,
          includeWorkspaceFiles,
        )
    return { engine: this.engines.prepare(workspace), position: legacyPosition }
  }
}

function toLegacyPosition(
  document: DocumentSnapshot,
  position: TextPosition,
  workspace: WorkspaceDescriptor,
): SemanticDocumentPosition {
  return {
    path: fileURLToPath(document.uri),
    line: position.line + 1,
    column: position.character + 1,
    documentVersion: document.version,
    workspaceRoot: fileURLToPath(workspace.rootUri),
  }
}

function completionKind(kind: string): SemanticCompletionKind {
  switch (kind) {
    case "method":
    case "field":
    case "function":
    case "class":
    case "enum":
    case "enumMember":
    case "interface":
    case "keyword":
    case "variable":
      return kind
    default:
      return "property"
  }
}

function toPublicCompletion(
  item: SemanticCompletionItem,
  documentVersion: number,
): SemanticCompletion {
  return {
    label: item.label,
    detail: item.detail,
    kind: completionKind(item.kind),
    documentation: item.documentation,
    insertText: item.insertText,
    filterText: item.filterText,
    sortText: item.sortText,
    replacementRange: item.replacementRange
      ? toPublicRange(item.replacementRange)
      : undefined,
    additionalTextEdits: item.additionalTextEdits?.map((edit) => ({
      uri: pathToFileURL(edit.path).href,
      range: toPublicRange(edit.range),
      newText: edit.newText,
      expectedVersion: edit.expectedVersion ?? documentVersion,
    })),
    data: item.data,
  }
}

function toLegacyCompletion(item: SemanticCompletion): SemanticCompletionItem {
  return {
    label: item.label,
    detail: item.detail,
    kind: item.kind,
    documentation: item.documentation,
    insertText: item.insertText,
    filterText: item.filterText,
    sortText: item.sortText,
    replacementRange: item.replacementRange
      ? toLegacyRange(item.replacementRange)
      : undefined,
    data: item.data,
  }
}

function toPublicCallHierarchyItem(
  item: SemanticCallHierarchyItemInfo,
): SemanticCallHierarchyItem {
  return {
    uri: pathToFileURL(item.path).href,
    name: item.name,
    kind: item.kind,
    ...(item.sourceFingerprint ? { sourceFingerprint: item.sourceFingerprint } : {}),
    range: toPublicRange(item.range),
    selectionRange: toPublicRange(item.selectionRange),
    ...(item.detail ? { detail: item.detail } : {}),
  }
}

function toLegacyCallHierarchyItem(
  item: SemanticCallHierarchyItem,
): SemanticCallHierarchyItemInfo {
  return {
    path: fileURLToPath(item.uri),
    name: item.name,
    kind: item.kind,
    ...(item.sourceFingerprint ? { sourceFingerprint: item.sourceFingerprint } : {}),
    range: toLegacyRange(item.range),
    selectionRange: toLegacyRange(item.selectionRange),
    ...(item.detail ? { detail: item.detail } : {}),
  }
}

function toLegacyRange(range: TextRange) {
  return {
    startLine: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLine: range.end.line + 1,
    endColumn: range.end.character + 1,
  }
}

function toPublicRange(range: {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}) {
  return {
    start: { line: range.startLine - 1, character: range.startColumn - 1 },
    end: { line: range.endLine - 1, character: range.endColumn - 1 },
  }
}

function toPublicDocumentSymbol(symbol: SemanticDocumentSymbolInfo): SemanticDocumentSymbol {
  return {
    name: symbol.name,
    detail: symbol.detail,
    kind: symbol.kind,
    range: toPublicRange(symbol.range),
    selectionRange: toPublicRange(symbol.selectionRange),
    children: symbol.children?.map(toPublicDocumentSymbol),
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

function toFilePath(uri: string): string | undefined {
  try {
    return uri.startsWith("file:") ? fileURLToPath(uri) : undefined
  } catch {
    return undefined
  }
}
