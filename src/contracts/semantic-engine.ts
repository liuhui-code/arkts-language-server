import type {
  DocumentSnapshot,
  DocumentUri,
  TextPosition,
  TextRange,
} from "./document.js"

export type SemanticCompletionKind =
  | "method"
  | "field"
  | "function"
  | "class"
  | "enum"
  | "enumMember"
  | "interface"
  | "keyword"
  | "module"
  | "variable"
  | "property"

export interface SemanticCompletion {
  label: string
  detail: string
  kind: SemanticCompletionKind
  documentation?: string
  insertText?: string
  filterText?: string
  sortText?: string
  commitCharacters?: string[]
  isSnippet?: true
  replacementRange?: TextRange
  additionalTextEdits?: SemanticCompletionTextEdit[]
  data?: Record<string, unknown>
}

export interface SemanticCompletionList {
  items: SemanticCompletion[]
  isIncomplete: boolean
}

export interface SemanticCompletionDiscoveryCandidate {
  exportedName: string
  kind: string
  uri: DocumentUri
  ordinal: number
  declarationIdentity?: string
  importSpecifier?: string
  moduleId?: string
  targetScope?: string
}

export interface SemanticCompletionDiscovery {
  candidates: readonly SemanticCompletionDiscoveryCandidate[]
  incomplete: boolean
}

export interface SemanticCompletionTextEdit {
  uri: DocumentUri
  range: TextRange
  newText: string
  expectedVersion: number
}

export interface SemanticDefinition {
  uri: DocumentUri
  range: TextRange
}

export interface SemanticReference {
  uri: DocumentUri
  range: TextRange
}

export type SemanticGlobalQueryFailureReason =
  | "project-membership-incomplete"
  | "source-outside-workspace"
  | "source-unavailable"
  | "source-unmappable"

export type SemanticReferencesOutcome =
  | { status: "complete"; references: SemanticReference[] }
  | { status: "incomplete"; reason: SemanticGlobalQueryFailureReason }

export type SemanticPrepareRenameOutcome =
  | { status: "ready"; range: TextRange; placeholder: string }
  | { status: "unavailable" }
  | { status: "incomplete"; reason: SemanticGlobalQueryFailureReason }

export interface SemanticRenameTextEdit {
  uri: DocumentUri
  range: TextRange
  newText: string
  expectedVersion: number | null
}

export type SemanticRenameOutcome =
  | { status: "complete"; edits: SemanticRenameTextEdit[] }
  | { status: "invalid-name" }
  | { status: "unavailable" }
  | { status: "incomplete"; reason: SemanticGlobalQueryFailureReason }

export interface SemanticSignatureParameter {
  label: string
  documentation?: string
}

export interface SemanticSignature {
  label: string
  documentation?: string
  parameters: SemanticSignatureParameter[]
}

export interface SemanticSignatureHelp {
  signatures: SemanticSignature[]
  activeSignature: number
  activeParameter: number
}

export type SemanticSignatureHelpTriggerReason =
  | { kind: "invoked" }
  | { kind: "characterTyped"; triggerCharacter: "(" | "," | "<" }
  | { kind: "retrigger"; triggerCharacter?: "(" | "," | "<" | ")" }

export interface SemanticHover {
  signature: string
  documentation?: string
  range: TextRange
}

export type SemanticDocumentHighlightKind = "text" | "read" | "write"

export interface SemanticDocumentHighlight {
  range: TextRange
  kind: SemanticDocumentHighlightKind
}

export type SemanticInlayHintKind = "type" | "parameter"

export interface SemanticInlayHint {
  position: TextPosition
  label: string
  kind: SemanticInlayHintKind
  paddingLeft?: boolean
  paddingRight?: boolean
}

export type SemanticCallHierarchyItemKind =
  | "file"
  | "module"
  | "struct"
  | "class"
  | "interface"
  | "function"
  | "method"
  | "property"
  | "constructor"
  | "variable"
  | "constant"

export interface SemanticCallHierarchyItem {
  uri: DocumentUri
  name: string
  kind: SemanticCallHierarchyItemKind
  /** Internal proof of the exact source bytes used to produce this item. Never serialized to LSP. */
  sourceFingerprint?: string
  detail?: string
  range: TextRange
  selectionRange: TextRange
}

