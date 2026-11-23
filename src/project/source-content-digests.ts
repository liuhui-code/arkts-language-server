import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { membershipFactCacheOwner } from "../core/workspace/project-membership-fact-delta.js"
import type { ProjectMembershipSnapshot, ProjectSourceSnapshot } from "../core/workspace/semantic-workspace-view.js"
import { SourceReadOrigin } from "./source-read-origin.js"
import { diskIdentity } from "./source-file-identity.js"
import { requestFileIdentity, takeCompletedRegularSourceObservation } from "./request-input-validation.js"

// Optional derived bytes, not an RSS policy. Overflow keeps guarded raw reads.
const MAX_RETAINED_BYTES = 32 * 1024 * 1024
interface Entry { readonly token: string; readonly fields: readonly number[]; readonly digest: Buffer }
interface Cache { readonly entries: Map<string, Entry>; bytes: number }
const caches = new WeakMap<object, Cache>()
interface DigestInput {
  readonly membership: ProjectMembershipSnapshot
  readonly strongMembership: boolean
  readonly file: string
  readonly root: string
  readonly canonicalRoot: string
  readonly physicalPath: string
  readonly token: string
}

/** A digest comes only from an actual guarded source read. Producer lineage
 * owns retention; a fresh original membership proof plus physical leaf evidence
 * admits reuse. That proof still participates in the independent final union. */
export function projectSourceDigest(input: DigestInput & { read(): ProjectSourceSnapshot | null }): Buffer | undefined {
  const { file, token, physicalPath } = input
  const owner = input.strongMembership ? membershipFactCacheOwner(input.membership) : undefined
  const cache = owner && caches.get(owner)
  const old = cache?.entries.get(file)
  if (old?.token === token) {
    const observed = takeCompletedRegularSourceObservation(file, path.dirname(physicalPath))
    let current: boolean
    if (observed) {
      const fields = old.fields
      current = (observed.mode & fs.constants.S_IFMT) === fs.constants.S_IFREG
        && observed.dev === fields[0] && observed.ino === fields[1] && observed.size === fields[2]
        && observed.mtimeMs === fields[3] && observed.ctimeMs === fields[4]
    } else {
      const identity = requestFileIdentity(file, () => diskIdentity(file))
      current = identity?.physicalPath === physicalPath && identity.stamp === expectedStamp(physicalPath, old.fields)
    }
    if (current) return old.digest
  }
  const snapshot = input.read()
  if (!snapshot) return undefined
  const digest = createHash("sha256").update(snapshot.content).digest()
  retainDigest(input, snapshot, digest)
  return digest
}

/** Called at the actual guarded read boundary, before the snapshot escapes.
 * Store-derived data only: a future admission must still validate fresh inputs. */
export function retainGuardedProjectSourceDigest(input: DigestInput, snapshot: ProjectSourceSnapshot): void {
  if (input.membership.status !== "complete" || !membershipFactCacheOwner(input.membership)) return
  retainDigest(input, snapshot, createHash("sha256").update(snapshot.content).digest())
}

function retainDigest(input: DigestInput, snapshot: ProjectSourceSnapshot, digest: Buffer): void {
  const { file, token, physicalPath } = input
  const owner = input.strongMembership ? membershipFactCacheOwner(input.membership) : undefined
  const fields = tokenFields(token)
  if (!owner || !fields || snapshot.identity.stamp !== expectedStamp(physicalPath, fields)
    || !SourceReadOrigin.fromSnapshot(file, input.root, input.canonicalRoot, snapshot)) return
  const cache = caches.get(owner), old = cache?.entries.get(file)
  const next = cache ?? { entries: new Map<string, Entry>(), bytes: 0 }
  // No retained source text, AST, Program, descriptors, snapshots or validity bit.
  const bytes = 224 + 2 * (file.length + token.length)
  const priorBytes = old ? 224 + 2 * (file.length + old.token.length) : 0
  if (next.bytes - priorBytes + bytes <= MAX_RETAINED_BYTES) {
    next.entries.set(file, { token, fields, digest }); next.bytes += bytes - priorBytes
    if (!cache) caches.set(owner, next)
  } else if (old) {
    next.entries.delete(file); next.bytes -= priorBytes
  }
}

function expectedStamp(physicalPath: string, fields: readonly number[]): string {
  return JSON.stringify([physicalPath, ...fields])
}

function tokenFields(token: string): readonly number[] | undefined {
  const fields = token.split(":").map(Number)
  if (fields.length !== 5 || !Number.isSafeInteger(fields[0]) || fields[0] < 0
    || !Number.isSafeInteger(fields[1]) || fields[1] <= 0 || !Number.isSafeInteger(fields[2])
    || fields[2] < 0 || !Number.isFinite(fields[3]) || !Number.isFinite(fields[4])) return undefined
  return Object.freeze(fields)
}
