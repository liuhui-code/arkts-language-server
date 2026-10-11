import path from "node:path"

import type { SemanticDocumentPosition } from "../core/protocol.js"
import type { SemanticDocumentStore, SemanticWorkspaceView } from "../core/workspace/document-store.js"

/** Retry unknown full scope through its existing owner before projecting interactive roots. */
export function prepareInteractiveWorkspace(
  documents: SemanticDocumentStore,
  position: SemanticDocumentPosition,
  includeWorkspaceFiles: boolean,
  projectRootProfile: "closure" | "current",
  additionalSemanticRoots: readonly string[] = [],
): SemanticWorkspaceView {
  let workspace = documents.prepare(position, includeWorkspaceFiles)
  if (includeWorkspaceFiles && workspace.projectMembership?.status === "partial") {
    documents.workspaceFilesChanged({ rootPath: workspace.rootPath, rootDirty: true, changes: [] })
    workspace = documents.prepare(position, includeWorkspaceFiles)
  }
  return interactiveWorkspace(workspace, position.path, includeWorkspaceFiles,
    projectRootProfile, additionalSemanticRoots)
}

/** Project-root projection only; source and overlay authority remain with the document store. */
export function interactiveWorkspace(
  workspace: SemanticWorkspaceView,
  currentPath: string,
  includeWorkspaceFiles: boolean,
  projectRootProfile: "closure" | "current",
  additionalSemanticRoots: readonly string[] = [],
): SemanticWorkspaceView {
  if (includeWorkspaceFiles || projectRootProfile !== "current") return workspace
  const roots = new Set([path.resolve(currentPath)])
  for (const document of workspace.documents) {
    if (document.overlay) roots.add(path.resolve(document.path))
  }
  for (const root of additionalSemanticRoots) roots.add(path.resolve(root))
  return { ...workspace, semanticRootPaths: [...roots].sort() }
}
