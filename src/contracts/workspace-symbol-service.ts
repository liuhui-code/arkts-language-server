import type { DocumentSnapshot, DocumentUri, WorkspaceDescriptor } from "./document.js"
import type { WorkspaceSymbolSearchResult } from "./workspace-index.js"

export type WorkspaceIndexPhase =
  | "discovering"
  | "indexing"
  | "ready"
  | "degraded"
  | "cancelled"

export interface WorkspaceIndexProgress {
  phase: WorkspaceIndexPhase
  discoveredFiles: number
  indexedFiles: number
  skippedEntries: number
  totalFiles?: number
}

export interface WorkspaceSymbolServicePort {
  start(
    workspaces: readonly WorkspaceDescriptor[],
    report: (progress: WorkspaceIndexProgress) => void,
    signal?: AbortSignal,
  ): void
  sync(document: DocumentSnapshot): void
  closeDocument(documentUri: DocumentUri): void
  searchSymbols(
    query: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<WorkspaceSymbolSearchResult>
  dispose(): void
}
