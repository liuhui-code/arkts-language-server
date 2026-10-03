import type {
  SemanticCallHierarchyItemInfo,
  SemanticCallHierarchyIncomingQueryResult,
  SemanticCallHierarchyOutgoingQueryResult,
  SemanticCallHierarchyPrepareQueryResult,
  SemanticCompletionItem,
  SemanticCompletionItemList,
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
  | {
      status: "complete"
      references: SemanticDefinitionCandidate[]
      /** Internal, operation-scoped proof from one completed compiler search. */
      searchedProjectPaths?: readonly string[]
      /** Unique raw compiler constructor definition from that same search. */
      constructorTarget?: { readonly path: string; readonly start: number; readonly length: number }
      /** Negative source evidence; never represents a compiler-searched file. */
      constructorExcludedSources?: readonly { readonly path: string; readonly token: string }[]
    }
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

export interface SemanticCompletionTraceContext {
  readonly completionBatchIndex: number
  readonly completionBatchCount: number
  readonly discoveryRootCount: number
  readonly discoveryCandidateCount: number
  readonly discoveryRootFingerprints: string
}

export interface SemanticTypeQueryContext {
  state: SemanticTypeEngineState
  complete(
    position: SemanticDocumentPosition,
    traceContext?: SemanticCompletionTraceContext,
  ): SemanticCompletionItemList
  trimCompletion(traceContext: SemanticCompletionTraceContext): void
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
  prepareCallHierarchy(position: SemanticDocumentPosition): SemanticCallHierarchyPrepareQueryResult
  outgoingCalls(
    position: SemanticDocumentPosition,
    item: SemanticCallHierarchyItemInfo,
  ): SemanticCallHierarchyOutgoingQueryResult
  incomingCalls(
    position: SemanticDocumentPosition,
    item: SemanticCallHierarchyItemInfo,
  ): SemanticCallHierarchyIncomingQueryResult
  documentSymbols(position: SemanticDocumentPosition): SemanticDocumentSymbolInfo[]
  hover(position: SemanticDocumentPosition): SemanticHoverInfo | null
  signatureHelp(
    position: SemanticDocumentPosition,
    triggerReason: SemanticSignatureHelpTriggerReason,
  ): SemanticSignatureHelp | null
}
