import { publishMembershipFactSnapshot } from "./project-membership-fact-delta.js"
import path from "node:path"
import { canonicalWorkspaceRoot } from "./physical-path-identity.js"
import type { ProjectFileSetCacheEntry } from "./project-membership-catalog.js"
import type { ProjectMembershipSnapshot } from "./semantic-workspace-view.js"
import type { SemanticOperationControl } from "./document-store.js"
import { SemanticInputUnavailableError } from "../types/typescript-query-inputs.js"
import { validateRequestInput } from "../../project/request-input-validation.js"

const ownedMembershipSnapshots = new WeakSet<ProjectMembershipSnapshot>()

/** Producer identity/immutability only, never a cached validity result. Callers
 * must still run current membership and independent final physical proofs. */
export function isStoreOwnedProjectMembership(snapshot: ProjectMembershipSnapshot): boolean {
  return ownedMembershipSnapshots.has(snapshot)
}

const revokedMemberships = new WeakMap<ProjectFileSetCacheEntry, number>()
const weakMembershipInputs = new WeakMap<ProjectFileSetCacheEntry, {
  readonly revision: number; readonly paths: readonly string[]; readonly tokens: ReadonlyMap<string, string>
}>()

/** Original store-owned proof, carried into the actual query's final union. */
export function validateCachedMembershipBeforeCapture(rootPath: string,
  entries: ReadonlyMap<string, ProjectFileSetCacheEntry>, overlays: (root: string) => readonly string[],
  control: SemanticOperationControl, refresh: () => unknown, scan: () => ProjectFileSetCacheEntry) {
  const root = canonicalWorkspaceRoot(rootPath), before = entries.get(root)
  if (before && (before.completeProof?.invalidated || revokedMemberships.get(before) === before.revision
    || before.completeProof && !before.completeProof.matchesCatalog(before, control))) refresh()
  const entry = entries.get(root)
  if (!entry || entry.status !== "complete") throw new SemanticInputUnavailableError()
  const revision = entry.revision, proof = entry.completeProof
  const catalogStamp = Object.freeze({ canonicalRootId: root, revision })
  if (proof) {
    const owner = {}
    const current = () => validateRequestInput(owner, 0, revision, () =>
      entries.get(root) === entry && entry.revision === revision && entry.completeProof === proof
      && proof.current(entry, overlays(root), control), "membership-consumer")
    if (!current()) throw new SemanticInputUnavailableError()
    return { catalogStamp, current }
  }
  // Weak/unretainable enumeration cannot lend a cached completeness answer.
  // Keep original primitive facts and repeat the authority's full raw scan.
  let snapshot = weakMembershipInputs.get(entry)
  if (snapshot?.revision !== revision) {
    const paths: string[] = [], tokens = new Map<string, string>()
    for (const file of entry.paths) { control.checkpoint(); paths.push(file) }
    for (const [file, token] of entry.diskIdentities) { control.checkpoint(); tokens.set(file, token) }
    snapshot = { revision, paths: Object.freeze(paths), tokens }
    weakMembershipInputs.set(entry, snapshot)
  }
  const { paths, tokens } = snapshot
  const same = (observed: ProjectFileSetCacheEntry | undefined): boolean => {
    if (!observed || observed.status !== "complete" || observed.paths.length !== paths.length
      || observed.diskIdentities.size !== tokens.size) return false
    for (let index = 0; index < paths.length; index++) {
      control.checkpoint()
      const file = paths[index]
      if (observed.paths[index] !== file || observed.diskIdentities.get(file) !== tokens.get(file)) return false
    }
    return true
  }
  const live = () => { const value = entries.get(root); return value?.revision === revision && same(value) }
  const reject = () => {
    if (entry.revision === revision) revokedMemberships.set(entry, revision)
    const value = entries.get(root)
    if (value?.revision === revision) revokedMemberships.set(value, revision)
    return false
  }
  const raw = () => {
    try {
      control.checkpoint()
      return revokedMemberships.get(entry) !== revision && live() && canonicalWorkspaceRoot(rootPath) === root
        && same(scan()) && live() || reject()
    } catch { control.checkpoint(); return reject() }
  }
  // Register at actual query consumption, after its source/configuration owners,
  // so the fallback's independent final enumeration remains a terminal fence.
  if (!raw()) throw new SemanticInputUnavailableError()
  return { catalogStamp, current: () => validateRequestInput(entry, 0, revision, raw, "membership") }
}

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
  publishMembershipFactSnapshot(entry, snapshot)
  ownedMembershipSnapshots.add(snapshot)
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

/** Capture only the original strong catalog. Never reconcile or adopt a new generation. */
export function captureProjectIdentityProof(rootPath: string, revision: number,
  entries: ReadonlyMap<string, ProjectFileSetCacheEntry>, overlays: (root: string) => readonly string[],
  control: SemanticOperationControl) {
  const root = canonicalWorkspaceRoot(rootPath), entry = entries.get(root), proof = entry?.completeProof
  if (!entry || entry.status !== "complete" || entry.revision !== revision || !proof || proof.invalidated) return undefined
  return { catalogStamp: { canonicalRootId: root, revision }, current: () =>
    entries.get(root) === entry && entry.revision === revision && entry.completeProof === proof
      && proof.current(entry, overlays(root), control) }
}

export function currentMembershipCapacityFailure(entry: ProjectFileSetCacheEntry | undefined,
  overlays: () => readonly string[], control: SemanticOperationControl): boolean {
  const proof = entry?.capacityProof
  if (entry?.status !== "partial" || !proof) return false
  const active = new Set(proof.overlays.length ? overlays() : [])
  return proof.overlays.every(file => active.has(file)) && proof.directories.current(control)
}
