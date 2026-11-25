import fs from "node:fs"
import { retainPendingRegularSourceObservation, retainValidationSourceDirectories, validateRequestInput } from "../../project/request-input-validation.js"
import path from "node:path"
import type { ValidationDirectoryProof } from "../../project/request-input-validation.js"
import type { ProjectFileSetCacheEntry } from "./project-membership-catalog.js"
import type { SemanticOperationControl } from "./document-store.js"
import type { WorkspaceNamespaceWitness } from "./workspace-source-enumerator.js"
import { MAX_DISK_SNAPSHOT_BYTES, sourceStatIdentity } from "./workspace-disk-source.js"

export interface CompleteMembershipProof {
  readonly invalidated: boolean
  /** Revoke this exact producer generation; only a real scan can replace it. */
  invalidate(): void
  /** Admitted metadata only, with cancellation; never filesystem freshness. */
  matchesCatalog(current: ProjectFileSetCacheEntry, control: SemanticOperationControl): boolean
  renew?(entry: ProjectFileSetCacheEntry, changedPaths: readonly string[],
    control: SemanticOperationControl): CompleteMembershipProof | undefined
  directory(directoryPath: string): ValidationDirectoryProof | undefined
  current(entry: ProjectFileSetCacheEntry, overlays: readonly string[], control: SemanticOperationControl): boolean
}

/** No cross-request cached validity: replay original directory and file identities around the
 * final fence. A body-only change cannot hide behind unchanged directory times.
 * Injected/partial catalogs never supply this native enumeration proof. */
export function captureCompleteMembershipProof(entry: Pick<ProjectFileSetCacheEntry, "paths" | "diskIdentities">,
  directories: WorkspaceNamespaceWitness, scopeCurrent: () => boolean, checkpoint: () => void = () => {}): CompleteMembershipProof {
  const paths = [...entry.paths]
  const tokens = new Map(entry.diskIdentities)
  const overlayOnly = paths.filter(file => !tokens.has(file))
  const names = new Map<string, { entries: Set<string>; bytes: number; physicalPath?: string }>()
  for (const file of tokens.keys()) {
    checkpoint()
    const parent = path.dirname(file), record = names.get(parent) ?? { entries: new Set<string>(), bytes: 0,
      physicalPath: directories.directoryProof(parent)?.physicalPath }
    const name = path.basename(file)
    record.entries.add(name); record.bytes += 64 + 2 * name.length; names.set(parent, record)
  }
  return proofFromEvidence({ paths, tokens, overlayOnly, names, directories, scopeCurrent })
}

interface MembershipEvidence {
  readonly paths: readonly string[]
  readonly tokens: ReadonlyMap<string, string>
  readonly overlayOnly: readonly string[]
  readonly names: ReadonlyMap<string, { readonly entries: ReadonlySet<string>; readonly bytes: number; readonly physicalPath?: string }>
  readonly directories: WorkspaceNamespaceWitness
  readonly scopeCurrent: () => boolean
}

/** Each admitted source generation owns a distinct proof. Shared namespace facts
 * remain original; every current/final file and namespace observation still runs. */
function proofFromEvidence(evidence: MembershipEvidence): CompleteMembershipProof {
  const { paths, tokens, overlayOnly, names, directories, scopeCurrent } = evidence
  const owner = {}
  let invalidated = false
  const reject = () => { invalidated = true; return false }
  const matchesCatalog = (current: ProjectFileSetCacheEntry, control: SemanticOperationControl) => {
    if (current.status !== "complete" || current.paths.length !== paths.length
      || current.diskIdentities.size !== tokens.size) return false
    for (let index = 0; index < paths.length; index++) {
      control.checkpoint(); if (current.paths[index] !== paths[index]) return false
    }
    for (const [file, token] of tokens) {
      control.checkpoint(); if (current.diskIdentities.get(file) !== token) return false
    }
    return true
  }
  const directory = (directoryPath: string) => {
    if (invalidated) return undefined
    const proof = directories.directoryProof(directoryPath)
    const entries = proof && names.get(proof.path)
    return proof && entries ? { physicalPath: proof.physicalPath, names: entries.entries, current: proof.current,
      bytes: 512 + 2 * (proof.path.length + proof.physicalPath.length) + entries.bytes } : undefined
  }
  return { get invalidated() { return invalidated }, invalidate() { invalidated = true }, matchesCatalog, directory,
    renew(current, changedPaths, control) {
      if (invalidated || current.status !== "complete" || current.paths.length !== paths.length
        || current.diskIdentities.size !== tokens.size || !changedPaths.length) return undefined
      for (let index = 0; index < paths.length; index++) {
        control.checkpoint()
        if (paths[index] !== current.paths[index]) return undefined
      }
      const changed = new Set(changedPaths)
      for (const file of changed) if (!tokens.has(file) || !current.diskIdentities.has(file)) return undefined
      for (const [file, token] of current.diskIdentities) {
        control.checkpoint()
        if (!tokens.has(file) || !changed.has(file) && tokens.get(file) !== token) return undefined
      }
      const nextTokens = new Map(tokens)
      for (const file of changed) nextTokens.set(file, current.diskIdentities.get(file)!)
      // Retire BEFORE handing out a replacement: an old request cannot acquire
      // the new source generation even when an edit is later undone.
      invalidated = true
      return proofFromEvidence({ ...evidence, tokens: nextTokens })
    }, current(current, overlays, control) {
    if (invalidated) return false
    const valid = validateRequestInput(owner, 0, current.revision, () => {
      if (invalidated) return false
      try {
        control.checkpoint()
        const activeOverlays = new Set(overlays)
        if (current.status !== "complete" || current.paths.length !== paths.length
          || !paths.every((file, index) => current.paths[index] === file)
          || current.diskIdentities.size !== tokens.size
          || overlayOnly.some(file => !activeOverlays.has(file))
          || !scopeCurrent() || !directories.current(control)) return reject()
        for (const [file, token] of tokens) {
          control.checkpoint()
          if (current.diskIdentities.get(file) !== token) return reject()
          // This native owner retains its independent raw final leaf check.
          const stat = fs.lstatSync(file)
          if (!stat.isFile() || stat.size > MAX_DISK_SNAPSHOT_BYTES || sourceStatIdentity(stat) !== token) return reject()
          if (Number.isSafeInteger(stat.ino) && stat.ino > 0 && Number.isSafeInteger(stat.dev) && stat.dev >= 0) {
            const physicalParent = names.get(path.dirname(file))?.physicalPath
            if (physicalParent) retainPendingRegularSourceObservation(file, physicalParent, token, owner, 0, current.revision, stat.mode)
          }
        }
        // Namespace or eligibility changes during the file pass cannot authorize
        // the previous set, even when all old file identities still match.
        return directories.current(control) && scopeCurrent() || reject()
      } catch { control.checkpoint(); return reject() }
    }, "membership")
    if (valid) retainValidationSourceDirectories(owner, directory)
    return valid
  } }
}
