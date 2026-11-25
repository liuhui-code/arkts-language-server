import type { ProjectFileSetCacheEntry } from "./project-membership-catalog.js"
import type { ProjectMembershipSnapshot } from "./semantic-workspace-view.js"

interface Step { readonly from: number; readonly to: number; readonly files: readonly string[] }
interface Owner { sequence: number; history: Step[] }
interface Observation { readonly owner: Owner; readonly sequence: number }
interface Draft { readonly before: Observation; paths: Set<string> | undefined }
const snapshots = new WeakMap<ProjectMembershipSnapshot, Observation>()
const drafts = new WeakMap<ProjectFileSetCacheEntry, Draft>()
// Optional metadata history only. A gap/overflow falls back to the full fact pass.
const MAX_STEPS = 32, MAX_PATHS = 512

/** Producer-issued catalog lineage, not disk freshness or compiler content history.
 * In particular, saving an overlay changes disk admission without changing the
 * compiler's authoritative overlay bytes or its content revision. */
export function noteKnownMembershipSources(entry: ProjectFileSetCacheEntry,
  files: readonly string[] | undefined): void {
  let draft = drafts.get(entry)
  if (!draft) {
    const before = entry.publicSnapshot && snapshots.get(entry.publicSnapshot)
    if (!before) return
    draft = { before, paths: new Set() }; drafts.set(entry, draft)
  }
  if (!files) { draft.paths = undefined; return }
  if (!draft.paths) return
  for (const file of files) {
    draft.paths.add(file)
    if (draft.paths.size > MAX_PATHS) { draft.paths = undefined; return }
  }
}

/** The refresh producer has already compared every member and token. Its exact
 * delta extends prior watched changes; an uncertain/name-changing scan cannot. */
export function carryMembershipFactChanges(previous: ProjectFileSetCacheEntry,
  current: ProjectFileSetCacheEntry, files: readonly string[], sameMembers: boolean): void {
  if (!sameMembers || current.status !== "complete" || previous.status !== "complete"
    || previous.scanRoot !== current.scanRoot) return
  const before = previous.publicSnapshot && snapshots.get(previous.publicSnapshot)
  const prior = drafts.get(previous) ?? (before ? { before, paths: new Set<string>() } : undefined)
  if (!prior) return
  drafts.set(current, { before: prior.before, paths: prior.paths && new Set(prior.paths) })
  noteKnownMembershipSources(current, files)
}

/** Called only at the immutable Store snapshot publication boundary. No source
 * bytes, AST, validity bit or unbounded chain of old snapshots is retained. */
export function publishMembershipFactSnapshot(entry: ProjectFileSetCacheEntry,
  snapshot: ProjectMembershipSnapshot): void {
  const draft = drafts.get(entry)
  drafts.delete(entry)
  let owner: Owner = { sequence: 0, history: [] }
  if (entry.status === "complete" && draft?.paths
    && draft.before.sequence === draft.before.owner.sequence) {
    owner = draft.before.owner
    owner.history.push({ from: owner.sequence, to: ++owner.sequence,
      files: Object.freeze([...draft.paths]) })
    let paths = owner.history.reduce((total, step) => total + step.files.length, 0)
    while (owner.history.length > MAX_STEPS || paths > MAX_PATHS) paths -= owner.history.shift()!.files.length
  }
  snapshots.set(snapshot, { owner, sequence: owner.sequence })
}

/** Exact issued snapshots and contiguous producer steps only. Original current
 * membership/source/config/overlay proofs and the final fence still must run. */
export function changedMembershipFactSources(before: ProjectMembershipSnapshot,
  after: ProjectMembershipSnapshot): readonly string[] | undefined {
  const start = snapshots.get(before), end = snapshots.get(after)
  if (!start || !end || start.owner !== end.owner || start.sequence > end.sequence) return undefined
  if (before === after) return []
  const files = new Set<string>()
  let cursor = start.sequence
  for (const step of end.owner.history) {
    if (step.to <= cursor) continue
    if (step.from !== cursor || step.to > end.sequence) return undefined
    for (const file of step.files) files.add(file)
    cursor = step.to
    if (cursor === end.sequence) return [...files]
  }
  return undefined
}

/** Opaque producer lineage for derived per-file facts, never freshness authority.
 * Name/uncertainty changes create a new family; no prior snapshot is retained. */
export function membershipFactCacheOwner(snapshot: ProjectMembershipSnapshot): object | undefined {
  return snapshots.get(snapshot)?.owner
}
