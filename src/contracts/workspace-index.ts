import type {
  DocumentSnapshot,
  DocumentUri,
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
  ): Promise<WorkspaceSymbolSearchResult>
  status(workspaceId: WorkspaceId): Promise<WorkspaceIndexStatus>
  close(workspaceId: WorkspaceId): Promise<void>
}