export interface SemanticCallHierarchyOutgoingCall {
  to: SemanticCallHierarchyItem
  fromRanges: TextRange[]
}

export interface SemanticCallHierarchyIncomingCall {
  from: SemanticCallHierarchyItem
  fromRanges: TextRange[]
}

export type SemanticCallHierarchyFailureReason =
  | "project-membership-incomplete"
  | "source-outside-workspace"
  | "source-unavailable"
  | "source-unmappable"
  | "result-limit-exceeded"

export type SemanticCallHierarchyPrepareOutcome =
  | { status: "complete"; items: SemanticCallHierarchyItem[] }
  | { status: "incomplete"; reason: SemanticCallHierarchyFailureReason }

export type SemanticCallHierarchyOutgoingOutcome =
  | { status: "complete"; calls: SemanticCallHierarchyOutgoingCall[] }
  | { status: "stale-item" }
  | { status: "incomplete"; reason: SemanticCallHierarchyFailureReason }

export type SemanticCallHierarchyIncomingOutcome =
  | { status: "complete"; calls: SemanticCallHierarchyIncomingCall[] }
  | { status: "stale-item" }
  | { status: "incomplete"; reason: SemanticCallHierarchyFailureReason }

export type SemanticCallHierarchySource =
  | {
      kind: "open"
      document: DocumentSnapshot
      workspaceRootUri: DocumentUri
    }
  | {
      kind: "disk"
      uri: DocumentUri
      text: string
      workspaceId: string
      workspaceRootUri: DocumentUri
    }

export type SemanticFoldingRangeKind = "comment" | "imports" | "region"

export interface SemanticFoldingRange {
  startLine: number
  startCharacter?: number
  endLine: number
  endCharacter?: number
  kind?: SemanticFoldingRangeKind
}

export interface SemanticFoldingRangeQuery extends SemanticDocumentQuery {
  lineFoldingOnly?: boolean
  rangeLimit?: number
}

export interface SemanticDocumentFormattingOptions {
  tabSize: number
  insertSpaces: boolean
  trimTrailingWhitespace?: boolean
  insertFinalNewline?: boolean
  trimFinalNewlines?: boolean
}

export interface SemanticDocumentFormattingQuery extends SemanticDocumentQuery {
  options: SemanticDocumentFormattingOptions
}

export interface SemanticDocumentTextEdit {
  range: TextRange
  newText: string
}

export type SemanticDocumentSymbolKind =
  | "struct"
  | "class"
  | "interface"
  | "enum"
  | "enumMember"
  | "function"
  | "method"
  | "property"
  | "constructor"
  | "module"
  | "type"
  | "variable"

export interface SemanticDocumentSymbol {
  name: string
  detail?: string
  kind: SemanticDocumentSymbolKind
  range: TextRange
  selectionRange: TextRange
  children?: SemanticDocumentSymbol[]
}

export interface SemanticDiagnostic {
  range: TextRange
  severity: "error" | "warning"
  code: number | string
  message: string
  source: "arkts"
}

export interface SemanticNumericDiagnostic extends SemanticDiagnostic {
  code: number
}

export interface SemanticCodeAction {
  title: string
  kind: "quickfix"
  diagnostic: SemanticNumericDiagnostic
  fingerprint: string
}

export interface SemanticCodeActionTextEdit {
  uri: DocumentUri
  range: TextRange
  newText: string
  expectedVersion: number
}

export interface SemanticResolvedCodeAction extends SemanticCodeAction {
  edits: SemanticCodeActionTextEdit[]
}

export interface SemanticDocumentQuery {
  document: DocumentSnapshot
  signal?: AbortSignal
}

export interface SemanticQuery {
  document: DocumentSnapshot
  position: TextPosition
  completionOptions?: { snippets?: boolean }
  completionDiscovery?: SemanticCompletionDiscovery
  signal?: AbortSignal
}

export interface SemanticCompletionResolveQuery extends SemanticQuery {
  completion: SemanticCompletion
}

export interface SemanticReferencesQuery extends SemanticQuery {
  includeDeclaration: boolean
}

