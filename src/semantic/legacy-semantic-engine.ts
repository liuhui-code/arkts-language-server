import { fileURLToPath, pathToFileURL } from "node:url"

import type {
  DocumentSnapshot,
  TextPosition,
  WorkspaceDescriptor,
} from "../contracts/document.js"
import type { ProjectResolverPort } from "../contracts/project-resolver.js"
import type {
  SemanticCompletion,
  SemanticCompletionKind,
  SemanticDiagnostic,
  SemanticDocumentQuery,
  SemanticEnginePort,
  SemanticHover,
  SemanticQuery,
  SemanticSignatureHelp,
  VersionedSemanticResult,
  SemanticDefinition,
} from "../contracts/semantic-engine.js"
import type { SemanticDocumentPosition } from "../core/protocol.js"
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
    const prepared = this.prepare(query.document, query.position)
    const value = prepared.engine.complete(prepared.position).map((item) => ({
      label: item.label,
      detail: item.detail,
      kind: completionKind(item.kind),
      insertText: item.insertText,
      filterText: item.filterText,
      sortText: item.sortText,
    }))
    return { documentVersion: query.document.version, value }
  }

  async define(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticDefinition[]>> {
    assertActive(query.signal)
    this.sync(query.document)
    const prepared = this.prepare(query.document, query.position)
    const value = prepared.engine.define(prepared.position).map((target) => {
      const start = { line: target.line - 1, character: target.column - 1 }
      return {
        uri: pathToFileURL(target.path).href,
        range: { start, end: start },
      }
    })
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

  private prepare(document: DocumentSnapshot, position: TextPosition) {
    const workspace = this.projects.projectFor(document.uri)
    const legacyPosition = toLegacyPosition(document, position, workspace)
    const engine = this.engines.prepare(this.documents.prepare(legacyPosition))
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

function assertActive(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error ? signal.reason : new Error("Semantic request cancelled")
}
