import type {
  DocumentSnapshot,
  DocumentUri,
  TextPosition,
  TextRange,
  WorkspaceDescriptor,
  WorkspaceId,
} from "./document.js"

export type WorkspaceIndexState = "warming" | "ready" | "degraded"
export type WorkspaceIndexCompleteness = "ready" | "partial" | "stale"

export interface WorkspaceIndexStatus {
  state: WorkspaceIndexState
  committedGeneration: number
  message?: string
}

export interface WorkspaceSymbol {
  name: string
  kind: string
  uri: DocumentUri
  range: TextRange
  containerName?: string
}

export interface WorkspaceSymbolSearchResult {
  items: WorkspaceSymbol[]
  servedGeneration: number
  completeness: WorkspaceIndexCompleteness
}

export interface WorkspaceExportCandidate {
  exportedName: string
  kind: string
  uri: DocumentUri
  range: TextRange
  ordinal: number
  declarationIdentity?: string
  importSpecifier?: string
  moduleId?: string
  targetScope?: string
}

export interface WorkspaceExportSearchResult {
  items: WorkspaceExportCandidate[]
  servedGeneration: number
  completeness: WorkspaceIndexCompleteness
}

export interface WorkspaceExportIndexPort {
  searchExports(
    workspaceId: WorkspaceId,
    query: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<WorkspaceExportSearchResult>
}

export interface WorkspaceReferenceCandidateResult {
  supported: boolean
  complete: boolean
  declarationIdentity?: string
  names: string[]
  uris: DocumentUri[]
  bindings?: WorkspaceReferenceBinding[]
  servedGeneration: number
  completeness: WorkspaceIndexCompleteness
}

export interface WorkspaceReferenceBinding {
  kind: "import" | "reexport"
  uri: DocumentUri
  importedName: string
  localName: string
  sourceSpecifier: string
  sourceResolution: "unique" | "unresolved" | "ambiguous" | "unsupported"
  resolvedSourceUri?: DocumentUri
}

export interface WorkspaceReferenceIndexPort {
  searchReferenceCandidates(
    workspaceId: WorkspaceId,
    declarationUri: DocumentUri,
    declarationPosition: TextPosition,
    limit: number,
    signal?: AbortSignal,
  ): Promise<WorkspaceReferenceCandidateResult>
  status(workspaceId: WorkspaceId): Promise<WorkspaceIndexStatus>
}

export interface WorkspaceIndexPort {
  open(workspace: WorkspaceDescriptor, cacheDir: string): Promise<WorkspaceIndexStatus>
  refresh(
    workspaceId: WorkspaceId,
    generation: number,
    changed: readonly DocumentSnapshot[],
    removedUris: readonly DocumentUri[],
    signal?: AbortSignal,
  ): Promise<WorkspaceIndexStatus>
  searchSymbols(
    workspaceId: WorkspaceId,
    query: string,
    limit: number,
    signal?: AbortSignal,
    excludedUris?: readonly DocumentUri[],
  ): Promise<WorkspaceSymbolSearchResult>
  status(workspaceId: WorkspaceId): Promise<WorkspaceIndexStatus>
  close(workspaceId: WorkspaceId): Promise<void>
}
