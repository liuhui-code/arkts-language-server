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
  dispose(): void
}
