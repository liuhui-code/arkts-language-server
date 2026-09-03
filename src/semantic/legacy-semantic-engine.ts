import { fileURLToPath, pathToFileURL } from "node:url"

import type {
  DocumentSnapshot,
  TextPosition,
  TextRange,
  WorkspaceDescriptor,
} from "../contracts/document.js"
import type { ProjectResolverPort } from "../contracts/project-resolver.js"
import type {
  SemanticCompletion,
  SemanticCompletionKind,
  SemanticCompletionResolveQuery,
  SemanticDiagnostic,
  SemanticDocumentQuery,
  SemanticDocumentSymbol,
  SemanticEnginePort,
  SemanticHover,
  SemanticQuery,
  SemanticSignatureHelp,
  VersionedSemanticResult,
  SemanticDefinition,
} from "../contracts/semantic-engine.js"
import type {
  SemanticCompletionItem,
  SemanticDocumentPosition,
  SemanticDocumentSymbolInfo,
} from "../core/protocol.js"
import { SemanticTypeEngineRegistry } from "../core/types/type-engine.js"
import { SemanticDocumentStore } from "../core/workspace/document-store.js"

export class LegacySemanticEngine implements SemanticEnginePort {
  private readonly documents = new SemanticDocumentStore()
  private readonly engines = new SemanticTypeEngineRegistry()

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

  async complete(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticCompletion[]>> {
    assertActive(query.signal)
    this.sync(query.document)
    const prepared = this.prepare(query.document, query.position, true)
    const value = prepared.engine.complete(prepared.position)
      .map((item) => toPublicCompletion(item, query.document.version))
    return { documentVersion: query.document.version, value }
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

  async diagnose(
    query: SemanticDocumentQuery,
  ): Promise<VersionedSemanticResult<SemanticDiagnostic[]>> {
    assertActive(query.signal)
    this.sync(query.document)
    const prepared = this.prepare(query.document, { line: 0, character: 0 })
    const value = prepared.engine.diagnostics(prepared.position).map((diagnostic) => ({
      range: toPublicRange(diagnostic.range),
      severity: diagnostic.severity,
      message: diagnostic.message,
      source: "arkts" as const,
    }))
    return { documentVersion: query.document.version, value }
  }

  async signatureHelp(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticSignatureHelp | null>> {
    assertActive(query.signal)
    this.sync(query.document)
    const prepared = this.prepare(query.document, query.position)
    return {
      documentVersion: query.document.version,
      value: prepared.engine.signatureHelp(prepared.position),
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
    case "function":
    case "class":
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

function assertActive(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error ? signal.reason : new Error("Semantic request cancelled")
}
