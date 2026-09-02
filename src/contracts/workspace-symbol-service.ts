import type { DocumentSnapshot, DocumentUri, WorkspaceDescriptor } from "./document.js"
import type { WorkspaceSymbolSearchResult } from "./workspace-index.js"

export interface WorkspaceSymbolServicePort {
  start(workspaces: readonly WorkspaceDescriptor[]): void
  sync(document: DocumentSnapshot): void
  closeDocument(documentUri: DocumentUri): void
  searchSymbols(
    query: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<WorkspaceSymbolSearchResult>
  dispose(): void
}
