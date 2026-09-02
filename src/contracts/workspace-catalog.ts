import type { WorkspaceDescriptor } from "./document.js"
import type { WorkspaceIndexProgress } from "./workspace-symbol-service.js"

export interface WorkspaceCatalogPort {
  start(
    workspace: WorkspaceDescriptor,
    report: (progress: WorkspaceIndexProgress) => void,
    signal?: AbortSignal,
  ): Promise<void>
}
