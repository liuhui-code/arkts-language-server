import path from "node:path"
import type { SemanticWorkspaceView } from "../workspace/document-store.js"
import type { SemanticCoordinator, SemanticMemoryLevel } from "../../semantic/coordinator/semantic-coordinator.js"
import type { WorkspaceEngineEntry } from "./type-workspace-entry.js"
import type { TypeScriptLanguageServiceEngine } from "./typescript-language-service.js"

export function retainedReferenceOwnerAllowed(options: {
  readonly references?: { readonly residentFastPath?: boolean; readonly sdkAmbientProfile: string }
  readonly interactiveSdkAmbientProfile?: string
}, memoryLevel: SemanticMemoryLevel): boolean {
  return options.references?.residentFastPath === true && memoryLevel !== "level2" && memoryLevel !== "level3"
    && (options.interactiveSdkAmbientProfile ?? "full") === options.references.sdkAmbientProfile
}

/** A proof-only query never prepares implicitly; recovery goes through the normal full-scope prepare. */
export function withResidentReferenceContext<Result>(workspace: SemanticWorkspaceView,
  coordinator: SemanticCoordinator<WorkspaceEngineEntry>, allowed: boolean, checkpoint: (() => void) | undefined,
  query: (engine: TypeScriptLanguageServiceEngine) => Result | undefined,
  onSuccess: (entry: WorkspaceEngineEntry) => void): Result | undefined {
  if (!allowed || workspace.resetTypeEngine) return undefined
  const rootPath = path.resolve(workspace.rootPath)
  const entry = coordinator.peek(rootPath)
  if (!entry || entry.ownerId !== (workspace.canonicalRootId ?? rootPath)
    || entry.resetEpoch !== workspace.typeEngineResetEpoch
    || entry.appliedContentRevision !== workspace.contentRevision) return undefined
  checkpoint?.()
  const lease = coordinator.acquire(rootPath)
  try {
    const result = query(lease.context.engine)
    checkpoint?.()
    if (result !== undefined) onSuccess(entry)
    return result
  } finally { lease.release() }
}
