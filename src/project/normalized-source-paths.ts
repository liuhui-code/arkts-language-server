import path from "node:path"

// Weak ownership follows the immutable catalog/root list, never Program or AST
// residency. This is lexical metadata only; every disk/currentness fence remains.
const immutable = new WeakMap<readonly string[], readonly string[]>()

export function normalizedSourcePaths(paths: readonly string[]): readonly string[] {
  const retained = Object.isFrozen(paths) ? immutable.get(paths) : undefined
  if (retained) return retained
  const normalized = Object.freeze([...new Set(paths.map(file => path.resolve(file)))].sort())
  if (Object.isFrozen(paths)) immutable.set(paths, normalized)
  immutable.set(normalized, normalized)
  return normalized
}
