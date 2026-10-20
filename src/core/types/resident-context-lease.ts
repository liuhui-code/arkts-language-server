import path from "node:path"
import type { SemanticWorkspaceView } from "../workspace/document-store.js"
import type { SemanticCoordinator, SemanticMemoryLevel } from "../../semantic/coordinator/semantic-coordinator.js"
import type { WorkspaceEngineEntry } from "./type-workspace-entry.js"
import type { TypeScriptLanguageServiceEngine } from "./typescript-language-service.js"
import type { SemanticReferenceQueryResult } from "./type-engine-contract.js"
import { synchronizeContextDelta, typeContextResetReason } from "./type-context-reset.js"
import { SemanticInputUnavailableError } from "./typescript-query-inputs.js"

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

/** Synchronize a known warm owner; a miss cannot create or rebuild an unknown context. */
export function queryRetainedReferenceContext(rootPath: string, workspace: () => SemanticWorkspaceView,
  coordinator: SemanticCoordinator<WorkspaceEngineEntry>, allowed: boolean,
  query: (workspace: SemanticWorkspaceView) => SemanticReferenceQueryResult | undefined): SemanticReferenceQueryResult | undefined {
  const entry = coordinator.peek(rootPath)
  if (!allowed || !entry?.engine.hasPreparedCompilerState()) return undefined
  const lease = coordinator.acquire(rootPath)
  try {
    const current = synchronizeContextDelta(workspace(), entry.appliedContentRevision)
    if (current.projectMembership?.status !== "complete" || typeContextResetReason(current, entry, true)) return undefined
    const result = query(current)
    return completeReferenceScope(result, current) ? result : undefined
  } catch (error) {
    if (!(error instanceof SemanticInputUnavailableError)) throw error
    // A changed load cannot be repaired by retrying the same witnessed compiler state.
    entry.engine.invalidateResidentReferences()
    return undefined
  } finally { lease.release() }
}

export function completeReferenceScope(result: SemanticReferenceQueryResult | undefined,
  workspace: SemanticWorkspaceView): boolean {
  const searched = result?.status === "complete" && result.searchedProjectPaths
    ? new Set(result.searchedProjectPaths) : undefined
  return Boolean(searched && workspace.projectMembership?.status === "complete"
    && workspace.projectMembership.paths.every(file => searched.has(file))
    && workspace.documents.filter(document => document.overlay).every(document => searched.has(document.path)))
}
