import path from "node:path"
import type { ProjectSourceRole } from "./project-source-role.js"

export interface ScopeRoleDelta {
  readonly before: ReadonlyMap<string, ProjectSourceRole>
  readonly after: ReadonlyMap<string, ProjectSourceRole>
  readonly files: readonly string[]
}
const issued = new WeakSet<object>()

/** Issued only after the private fact producer completes its entire known delta.
 * These maps are immutable producer snapshots. This is lineage, not freshness:
 * independent source, binding and final proofs still observe actual inputs. */
export function createScopeRoleDelta(before: ReadonlyMap<string, ProjectSourceRole>,
  after: ReadonlyMap<string, ProjectSourceRole>, files: readonly string[]): ScopeRoleDelta | undefined {
  if (before.size !== after.size || files.some(file => !path.isAbsolute(file)
    || !before.has(file) || !after.has(file))) return undefined
  const delta = Object.freeze({ before, after, files: Object.freeze([...new Set(files)]) })
  issued.add(delta)
  return delta
}

export function isScopeRoleDelta(value: unknown, before: ReadonlyMap<string, ProjectSourceRole> | undefined,
  after: ReadonlyMap<string, ProjectSourceRole>): value is ScopeRoleDelta {
  if (!value || typeof value !== "object" || !issued.has(value)) return false
  const delta = value as ScopeRoleDelta
  return delta.before === before && delta.after === after
}
