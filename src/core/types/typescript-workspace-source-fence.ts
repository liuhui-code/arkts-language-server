import type { SemanticWorkspaceView } from "../workspace/document-store.js"
import { readDiskSource } from "../workspace/workspace-disk-source.js"
import { SemanticInputUnavailableError } from "./typescript-query-inputs.js"

/** Recheck this request's bounded, store-admitted raw disk snapshots before publication. */
export function assertCurrentWorkspaceSources(workspace: SemanticWorkspaceView, checkpoint: () => void): void {
  const operation = { checkpoint }
  for (const document of workspace.documents) {
    checkpoint()
    // The store and the parent request own overlay authority; disk cannot override it.
    if (document.overlay) continue
    const current = readDiskSource(document.path, Buffer.byteLength(document.content), operation)
    if (current.status !== "loaded" || current.content !== document.content) {
      throw new SemanticInputUnavailableError()
    }
  }
  checkpoint()
}
