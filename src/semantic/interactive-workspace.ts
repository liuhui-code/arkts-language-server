import path from "node:path"
import { fileURLToPath } from "node:url"

import type { DocumentSnapshot, TextPosition, WorkspaceDescriptor } from "../contracts/document.js"
import type { SemanticCallHierarchySource } from "../contracts/semantic-engine.js"
import type { ProjectResolverPort } from "../contracts/project-resolver.js"
import type { SemanticTypeEngineRegistry } from "../core/types/type-engine.js"
import type { SemanticDocumentPosition } from "../core/protocol.js"
import type { SemanticDocumentStore, SemanticWorkspaceView } from "../core/workspace/document-store.js"
import { assertCompleteProjectMembership } from "./workspace-membership-admission.js"
import { WORKSPACE_CATALOG_STAMP } from "../core/workspace/semantic-workspace-view.js"
import { SemanticInputUnavailableError } from "../core/types/typescript-query-inputs.js"

/** Metadata reconciliation precedes the first raw snapshot; it creates no compiler owner. */
export function prepareReadinessCatalog(documents: SemanticDocumentStore, engines: SemanticTypeEngineRegistry,
  rootPath: string, eligible: boolean): boolean {
  return eligible && engines.needsReadinessCatalogRefresh(rootPath)
    ? documents.refreshProjectMembership(rootPath).changed : false
}

/** Ordinary queries may refresh an existing explicit session, never create a cold one. */
export function refreshInteractiveReadiness(documents: SemanticDocumentStore,
  engines: SemanticTypeEngineRegistry, workspace: SemanticWorkspaceView, catalogChangedBeforeCapture = false): void {
  if (!engines.needsReadinessRootRefresh(workspace)) return
  const original = workspace[WORKSPACE_CATALOG_STAMP]
  const captured = original !== undefined && original.revision !== null
  // A live compiler can outlive the bounded catalog cache. With no early change,
  // preserve its conservative existing path rather than creating a permanent denial.
  if (!captured && catalogChangedBeforeCapture) throw new SemanticInputUnavailableError()
  const complete = documents.prepareRoot(workspace.rootPath)
  const refreshed = complete?.[WORKSPACE_CATALOG_STAMP]
  if (captured && (!refreshed || original.canonicalRootId !== refreshed.canonicalRootId
    || original.revision !== refreshed.revision)) throw new SemanticInputUnavailableError()
  if (complete?.projectMembership?.status === "complete") engines.semanticReadiness(complete, "query")
}

