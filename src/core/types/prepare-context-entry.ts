import path from "node:path"
import type { SemanticCoordinator } from "../../semantic/coordinator/semantic-coordinator.js"
import type { LocalPackageResolver } from "../sdk/local-package-resolver.js"
import type { ProjectFileAccessPort, SemanticWorkspaceView } from "../workspace/document-store.js"
import type { SourceResetAdmissions } from "./source-reset-admission.js"
import { reconcileResolutionOwner, synchronizeContextDelta, typeContextResetReason } from "./type-context-reset.js"
import type { WorkspaceEngineEntry } from "./type-workspace-entry.js"
import { SemanticInputUnavailableError } from "./typescript-query-inputs.js"

/** Retire first, then construct; only immutable configuration evidence spans the replacement. */
export function prepareContextEntry(workspace: SemanticWorkspaceView, contextId: string, promoteRecency: boolean, port: {
  resolver: LocalPackageResolver; coordinator: SemanticCoordinator<WorkspaceEngineEntry>
  admissions: SourceResetAdmissions; access?: ProjectFileAccessPort; reuse: boolean; checkpoint: () => void
  trace?: (event: string, fields: Readonly<Record<string, string | number | boolean | null | undefined>>) => void
}) {
  const previous = reconcileResolutionOwner(workspace, contextId, port.resolver, port.coordinator, port.checkpoint,
    entry => { port.admissions.begin(contextId, workspace.canonicalRootId ?? path.resolve(workspace.rootPath),
      entry, "unnotified-resolution-change", port.checkpoint) })
  workspace = synchronizeContextDelta(workspace, previous?.appliedContentRevision, port.access, previous?.engine.compilerInputPaths())
  const resolutionChanged = previous !== undefined && previous.resolutionGeneration !== port.resolver.generation
  const resetReason = typeContextResetReason(workspace, previous,
    contextId !== path.resolve(workspace.rootPath) || port.reuse) ?? (resolutionChanged ? "resolution-generation-change" : undefined)
  const proof = port.admissions.begin(contextId, workspace.canonicalRootId ?? path.resolve(workspace.rootPath),
    previous, resetReason, port.checkpoint)
  const refreshReadiness = resetReason === "content-revision-change" && previous?.engine.hasReadinessRefreshIntent() === true
  if (resetReason) {
    if (resetReason === "canonical-owner-change") port.resolver.projectFor(workspace.rootPath).invalidate()
    if (!port.coordinator.remove(contextId, resetReason)) throw new SemanticInputUnavailableError()
    port.admissions.consumeConfiguration(previous)
  }
  // Construction may throw. Keep its pending capsule so a later cold acquire
  // cannot silently admit a configuration that failed this replacement window.
  const lease = port.coordinator.acquire(contextId, promoteRecency)
  const entry = lease.context, newEntry = previous !== entry
  const started = port.trace ? performance.now() : undefined
  try {
    port.admissions.assertCurrent(proof, port.checkpoint)
    const state = entry.engine.prepare(workspace)
    port.admissions.assertCurrent(proof, port.checkpoint)
    if (newEntry && refreshReadiness) entry.engine.restoreReadinessRefreshIntent()
    if (started !== undefined) port.trace?.("semantic.prepare.complete", {
      durationMs: performance.now() - started, newEntry, resetReason: resetReason ?? null,
    })
    port.admissions.complete(contextId, proof)
    port.admissions.consumeConfiguration(previous)
    return { workspace, lease, entry, state }
  } catch (error) {
    lease.release()
    if (newEntry) port.coordinator.remove(contextId, "prepare-failed")
    throw error
  }
}
