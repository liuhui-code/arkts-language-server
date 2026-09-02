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
  diagnose(query: SemanticDocumentQuery): Promise<VersionedSemanticResult<SemanticDiagnostic[]>>
  hover(query: SemanticQuery): Promise<VersionedSemanticResult<SemanticHover | null>>
  signatureHelp(query: SemanticQuery): Promise<VersionedSemanticResult<SemanticSignatureHelp | null>>
  dispose(): void
}
