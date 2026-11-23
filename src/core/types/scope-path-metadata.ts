import path from "node:path"
import { resolvedPathIdentity } from "../../project/path-identity.js"

interface ScopePathMetadata {
  readonly entries: readonly (readonly [identity: string, file: string])[]
  readonly byIdentity: ReadonlyMap<string, string>
}

// Derived lexical metadata only. Weak ownership follows the immutable group
// list; no content, filesystem observations, Program or validity is retained.
const immutable = new WeakMap<readonly string[], ScopePathMetadata>()

export function scopePathMetadata(paths: readonly string[]): ScopePathMetadata {
  const frozen = Object.isFrozen(paths)
  const retained = frozen ? immutable.get(paths) : undefined
  if (retained) return retained
  const entries = Object.freeze(paths.map(file => Object.freeze([resolvedPathIdentity(file), file] as const)))
  const metadata = Object.freeze({ entries, byIdentity: new Map(entries) })
  // A relative spelling depends on cwd. Mutable callers retain fresh derivation,
  // including duplicate aliases and the original Map's last-spelling rule.
  if (frozen && paths.every(file => path.isAbsolute(file))) immutable.set(paths, metadata)
  return metadata
}