export interface SemanticRenameQuery extends SemanticQuery {
  newName: string
}

export interface SemanticSignatureHelpQuery extends SemanticQuery {
  triggerReason: SemanticSignatureHelpTriggerReason
}

export interface SemanticCodeActionQuery extends SemanticDocumentQuery {
  range: TextRange
}

export interface SemanticInlayHintQuery extends SemanticDocumentQuery {
  range: TextRange
}

export interface SemanticCallHierarchyItemQuery {
  source: SemanticCallHierarchySource
  item: SemanticCallHierarchyItem
  signal?: AbortSignal
}

export interface SemanticCodeActionResolveQuery extends SemanticDocumentQuery {
  action: SemanticCodeAction
}

export interface VersionedSemanticResult<T> {
  documentVersion: number
  value: T
}

export interface SemanticWorkspaceFileChangeBatch {
  rootUri: DocumentUri
  rootDirty: boolean
  resourceDirty?: boolean
  resourceChanged?: boolean
  changes: Array<{
    uri: DocumentUri
    kind: "created" | "changed" | "deleted"
  }>
}

export interface SemanticEnginePort {
  configureProject?(selection: unknown): void
  configureSdk?(selection: unknown): void
  isResourceFile?(rootUri: string, fileUri: string): boolean
  sync(document: DocumentSnapshot): void
  close(documentUri: DocumentUri): void
  workspaceFilesChanged?(batches: readonly SemanticWorkspaceFileChangeBatch[]): void
  complete(query: SemanticQuery): Promise<VersionedSemanticResult<SemanticCompletionList>>
  resolveCompletion(
    query: SemanticCompletionResolveQuery,
  ): Promise<VersionedSemanticResult<SemanticCompletion>>
  define(query: SemanticQuery): Promise<VersionedSemanticResult<SemanticDefinition[]>>
  typeDefinitions(query: SemanticQuery): Promise<VersionedSemanticResult<SemanticDefinition[]>>
  implementations(query: SemanticQuery): Promise<VersionedSemanticResult<SemanticDefinition[]>>
  references(
    query: SemanticReferencesQuery,
  ): Promise<VersionedSemanticResult<SemanticReferencesOutcome>>
  prepareRename(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticPrepareRenameOutcome>>
  rename(query: SemanticRenameQuery): Promise<VersionedSemanticResult<SemanticRenameOutcome>>
  documentHighlights(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticDocumentHighlight[]>>
  inlayHints(
    query: SemanticInlayHintQuery,
  ): Promise<VersionedSemanticResult<SemanticInlayHint[]>>
  prepareCallHierarchy(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticCallHierarchyPrepareOutcome>>
  outgoingCalls(
    query: SemanticCallHierarchyItemQuery,
  ): Promise<SemanticCallHierarchyOutgoingOutcome>
  incomingCalls(
    query: SemanticCallHierarchyItemQuery,
  ): Promise<SemanticCallHierarchyIncomingOutcome>
  foldingRanges(
    query: SemanticFoldingRangeQuery,
  ): Promise<VersionedSemanticResult<SemanticFoldingRange[]>>
  formatDocument(
    query: SemanticDocumentFormattingQuery,
  ): Promise<VersionedSemanticResult<SemanticDocumentTextEdit[]>>
  documentSymbols(query: SemanticDocumentQuery): Promise<VersionedSemanticResult<SemanticDocumentSymbol[]>>
  diagnose(query: SemanticDocumentQuery): Promise<VersionedSemanticResult<SemanticDiagnostic[]>>
  codeActions(query: SemanticCodeActionQuery): Promise<VersionedSemanticResult<SemanticCodeAction[]>>
  resolveCodeAction(
    query: SemanticCodeActionResolveQuery,
  ): Promise<VersionedSemanticResult<SemanticResolvedCodeAction | null>>
  hover(query: SemanticQuery): Promise<VersionedSemanticResult<SemanticHover | null>>
  signatureHelp(
    query: SemanticSignatureHelpQuery,
  ): Promise<VersionedSemanticResult<SemanticSignatureHelp | null>>
  dispose(): void | Promise<void>
}
