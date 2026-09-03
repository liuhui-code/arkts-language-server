import type {
  SemanticCompletionItem,
  SemanticDefinitionCandidate,
  SemanticDiagnostic,
  SemanticDocumentPosition,
  SemanticDocumentSymbolInfo,
  SemanticHoverInfo,
  SemanticSignatureHelp,
  SemanticTextRange,
  SemanticUsageResult,
} from "../protocol.js"
import type { SemanticWorkspaceView } from "../workspace/document-store.js"
import { TypeScriptLanguageServiceEngine } from "./typescript-language-service.js"

const MAX_WORKSPACE_ENGINES = 4

export type SemanticTypeStatus = "ready" | "partial" | "unsupported"

export interface SemanticTypeEngineState {
  status: SemanticTypeStatus
  engine: string
  version: string
  generation: number
}

export interface SemanticCodeFixCandidate {
  title: string
  kind: "quickfix"
  diagnostic: SemanticDiagnostic
  fingerprint: string
}

export interface SemanticResolvedCodeFix extends SemanticCodeFixCandidate {
  edits: Array<{
    path: string
    range: SemanticTextRange
    newText: string
    expectedVersion: number
  }>
}

export type SemanticGlobalQueryFailureReason =
  | "project-membership-incomplete"
  | "source-outside-workspace"
  | "source-unavailable"
  | "source-unmappable"

export type SemanticReferenceQueryResult =
  | { status: "complete"; references: SemanticDefinitionCandidate[] }
  | { status: "incomplete"; reason: SemanticGlobalQueryFailureReason }

export type SemanticPrepareRenameQueryResult =
  | { status: "ready"; range: SemanticTextRange; placeholder: string }
  | { status: "unavailable" }
  | { status: "incomplete"; reason: SemanticGlobalQueryFailureReason }

export type SemanticRenameQueryResult =
  | {
      status: "complete"
      edits: Array<{
        path: string
        range: SemanticTextRange
        newText: string
        expectedVersion: number | null
      }>
    }
  | { status: "invalid-name" }
  | { status: "unavailable" }
  | { status: "incomplete"; reason: SemanticGlobalQueryFailureReason }

export type SemanticSignatureHelpTriggerReason =
  | { kind: "invoked" }
  | { kind: "characterTyped"; triggerCharacter: "(" | "," | "<" }
  | { kind: "retrigger"; triggerCharacter?: "(" | "," | "<" | ")" }

export interface SemanticTypeQueryContext {
  state: SemanticTypeEngineState
  complete(position: SemanticDocumentPosition): SemanticCompletionItem[]
  resolveCompletion(position: SemanticDocumentPosition, item: SemanticCompletionItem): SemanticCompletionItem
  define(position: SemanticDocumentPosition): SemanticDefinitionCandidate[]
  references(
    position: SemanticDocumentPosition,
    includeDeclaration: boolean,
  ): SemanticReferenceQueryResult
  prepareRename(position: SemanticDocumentPosition): SemanticPrepareRenameQueryResult
  rename(position: SemanticDocumentPosition, newName: string): SemanticRenameQueryResult
  usages(position: SemanticDocumentPosition): SemanticUsageResult[]
  diagnostics(position: SemanticDocumentPosition): SemanticDiagnostic[]
  codeActions(
    position: SemanticDocumentPosition,
    range: SemanticTextRange,
  ): SemanticCodeFixCandidate[]
  resolveCodeAction(
    position: SemanticDocumentPosition,
    range: SemanticTextRange,
    fingerprint: string,
  ): SemanticResolvedCodeFix | null
  documentSymbols(position: SemanticDocumentPosition): SemanticDocumentSymbolInfo[]
  hover(position: SemanticDocumentPosition): SemanticHoverInfo | null
  signatureHelp(
    position: SemanticDocumentPosition,
    triggerReason: SemanticSignatureHelpTriggerReason,
  ): SemanticSignatureHelp | null
}

interface WorkspaceEngineEntry {
  engine: TypeScriptLanguageServiceEngine
  lastAccess: number
}

export class SemanticTypeEngineRegistry {
  private readonly workspaces = new Map<string, WorkspaceEngineEntry>()
  private accessClock = 0

  prepare(workspace: SemanticWorkspaceView): SemanticTypeQueryContext {
    if (workspace.resetTypeEngine) {
      this.workspaces.get(workspace.rootPath)?.engine.dispose()
      this.workspaces.delete(workspace.rootPath)
    }
    let entry = this.workspaces.get(workspace.rootPath)
    if (!entry) {
      entry = {
        engine: new TypeScriptLanguageServiceEngine(workspace.rootPath),
        lastAccess: 0,
      }
      this.workspaces.set(workspace.rootPath, entry)
    }
    entry.lastAccess = ++this.accessClock
    const state = entry.engine.prepare(workspace)
    this.evict(workspace.rootPath)
    return {
      state,
      complete: (position) => entry.engine.complete(position),
      resolveCompletion: (position, item) => entry.engine.resolveCompletion(position, item),
      define: (position) => entry.engine.define(position),
      references: (position, includeDeclaration) => (
        entry.engine.references(position, includeDeclaration)
      ),
      prepareRename: (position) => entry.engine.prepareRename(position),
      usages: (position) => entry.engine.usages(position),
      diagnostics: (position) => entry.engine.diagnostics(position),
      codeActions: (position, range) => entry.engine.codeActions(position, range),
      resolveCodeAction: (position, range, fingerprint) => (
        entry.engine.resolveCodeAction(position, range, fingerprint)
      ),
      documentSymbols: (position) => entry.engine.documentSymbols(position),
      hover: (position) => entry.engine.hover(position),
      rename: (position, newName) => entry.engine.rename(position, newName),
      signatureHelp: (position, triggerReason) => entry.engine.signatureHelp(position, triggerReason),
    }
  }

  workspaceCount(): number {
    return this.workspaces.size
  }

  dispose(): void {
    for (const entry of this.workspaces.values()) entry.engine.dispose()
    this.workspaces.clear()
  }

  private evict(activeRoot: string): void {
    while (this.workspaces.size > MAX_WORKSPACE_ENGINES) {
      const candidate = [...this.workspaces.entries()]
        .filter(([root]) => root !== activeRoot)
        .sort((left, right) => left[1].lastAccess - right[1].lastAccess)[0]
      if (!candidate) return
      candidate[1].engine.dispose()
      this.workspaces.delete(candidate[0])
    }
  }
}
