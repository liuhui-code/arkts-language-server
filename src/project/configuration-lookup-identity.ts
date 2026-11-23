import fs from "node:fs"
import path from "node:path"
import type { ConfigurationInputIdentity } from "./request-input-validation.js"

const MAX_MISSING_ANCESTORS = 64

/** Include lexical links and genuine absence, including its existing parent owner. */
export function lookupIdentity(filePath: string, directoryIdentityOnly = false): ConfigurationInputIdentity | undefined {
  let candidate = filePath
  const missing: string[] = []
  for (let depth = 0; depth < MAX_MISSING_ANCESTORS; depth += 1) {
    try {
      const lexical = fs.lstatSync(candidate, { throwIfNoEntry: false })
      if (!lexical) {
        // Keep the second absence observation; avoid allocating ENOENT errors.
        if (fs.lstatSync(candidate, { throwIfNoEntry: false })) return undefined
        const parent = path.dirname(candidate)
        if (parent === candidate) return undefined
        missing.push(path.basename(candidate))
        candidate = parent
        continue
      }
      const physical = fs.realpathSync.native(candidate)
      const target = fs.statSync(candidate)
      const link = lexical.isSymbolicLink() ? fs.readlinkSync(candidate) : null
      const owner = [candidate, missing, physical, link]
      // Keep full before/after guards, including an absent path's owner:
      // a missing → present → missing load window is not negative evidence.
      const loadGuard = JSON.stringify([...owner, stamp(lexical, false), stamp(target, false)])
      // The first absent ancestor already proves every descendant absent.
      // Retain that actual lstat evidence once, not a guessed directory listing.
      // Creation/retargeting of it still invalidates every dependent lookup.
      const absent = missing.at(-1)
      const absenceOwner = absent !== undefined && target.isDirectory()
        ? [candidate, JSON.stringify([candidate, [], physical, link, stamp(lexical, false), stamp(target, false)])] as const
        : undefined
      return { loadGuard, absenceOwner, regularSource: absent === undefined && lexical.isFile() && target.isFile(),
        witnessPath: absent === undefined ? filePath : path.join(candidate, absent),
        identity: absent === undefined ? directoryIdentityOnly && target.isDirectory()
          ? JSON.stringify([...owner, stamp(lexical, true), stamp(target, true)]) : loadGuard
          : JSON.stringify([candidate, [absent], physical, link, stamp(lexical, true), stamp(target, true)]) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return undefined
      // ENOENT from an existing dangling link is not an absence witness.
      try {
        if (fs.lstatSync(candidate, { throwIfNoEntry: false })) return undefined
      }
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
  // Rewalk the observed absent ancestor; unrelated siblings do not change absence.
  // Directly observed/enumerated directories and all files retain full stamps.
  return missingChild && stat.isDirectory()
    ? entity
    : [...entity, stat.size, stat.mtimeMs, stat.ctimeMs]
}
