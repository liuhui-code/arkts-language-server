import fs from "node:fs"
import path from "node:path"

import type { ProjectFileAccessPort, SemanticWorkspaceView } from "../workspace/document-store.js"
import { withChangedDiskDocuments } from "./type-delta-inputs.js"
import type { LocalPackageResolver } from "../sdk/local-package-resolver.js"
import type { SemanticCoordinator } from "../../semantic/coordinator/semantic-coordinator.js"
import type { WorkspaceEngineEntry } from "./type-workspace-entry.js"
import { SemanticInputUnavailableError } from "./typescript-query-inputs.js"
import { RESOLUTION_INPUT_GENERATION } from "../workspace/workspace-resolution-inputs.js"
import { resolutionInputWasRebased } from "../../project/resolution-input-admission.js"

/** Validate load-owned resolution input before choosing the consumer's ordinary reset cause. */
export function reconcileResolutionOwner(workspace: SemanticWorkspaceView, contextId: string,
  resolver: LocalPackageResolver, coordinator: SemanticCoordinator<WorkspaceEngineEntry>, checkpoint: () => void) {
  const recoveredUnnotifiedInput = resolver.refreshInputGeneration(workspace.rootPath, checkpoint)
  const inputs = workspace[RESOLUTION_INPUT_GENERATION]
  const previous = coordinator.peek(contextId)
  const ownerChanged = typeContextResetReason(workspace, previous) === "canonical-owner-change"
  // Repair belongs to the next input attempt. An unchanged request cannot
  // silently rebase its prepared proof; observed source deltas already open a new input.
  if ((recoveredUnnotifiedInput || inputs?.recoveredUnnotifiedInput || resolutionInputWasRebased(resolver)) && !workspace.resetTypeEngine
    && !ownerChanged && !workspace.changedPaths?.length && !workspace.removedPaths?.length) {
    coordinator.remove(contextId, "unnotified-resolution-change")
    throw new SemanticInputUnavailableError()
  }
  if (inputs && (inputs.generation !== inputs.owner.generation || inputs.owner !== resolver
    && !inputs.owner.configurationFreshness(workspace.rootPath, checkpoint)?.())) throw new SemanticInputUnavailableError()
  return previous
}

interface AppliedContextIdentity {
  readonly ownerId: string
  readonly resetEpoch: number
  readonly appliedContentRevision: number
}

/** A query cannot consume another group's evidence; only contiguous witnessed revisions are replayed. */
export function synchronizeContextDelta(workspace: SemanticWorkspaceView, revision: number | undefined,
  access?: ProjectFileAccessPort, compilerInputs?: ReadonlySet<string>): SemanticWorkspaceView {
  if (revision === undefined || revision === workspace.contentRevision || workspace.resetTypeEngine) return workspace
  const history = workspace.contentDeltas
  const start = history?.findIndex(delta => delta.fromRevision === revision) ?? -1
  if (!history || start < 0) return workspace
  const changed = new Set<string>()
  let cursor = revision
  for (const delta of history.slice(start)) {
    if (delta.rootPath !== path.resolve(workspace.rootPath) || delta.fromRevision !== cursor
      || delta.toRevision <= cursor || delta.toRevision > workspace.contentRevision) return workspace
    for (const file of delta.changedPaths) changed.add(path.resolve(file))
    cursor = delta.toRevision
    if (cursor === workspace.contentRevision) break
  }
  if (cursor !== workspace.contentRevision) return workspace
  const scope = workspace.semanticRootPaths && compilerInputs
    ? new Set([...workspace.semanticRootPaths.map(file => path.resolve(file)), ...compilerInputs]) : undefined
  const changedPaths = [...changed].filter(file => !scope || scope.has(file))
  return withChangedDiskDocuments({ ...workspace, changedPaths, contentChangedPaths: [...changed], contentDelta: { rootPath: path.resolve(workspace.rootPath),
    fromRevision: revision, toRevision: cursor, changedPaths } }, access)
}

export function typeContextResetReason(
  workspace: SemanticWorkspaceView,
  previous: AppliedContextIdentity | undefined,
  sessionReuse = false,
): string | undefined {
  if (!previous) return undefined
  if (workspace.resetTypeEngine) return "document-store-reset"
  if (previous.ownerId !== (workspace.canonicalRootId ?? path.resolve(workspace.rootPath))) return "canonical-owner-change"
  if (previous.resetEpoch !== (workspace.typeEngineResetEpoch ?? 0)) return "reset-epoch-change"
  if (previous.appliedContentRevision !== (workspace.contentRevision ?? 0)
    && !(sessionReuse && hasCompleteDiskDelta(workspace, previous.appliedContentRevision))) {
    return "content-revision-change"
  }
  return undefined
}

function hasCompleteDiskDelta(workspace: SemanticWorkspaceView, appliedRevision: number): boolean {
  const delta = workspace.contentDelta
  const paths = workspace.changedPaths
  const root = path.resolve(workspace.rootPath)
  const deliveredPaths = new Set([...workspace.documents.map(document => path.resolve(document.path)),
    ...(workspace.changedDiskInputs ?? []).map(input => path.resolve(input.path))])
  return delta !== undefined && delta.rootPath === root
    && delta.fromRevision === appliedRevision && delta.toRevision === workspace.contentRevision
    && (workspace.removedPaths?.length ?? 0) === 0 && paths !== undefined
    && (paths.length > 0 || (workspace.semanticRootPaths !== undefined && delta.toRevision > delta.fromRevision))
    && delta.changedPaths.length === paths.length && paths.every((filePath, index) => {
      const relative = path.relative(root, filePath)
      return delta.changedPaths[index] === filePath && deliveredPaths.has(filePath)
        && relative !== "" && !path.isAbsolute(relative)
        && !relative.split(path.sep).some(part => part === ".." || part === "oh_modules")
    })
}

export function canonicalTypeEngineOwner(rootPath: string): string {
  const resolved = path.resolve(rootPath)
  try {
    return fs.realpathSync.native(resolved)
  } catch {
    return resolved
  }
}
