import path from "node:path"
import { canonicalWorkspaceRoot } from "./physical-path-identity.js"
import type { ProjectFileSetCacheEntry } from "./project-membership-catalog.js"
import type { ProjectMembershipSnapshot } from "./semantic-workspace-view.js"

interface MembershipAccess {
  readonly entries: Map<string, ProjectFileSetCacheEntry>
  checkpoint(): void
  scan(root: string): ProjectFileSetCacheEntry
  nextRevision(): number
  publish(root: string, entry: ProjectFileSetCacheEntry): void
}

/** Store-owned cache admission, LRU touch and immutable public projection. */
export function readProjectMembership(rootPath: string, port: MembershipAccess): ProjectMembershipSnapshot {
  port.checkpoint()
  const resolvedRoot = path.resolve(rootPath), canonicalRoot = canonicalWorkspaceRoot(resolvedRoot)
  const cached = port.entries.get(canonicalRoot)
  if (cached) {
    port.entries.delete(canonicalRoot)
    port.entries.set(canonicalRoot, cached)
    return publicProjectMembership(cached)
  }
  const entry = port.scan(resolvedRoot)
  entry.revision = port.nextRevision()
  port.publish(canonicalRoot, entry)
  return publicProjectMembership(entry)
}

function publicProjectMembership(entry: ProjectFileSetCacheEntry): ProjectMembershipSnapshot {
  if (entry.publicSnapshot?.revision === entry.revision) return entry.publicSnapshot
  const snapshot: ProjectMembershipSnapshot = Object.freeze({
    paths: Object.freeze([...entry.paths]),
    status: entry.status,
    ...(entry.reason ? { reason: entry.reason } : {}),
    revision: entry.revision,
  })
  entry.publicSnapshot = snapshot
  return snapshot
}


/** Token lookup shares the Store's exact catalog revision and lexical path rules. */
export function readProjectAdmissionToken(entries: ReadonlyMap<string, ProjectFileSetCacheEntry>,
  canonicalRootId: string, catalogRevision: number, filePath: string): string | undefined {
  const entry = entries.get(canonicalRootId)
  if (!entry || entry.revision !== catalogRevision) return undefined
  return entry.diskIdentities.get(path.resolve(filePath))
}
