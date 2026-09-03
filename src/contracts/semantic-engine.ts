import type {
  DocumentSnapshot,
  DocumentUri,
  TextPosition,
  TextRange,
} from "./document.js"

export type SemanticCompletionKind =
  | "method"
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
  insertText?: string
  filterText?: string
  sortText?: string
  replacementRange?: TextRange
  data?: Record<string, unknown>
}

export interface SemanticDefinition {
  uri: DocumentUri
  range: TextRange
}

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
  message: string
  source: "arkts"
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

export interface VersionedSemanticResult<T> {
  documentVersion: number
  value: T
}

export interface SemanticEnginePort {
  sync(document: DocumentSnapshot): void
  close(documentUri: DocumentUri): void
  complete(query: SemanticQuery): Promise<VersionedSemanticResult<SemanticCompletion[]>>
  define(query: SemanticQuery): Promise<VersionedSemanticResult<SemanticDefinition[]>>
  documentSymbols(query: SemanticDocumentQuery): Promise<VersionedSemanticResult<SemanticDocumentSymbol[]>>
  diagnose(query: SemanticDocumentQuery): Promise<VersionedSemanticResult<SemanticDiagnostic[]>>
  hover(query: SemanticQuery): Promise<VersionedSemanticResult<SemanticHover | null>>
  signatureHelp(query: SemanticQuery): Promise<VersionedSemanticResult<SemanticSignatureHelp | null>>
  dispose(): void
}
