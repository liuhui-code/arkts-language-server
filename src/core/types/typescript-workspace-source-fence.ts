import type { ProjectFileAccessPort, SemanticWorkspaceView } from "../workspace/document-store.js"
import { createHash } from "node:crypto"
import { readDiskSource } from "../workspace/workspace-disk-source.js"
import { canonicalSourcePath } from "../workspace/physical-path-identity.js"
import { validateRequestInput } from "../../project/request-input-validation.js"
import { SemanticInputUnavailableError } from "./typescript-query-inputs.js"

/** Recheck this request's bounded, store-admitted raw disk snapshots before publication. */
export function assertCurrentWorkspaceSources(workspace: SemanticWorkspaceView, checkpoint: () => void,
  access?: ProjectFileAccessPort): void {
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
  for (const input of workspace.changedDiskInputs ?? []) {
    const validate = () => {
      checkpoint()
      if (!access || !workspace.projectMembership || canonicalSourcePath(input.path) !== input.physicalPath) return false
      const content = access.read(workspace.canonicalRootId, workspace.projectMembership.revision, input.path, input.token)
      checkpoint()
      return content !== null && createHash("sha256").update(content).digest("hex") === input.sourceSha256
    }
    if (!validateRequestInput(input, 0, 0, validate)) throw new SemanticInputUnavailableError()
  }
  checkpoint()
}
