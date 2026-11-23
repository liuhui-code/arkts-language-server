import path from "node:path"
import type { SemanticWorkspaceView } from "../../core/workspace/document-store.js"

export function scopedWorkspace(
  workspace: SemanticWorkspaceView,
  rootPaths: readonly string[],
  firstBatch: boolean,
  admittedProjectPaths?: readonly string[],
): SemanticWorkspaceView {
  const admitted = new Set(rootPaths.map(filePath => path.resolve(filePath)))
  const admittedProject = admittedProjectPaths
    ? new Set(admittedProjectPaths.map(filePath => path.resolve(filePath)))
    : undefined
  return {
    ...workspace,
    semanticRootPaths: rootPaths,
    documents: workspace.documents.filter(document => (
      document.overlay || admitted.has(path.resolve(document.path))
    )),
    ...(admittedProject && workspace.projectFileIdentities
      ? { projectFileIdentities: workspace.projectFileIdentities.filter(([filePath]) => (
          admittedProject.has(path.resolve(filePath))
        )) }
      : {}),
    changedPaths: firstBatch ? workspace.changedPaths : undefined,
    removedPaths: firstBatch ? workspace.removedPaths : undefined,
  }
}