/** Existing query preparation, with complete root certification only for an explicit session. */
export function prepareInteractiveContext(documents: SemanticDocumentStore, engines: SemanticTypeEngineRegistry,
  projects: ProjectResolverPort, document: DocumentSnapshot, position: TextPosition, options: {
    readonly includeWorkspaceFiles: boolean | "definition-fallback"
    readonly projectRootProfile: "closure" | "current"
    readonly additionalSemanticRoots: readonly string[]
    readonly certifyReadiness: boolean
  }) {
  const { projectRootProfile, additionalSemanticRoots, certifyReadiness } = options
  const includeWorkspaceFiles = options.includeWorkspaceFiles !== false
  if (options.includeWorkspaceFiles === "definition-fallback") {
    const rootUri = document.source?.kind === "disk" ? document.source.rootUri : projects.projectFor(document.uri).rootUri
    if (documents.hasCurrentCapacityFailure(fileURLToPath(rootUri))) throw new SemanticInputUnavailableError()
  }
  if (document.source?.kind === "disk") {
    const prepared = prepareSourceWorkspace(documents, { kind: "disk", uri: document.uri,
      text: document.text, workspaceId: document.workspaceId, workspaceRootUri: document.source.rootUri }, position, includeWorkspaceFiles,
      root => prepareReadinessCatalog(documents, engines, root, certifyReadiness
        && (includeWorkspaceFiles || projectRootProfile === "current" || !engines.hasSemanticGroups(root))))
    const workspace = interactiveWorkspace(prepared.workspace, prepared.position.path,
      includeWorkspaceFiles, projectRootProfile, additionalSemanticRoots)
    if (certifyReadiness && (includeWorkspaceFiles || projectRootProfile === "current"
      || !engines.hasSemanticGroups(workspace.rootPath))) refreshInteractiveReadiness(documents, engines, workspace, prepared.catalogChangedBeforeCapture)
    return { engine: includeWorkspaceFiles || projectRootProfile === "current" ? engines.prepare(workspace)
      : engines.prepareInteractive(workspace, () => documents.membershipFor(workspace.rootPath), certifyReadiness), position: prepared.position }
  }
  const workspace = projects.projectFor(document.uri)
  const legacyPosition = toLegacyPosition(document, position, workspace)
  const catalogChangedBeforeCapture = prepareReadinessCatalog(documents, engines, legacyPosition.workspaceRoot!,
    certifyReadiness && (includeWorkspaceFiles || projectRootProfile === "current"
      || !engines.hasSemanticGroups(legacyPosition.workspaceRoot!)))
  const prepared = prepareInteractiveWorkspace(documents, legacyPosition,
    includeWorkspaceFiles, projectRootProfile, additionalSemanticRoots)
  if (certifyReadiness && (includeWorkspaceFiles || projectRootProfile === "current"
    || !engines.hasSemanticGroups(prepared.rootPath))) refreshInteractiveReadiness(documents, engines, prepared, catalogChangedBeforeCapture)
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
  position: TextPosition, includeWorkspaceFiles: boolean, beforeCapture?: (rootPath: string) => boolean) {
  const documentUri = source.kind === "open" ? source.document.uri : source.uri
  const workspaceRoot = fileURLToPath(source.workspaceRootUri)
  const legacyPosition: SemanticDocumentPosition = {
    path: fileURLToPath(documentUri), line: position.line + 1, column: position.character + 1,
    workspaceRoot, ...(source.kind === "open" ? { documentVersion: source.document.version } : {}),
  }
  if (source.kind === "open") documents.sync({ path: legacyPosition.path, content: source.document.text,
    documentVersion: source.document.version, workspaceRoot })
  const catalogChangedBeforeCapture = beforeCapture?.(workspaceRoot) ?? false
  const workspace = source.kind === "open" ? documents.prepare(legacyPosition, includeWorkspaceFiles)
    : documents.prepareDiskSnapshot(legacyPosition, source.text, includeWorkspaceFiles)
  if (includeWorkspaceFiles) assertCompleteProjectMembership(workspace)
  return { workspace, position: legacyPosition, catalogChangedBeforeCapture }
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
    // Retry actual membership, without inventing a configuration/source mutation.
    // Real changes retain refreshProjectMembership's existing invalidation rules.
    documents.refreshProjectMembership(workspace.rootPath)
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
  if (includeWorkspaceFiles) { assertCompleteProjectMembership(workspace); return workspace }
  if (projectRootProfile !== "current") return workspace
  const roots = new Set([path.resolve(currentPath)])
  for (const document of workspace.documents) {
    if (document.overlay) roots.add(path.resolve(document.path))
  }
  for (const root of additionalSemanticRoots) roots.add(path.resolve(root))
  return { ...workspace, semanticRootPaths: [...roots].sort() }
}

/** Call hierarchy retains its existing unconditional readiness-refresh eligibility. */
export function prepareCallHierarchyContext(documents: SemanticDocumentStore, engines: SemanticTypeEngineRegistry,
  source: SemanticCallHierarchySource, position: TextPosition, includeWorkspaceFiles: boolean,
  projectRootProfile: "closure" | "current") {
  const prepared = prepareSourceWorkspace(documents, source, position, includeWorkspaceFiles,
    root => prepareReadinessCatalog(documents, engines, root, true))
  refreshInteractiveReadiness(documents, engines, prepared.workspace, prepared.catalogChangedBeforeCapture)
  return {
    engine: includeWorkspaceFiles || projectRootProfile === "current" ? engines.prepare(interactiveWorkspace(
      prepared.workspace, prepared.position.path, includeWorkspaceFiles, projectRootProfile))
      : engines.prepareInteractive(prepared.workspace, () => documents.membershipFor(prepared.workspace.rootPath)),
    position: prepared.position,
  }
}
