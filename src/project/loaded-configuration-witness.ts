import fs from "node:fs"
import path from "node:path"

const MAX_WITNESS_PATHS = 4096
const MAX_MISSING_ANCESTORS = 64

/** Evidence belongs to the actual load/lookup, never to a later cache hit. */
export class LoadedConfigurationWitness {
  private readonly identities = new Map<string, string>()
  private revision = 0
  private unprovable = false

  observe<T>(filePath: string, load: () => T): T {
    const resolved = path.resolve(filePath)
    const before = lookupIdentity(resolved)
    try { return load() }
    finally {
      const after = lookupIdentity(resolved)
      if (!before || after?.loadGuard !== before.loadGuard) this.markUnprovable()
      else {
        const previous = this.identities.get(resolved)
        if (previous !== undefined && previous !== before.identity) this.markUnprovable()
        else if (previous === undefined) {
          if (this.identities.size >= MAX_WITNESS_PATHS) this.markUnprovable()
          else { this.identities.set(resolved, before.identity); this.revision += 1 }
        }
      }
    }
  }

  markUnprovable(): void {
    if (!this.unprovable) { this.unprovable = true; this.revision += 1 }
  }

  reset(): void {
    this.identities.clear()
    this.unprovable = false
    this.revision += 1
  }

  /** The returned predicate retains the loaded identities, not newly stamped ones. */
  freshness(checkpoint: () => void): (() => boolean) | undefined {
    if (this.unprovable) return undefined
    const revision = this.revision
    const identities = [...this.identities]
    const current = (): boolean => {
      checkpoint()
      if (this.unprovable || this.revision !== revision) return false
      for (const [filePath, identity] of identities) {
        checkpoint()
        if (lookupIdentity(filePath)?.identity !== identity) return false
      }
      checkpoint()
      return !this.unprovable && this.revision === revision
    }
    return current() ? current : undefined
  }
}

/** Include lexical links and genuine absence, including its existing parent owner. */
function lookupIdentity(filePath: string): { identity: string; loadGuard: string } | undefined {
  let candidate = filePath
  const missing: string[] = []
  for (let depth = 0; depth < MAX_MISSING_ANCESTORS; depth += 1) {
    try {
      const lexical = fs.lstatSync(candidate)
      const physical = fs.realpathSync.native(candidate)
      const target = fs.statSync(candidate)
      const owner = [candidate, missing, physical,
        lexical.isSymbolicLink() ? fs.readlinkSync(candidate) : null]
      // Keep full before/after guards, including an absent path's owner:
      // a missing → present → missing load window is not negative evidence.
      const loadGuard = JSON.stringify([...owner, stamp(lexical, false), stamp(target, false)])
      return { loadGuard, identity: missing.length === 0 ? loadGuard
        : JSON.stringify([...owner, stamp(lexical, true), stamp(target, true)]) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return undefined
      // ENOENT from an existing dangling link is not an absence witness.
      try { fs.lstatSync(candidate); return undefined }
      catch (missingError) {
        if ((missingError as NodeJS.ErrnoException).code !== "ENOENT") return undefined
      }
      const parent = path.dirname(candidate)
      if (parent === candidate) return undefined
      missing.push(path.basename(candidate))
      candidate = parent
    }
  }
  return undefined
}

function stamp(stat: fs.Stats, missingChild: boolean): readonly unknown[] {
  const entity = [stat.dev, stat.ino, stat.mode]
  // Rewalk the exact absence chain; unrelated siblings do not change absence.
  // Directly observed/enumerated directories and all files retain full stamps.
  return missingChild && stat.isDirectory()
    ? entity
    : [...entity, stat.size, stat.mtimeMs, stat.ctimeMs]
}
