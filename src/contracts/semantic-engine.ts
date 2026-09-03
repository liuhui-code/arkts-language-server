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
  | "interface"
  | "keyword"
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
  replacementRange?: TextRange
  additionalTextEdits?: SemanticCompletionTextEdit[]
  data?: Record<string, unknown>
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
  code: number
  message: string
  source: "arkts"
}

export interface SemanticCodeAction {
  title: string
  kind: "quickfix"
  diagnostic: SemanticDiagnostic
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
  changes: Array<{
    uri: DocumentUri
    kind: "created" | "changed" | "deleted"
  }>
}

export interface SemanticEnginePort {
  sync(document: DocumentSnapshot): void
  close(documentUri: DocumentUri): void
  workspaceFilesChanged?(batches: readonly SemanticWorkspaceFileChangeBatch[]): void
  complete(query: SemanticQuery): Promise<VersionedSemanticResult<SemanticCompletion[]>>
  resolveCompletion(
    query: SemanticCompletionResolveQuery,
  ): Promise<VersionedSemanticResult<SemanticCompletion>>
  define(query: SemanticQuery): Promise<VersionedSemanticResult<SemanticDefinition[]>>
  references(
    query: SemanticReferencesQuery,
  ): Promise<VersionedSemanticResult<SemanticReferencesOutcome>>
  prepareRename(
    query: SemanticQuery,
  ): Promise<VersionedSemanticResult<SemanticPrepareRenameOutcome>>
  rename(query: SemanticRenameQuery): Promise<VersionedSemanticResult<SemanticRenameOutcome>>
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
  dispose(): void
}
