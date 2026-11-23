import { carryMembershipFactChanges } from "./project-membership-fact-delta.js"
import { canonicalWorkspaceRoot } from "./physical-path-identity.js"
import type { ProjectFileSetCacheEntry } from "./project-membership-catalog.js"
import type { WorkspaceContentChanges } from "./workspace-content-changes.js"

export interface ProjectMembershipRefresh {
  changed: boolean
  removedPaths: string[]
  readonly catalogStamp: { readonly canonicalRootId: string; readonly revision: number | null }
}

interface MembershipRefreshPort {
  readonly previous: ProjectFileSetCacheEntry | undefined
  scan(rootPath?: string): ProjectFileSetCacheEntry
  nextRevision(): number
  checkpoint(): void
  invalidate(paths: readonly string[]): Map<string, Map<string, Set<string>>>
  readonly changes: WorkspaceContentChanges
  publish(current: ProjectFileSetCacheEntry): void
  observedNamespaceChange?(): void
}

/** Reconcile an observed catalog without loading unrelated source text. The store
 * retains ownership of revision allocation, record invalidation and publication. */
export function refreshMembershipSnapshot(canonicalRoot: string, port: MembershipRefreshPort): ProjectMembershipRefresh {
  const previous = port.previous
  if (!previous) return admissionResult(canonicalRoot, null, false, [])
  // A physical catalog must not alternate lexical names as callers change aliases.
  // A revoked/retargeted origin may no longer certify this physical workspace.
  const scanRoot = previous.scanRoot && canonicalWorkspaceRoot(previous.scanRoot) === canonicalRoot
    ? previous.scanRoot : undefined
  const current = port.scan(scanRoot)
  if (current === previous) {
    port.checkpoint()
    port.publish(current)
    return admissionResult(canonicalRoot, previous.revision, false, [])
  }
  const sameNames = current.paths.length === previous.paths.length
    && current.paths.every((filePath, index) => filePath === previous.paths[index])
  const membershipUnchanged = current.status === previous.status
    && current.reason === previous.reason && sameNames
  const currentPaths = new Set(current.paths)
  const removedPaths = current.status === "complete"
    ? previous.paths.filter((filePath) => !currentPaths.has(filePath))
    : []
  const changedPaths = current.paths.filter((filePath) => (
    current.diskIdentities.get(filePath) !== previous.diskIdentities.get(filePath)
  ))
  const catalogUnchanged = membershipUnchanged && changedPaths.length === 0
  port.checkpoint()

  current.revision = catalogUnchanged
    ? previous.revision
    : port.nextRevision()
  const invalidationMatches = port.invalidate([...removedPaths, ...changedPaths])
  const changedRoots = new Set<string>()
  const resetRoots = new Set<string>()
  for (const filePath of removedPaths) {
    port.changes.markRemoved(canonicalRoot, filePath)
    for (const [affectedRoot, affectedPaths] of invalidationMatches.get(filePath) ?? []) {
      for (const affectedPath of affectedPaths) {
        port.changes.markRemoved(affectedRoot, affectedPath)
      }
      changedRoots.add(affectedRoot)
      resetRoots.add(affectedRoot)
    }
  }
  for (const filePath of changedPaths) {
    port.changes.markChanged(canonicalRoot, filePath)
    for (const [affectedRoot, affectedPaths] of invalidationMatches.get(filePath) ?? []) {
      let physicalAliasAffected = false
      for (const affectedPath of affectedPaths) {
        port.changes.markChanged(affectedRoot, affectedPath)
        physicalAliasAffected ||= affectedPath !== filePath
      }
      changedRoots.add(affectedRoot)
      if (affectedRoot !== canonicalRoot || physicalAliasAffected) {
        resetRoots.add(affectedRoot)
      }
    }
  }
  if (removedPaths.length > 0 || changedPaths.length > 0) {
    changedRoots.add(canonicalRoot)
  }
  for (const resetRoot of resetRoots) port.changes.reset(resetRoot)
  for (const changedRoot of changedRoots) {
    port.changes.advance(changedRoot)
  }
  carryMembershipFactChanges(previous, current, changedPaths, membershipUnchanged)
  port.publish(current)
  if (!sameNames) port.observedNamespaceChange?.()
  return admissionResult(canonicalRoot, current.revision, !catalogUnchanged || removedPaths.length > 0, removedPaths)
}

/** Internal proof is deliberately absent from enumerable public change reports. */
function admissionResult(canonicalRootId: string, revision: number | null,
  changed: boolean, removedPaths: string[]): ProjectMembershipRefresh {
  return Object.defineProperty({ changed, removedPaths }, "catalogStamp", {
    value: Object.freeze({ canonicalRootId, revision }),
  }) as ProjectMembershipRefresh
}
