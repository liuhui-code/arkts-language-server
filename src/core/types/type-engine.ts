import path from "node:path"

import type {
  SemanticCompletionItem,
  SemanticDefinitionCandidate,
  SemanticDiagnostic,
  SemanticDocumentHighlight,
  SemanticDocumentPosition,
  SemanticDocumentSymbolInfo,
  SemanticHoverInfo,
  SemanticInlayHint,
  SemanticSignatureHelp,
  SemanticTextRange,
  SemanticUsageResult,
  SemanticNumericDiagnostic,
} from "../protocol.js"
import { ArkUIResourceLanguageProvider } from "../arkui/resource-language-provider.js"
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
  diagnostic: SemanticNumericDiagnostic
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
  typeDefinitions(position: SemanticDocumentPosition): SemanticDefinitionCandidate[]
  implementations(position: SemanticDocumentPosition): SemanticDefinitionCandidate[]
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
  documentHighlights(position: SemanticDocumentPosition): SemanticDocumentHighlight[]
  inlayHints(
    position: SemanticDocumentPosition,
    range: SemanticTextRange,
  ): SemanticInlayHint[]
  documentSymbols(position: SemanticDocumentPosition): SemanticDocumentSymbolInfo[]
  hover(position: SemanticDocumentPosition): SemanticHoverInfo | null
  signatureHelp(
    position: SemanticDocumentPosition,
    triggerReason: SemanticSignatureHelpTriggerReason,
  ): SemanticSignatureHelp | null
}

interface WorkspaceEngineEntry {
  engine: TypeScriptLanguageServiceEngine
  arkui: ArkUIResourceLanguageProvider
  lastAccess: number
}

export class SemanticTypeEngineRegistry {
  private readonly workspaces = new Map<string, WorkspaceEngineEntry>()
  private accessClock = 0

  prepare(workspace: SemanticWorkspaceView): SemanticTypeQueryContext {
    const rootPath = path.resolve(workspace.rootPath)
    if (workspace.resetTypeEngine) {
      this.workspaces.get(rootPath)?.engine.dispose()
      this.workspaces.get(rootPath)?.arkui.dispose()
      this.workspaces.delete(rootPath)
    }
    let entry = this.workspaces.get(rootPath)
    if (!entry) {
      entry = {
        engine: new TypeScriptLanguageServiceEngine(rootPath),
        arkui: new ArkUIResourceLanguageProvider(rootPath),
        lastAccess: 0,
      }
      this.workspaces.set(rootPath, entry)
    }
    entry.lastAccess = ++this.accessClock
    const state = entry.engine.prepare(workspace)
    const sourceContent = workspace.documents.find((document) => (
      document.path === workspace.state.path
    ))?.content
    this.evict(rootPath)
    return {
      state,
      complete: (position) => mergeCompletions(
        sourceContent ? entry.arkui.complete(position, sourceContent) : [],
        entry.engine.complete(position),
      ),
      resolveCompletion: (position, item) => item.data?.provider === "arkui-resource"
        ? item
        : entry.engine.resolveCompletion(position, item),
      define: (position) => mergeDefinitions(
        sourceContent ? entry.arkui.define(position, sourceContent) : [],
        entry.engine.define(position),
      ),
      typeDefinitions: (position) => entry.engine.typeDefinitions(position),
      implementations: (position) => entry.engine.implementations(position),
      references: (position, includeDeclaration) => (
        entry.engine.references(position, includeDeclaration)
      ),
      prepareRename: (position) => entry.engine.prepareRename(position),
      usages: (position) => entry.engine.usages(position),
      diagnostics: (position) => mergeDiagnostics(
        entry.engine.diagnostics(position),
        sourceContent ? entry.arkui.diagnostics(position, sourceContent) : [],
      ),
      codeActions: (position, range) => entry.engine.codeActions(position, range),
      resolveCodeAction: (position, range, fingerprint) => (
        entry.engine.resolveCodeAction(position, range, fingerprint)
      ),
      documentHighlights: (position) => entry.engine.documentHighlights(position),
      inlayHints: (position, range) => entry.engine.inlayHints(position, range),
      documentSymbols: (position) => entry.engine.documentSymbols(position),
      hover: (position) => entry.engine.hover(position),
      rename: (position, newName) => entry.engine.rename(position, newName),
      signatureHelp: (position, triggerReason) => entry.engine.signatureHelp(position, triggerReason),
    }
  }

  workspaceCount(): number {
    return this.workspaces.size
  }

  invalidateArkUIResources(rootPath: string): void {
    this.workspaces.get(path.resolve(rootPath))?.arkui.invalidate()
  }

  dispose(): void {
    for (const entry of this.workspaces.values()) {
      entry.engine.dispose()
      entry.arkui.dispose()
    }
    this.workspaces.clear()
  }

  private evict(activeRoot: string): void {
    while (this.workspaces.size > MAX_WORKSPACE_ENGINES) {
      const candidate = [...this.workspaces.entries()]
        .filter(([root]) => root !== activeRoot)
        .sort((left, right) => left[1].lastAccess - right[1].lastAccess)[0]
      if (!candidate) return
      candidate[1].engine.dispose()
      candidate[1].arkui.dispose()
      this.workspaces.delete(candidate[0])
    }
  }
}

function mergeCompletions(
  arkui: SemanticCompletionItem[],
  typescript: SemanticCompletionItem[],
): SemanticCompletionItem[] {
  if (arkui.length === 0) return typescript
  const arkuiLabels = new Set(arkui.map(({ label }) => label))
  return [...arkui, ...typescript.filter(({ label }) => !arkuiLabels.has(label))]
}

function mergeDefinitions(
  arkui: SemanticDefinitionCandidate[],
  typescript: SemanticDefinitionCandidate[],
): SemanticDefinitionCandidate[] {
  const result: SemanticDefinitionCandidate[] = []
  const seen = new Set<string>()
  for (const definition of [...arkui, ...typescript]) {
    const key = [
      definition.path,
      definition.range.startLine,
      definition.range.startColumn,
      definition.range.endLine,
      definition.range.endColumn,
    ].join(":")
    if (seen.has(key)) continue
    seen.add(key)
    result.push(definition)
  }
  return result
}

function mergeDiagnostics(
  typescript: SemanticDiagnostic[],
  arkui: SemanticDiagnostic[],
): SemanticDiagnostic[] {
  if (arkui.length === 0) return typescript
  if (typescript.length === 0) return arkui
  const result: SemanticDiagnostic[] = []
  const seen = new Set<string>()
  for (const diagnostic of [...typescript, ...arkui]) {
    const key = JSON.stringify([
      diagnostic.path,
      diagnostic.range.startLine,
      diagnostic.range.startColumn,
      diagnostic.range.endLine,
      diagnostic.range.endColumn,
      diagnostic.code,
      diagnostic.severity,
      diagnostic.message,
    ])
    if (seen.has(key)) continue
    seen.add(key)
    result.push(diagnostic)
  }
  return result.sort((left, right) => (
    ordinalCompare(left.path, right.path)
    || left.range.startLine - right.range.startLine
    || left.range.startColumn - right.range.startColumn
    || left.range.endLine - right.range.endLine
    || left.range.endColumn - right.range.endColumn
    || ordinalCompare(String(left.code), String(right.code))
    || ordinalCompare(left.message, right.message)
  ))
}

function ordinalCompare(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
