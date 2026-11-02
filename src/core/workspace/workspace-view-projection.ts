import { RESOLUTION_INPUT_GENERATION, type ResolutionInputGeneration } from "./workspace-resolution-inputs.js"
import { WORKSPACE_CATALOG_STAMP, type ProjectMembershipSnapshot, type SemanticWorkspaceView } from "./semantic-workspace-view.js"
import type { WorkspaceContentChanges, WorkspaceContentDelta } from "./workspace-content-changes.js"

/** Materialize one store capture; catalog absence and revision are copied, never loaded or rebased. */
export function createSemanticWorkspaceView(input: {
  rootPath: string
  canonicalRoot: string
  resolutionGeneration: ResolutionInputGeneration
  overlayPaths: ReadonlyMap<string, string>
  documents: SemanticWorkspaceView["documents"]
  projectMembership: ProjectMembershipSnapshot | undefined
  catalogRevision: number | null
  changes: ReturnType<WorkspaceContentChanges["take"]>
  contentDeltas: readonly WorkspaceContentDelta[]
  removedPaths: readonly string[]
  currentPath: string
  current: { contentGeneration: number; documentVersion?: number; available: boolean }
  dependencyGeneration: number
  documentCacheHit: boolean
  dependencyClosureCacheHit: boolean
}): SemanticWorkspaceView {
  const { changes } = input
  return {
    rootPath: input.rootPath,
    [RESOLUTION_INPUT_GENERATION]: input.resolutionGeneration,
    [WORKSPACE_CATALOG_STAMP]: Object.freeze({ canonicalRootId: input.canonicalRoot, revision: input.catalogRevision }),
    canonicalRootId: input.canonicalRoot,
    overlayPaths: input.overlayPaths,
    typeEngineResetEpoch: changes.typeEngineResetEpoch,
    documents: input.documents,
    projectMembership: input.projectMembership,
    removedPaths: [...new Set([...changes.removedPaths, ...input.removedPaths])],
    changedPaths: changes.changedPaths,
    contentDelta: changes.contentDelta,
    contentDeltas: input.contentDeltas,
    contentRevision: changes.contentRevision,
    resetTypeEngine: changes.resetTypeEngine,
    state: {
      path: input.currentPath,
      contentGeneration: input.current.contentGeneration,
      documentVersion: input.current.documentVersion,
      dependencyGeneration: input.dependencyGeneration,
      documentCacheHit: input.documentCacheHit,
      dependencyClosureCacheHit: input.dependencyClosureCacheHit,
      queryCacheHit: false,
      loadedDocumentCount: input.documents.length,
      syntaxReady: input.current.available,
    },
  }
}
