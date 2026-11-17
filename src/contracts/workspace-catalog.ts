import type { WorkspaceDescriptor } from "./document.js"
import type { WorkspaceIndexProgress } from "./workspace-symbol-service.js"
import type { SemanticWorkspaceFileChangeBatch } from "./semantic-engine.js"

export interface WorkspaceCatalogPort {
  observe?(workspaceId: string, batch: SemanticWorkspaceFileChangeBatch): void
  start(
    workspace: WorkspaceDescriptor,
    report: (progress: WorkspaceIndexProgress) => void,
    signal?: AbortSignal,
  ): Promise<void>
}
