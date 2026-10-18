import path from "node:path"
import { fileURLToPath } from "node:url"

import type { DocumentSnapshot, TextPosition, WorkspaceDescriptor } from "../contracts/document.js"
import type { SemanticCallHierarchySource } from "../contracts/semantic-engine.js"
import type { ProjectResolverPort } from "../contracts/project-resolver.js"
import type { SemanticTypeEngineRegistry } from "../core/types/type-engine.js"
import type { SemanticDocumentPosition } from "../core/protocol.js"
import type { SemanticDocumentStore, SemanticWorkspaceView } from "../core/workspace/document-store.js"

/** Ordinary queries may refresh an existing explicit session, never create a cold one. */
export function refreshInteractiveReadiness(documents: SemanticDocumentStore,
  engines: SemanticTypeEngineRegistry, workspace: SemanticWorkspaceView): void {
  if (!engines.needsReadinessRootRefresh(workspace)) return
  const complete = documents.prepareRoot(workspace.rootPath)
  if (complete) engines.semanticReadiness(complete, "query")
}

/** Existing query preparation, with complete root certification only for an explicit session. */
export function prepareInteractiveContext(documents: SemanticDocumentStore, engines: SemanticTypeEngineRegistry,
  projects: ProjectResolverPort, document: DocumentSnapshot, position: TextPosition, options: {
    readonly includeWorkspaceFiles: boolean
    readonly projectRootProfile: "closure" | "current"
    readonly additionalSemanticRoots: readonly string[]
    readonly certifyReadiness: boolean
  }) {
  const { includeWorkspaceFiles, projectRootProfile, additionalSemanticRoots, certifyReadiness } = options
  if (document.source?.kind === "disk") {
    const prepared = prepareSourceWorkspace(documents, { kind: "disk", uri: document.uri,
      text: document.text, workspaceId: document.workspaceId, workspaceRootUri: document.source.rootUri }, position, includeWorkspaceFiles)
    const workspace = interactiveWorkspace(prepared.workspace, prepared.position.path,
      includeWorkspaceFiles, projectRootProfile, additionalSemanticRoots)
    if (certifyReadiness) refreshInteractiveReadiness(documents, engines, workspace)
    return { engine: includeWorkspaceFiles || projectRootProfile === "current" ? engines.prepare(workspace)
      : engines.prepareInteractive(workspace, () => documents.membershipFor(workspace.rootPath), certifyReadiness), position: prepared.position }
  }
  const workspace = projects.projectFor(document.uri)
  const legacyPosition = toLegacyPosition(document, position, workspace)
  const prepared = prepareInteractiveWorkspace(documents, legacyPosition,
    includeWorkspaceFiles, projectRootProfile, additionalSemanticRoots)
  if (certifyReadiness) refreshInteractiveReadiness(documents, engines, prepared)
  const engine = includeWorkspaceFiles || projectRootProfile === "current" ? engines.prepare(prepared)
    : engines.prepareInteractive(prepared, () => documents.membershipFor(prepared.rootPath), certifyReadiness)
  return { engine, position: legacyPosition }
}

/** Adapt public UTF-16 positions while keeping disk snapshots out of overlay version checks. */
export function toLegacyPosition(document: DocumentSnapshot, position: TextPosition,
  workspace: WorkspaceDescriptor): SemanticDocumentPosition {
  return {
    path: fileURLToPath(document.uri),
    line: position.line + 1,
    column: position.character + 1,
    ...(document.source?.kind === "disk" ? {} : { documentVersion: document.version }),
    workspaceRoot: fileURLToPath(workspace.rootUri),
  }
}

/** Existing open/disk source ownership, independent of any compiler context. */
export function prepareSourceWorkspace(documents: SemanticDocumentStore, source: SemanticCallHierarchySource,
  position: TextPosition, includeWorkspaceFiles: boolean) {
  const documentUri = source.kind === "open" ? source.document.uri : source.uri
  const workspaceRoot = fileURLToPath(source.workspaceRootUri)
  const legacyPosition: SemanticDocumentPosition = {
    path: fileURLToPath(documentUri), line: position.line + 1, column: position.character + 1,
    workspaceRoot, ...(source.kind === "open" ? { documentVersion: source.document.version } : {}),
  }
  const workspace = source.kind === "open"
    ? (() => {
        documents.sync({ path: legacyPosition.path, content: source.document.text,
          documentVersion: source.document.version, workspaceRoot })
        return documents.prepare(legacyPosition, includeWorkspaceFiles)
      })()
    : documents.prepareDiskSnapshot(legacyPosition, source.text, includeWorkspaceFiles)
  return { workspace, position: legacyPosition }
}

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
