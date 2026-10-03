import path from "node:path"

interface OverlayAuthorityRecord {
  path: string
  physicalPath: string
  overlayOrder: number
  overlay: boolean
}

/** Select the text authority for each physical file without changing lexical URI ownership. */
export function projectOverlayAuthority<T extends OverlayAuthorityRecord>(
  rootPath: string,
  canonicalRoot: string,
  overlays: readonly T[],
  current: T,
): {
  overlayPaths: Map<string, string>
  authoritativeOverlayPaths: Set<string>
  shadowedPaths: Set<string>
} {
  const authoritativeOverlays = new Map<string, T>()
  for (const record of overlays) {
    const previous = authoritativeOverlays.get(record.physicalPath)
    if (!previous || record.overlayOrder > previous.overlayOrder) {
      authoritativeOverlays.set(record.physicalPath, record)
    }
  }
  // The freshest overlay wins for other documents; an older open alias sees its own text.
  if (current.overlay) authoritativeOverlays.set(current.physicalPath, current)
  const overlayPaths = new Map(
    [...authoritativeOverlays].map(([physicalPath, record]) => [physicalPath, record.path]),
  )
  const authoritativeOverlayPaths = new Set(overlayPaths.values())
  const shadowedPaths = new Set([
    ...[...overlayPaths].flatMap(([physicalPath, overlayPath]) => {
      const relative = path.relative(canonicalRoot, physicalPath)
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        return []
      }
      const lexicalPath = path.resolve(rootPath, relative)
      return lexicalPath !== overlayPath ? [lexicalPath] : []
    }),
    ...overlays.flatMap((record) => (
      authoritativeOverlayPaths.has(record.path) ? [] : [record.path]
    )),
  ])
  return { overlayPaths, authoritativeOverlayPaths, shadowedPaths }
}

export function appendAuthoritativeOverlays<T extends OverlayAuthorityRecord>(
  closure: Array<{ record: T; cacheHit: boolean }>,
  overlays: readonly T[],
  authoritativePaths: ReadonlySet<string>,
  loadedPaths: Set<string>,
  isActive: (sourcePath: string) => boolean,
): string[] {
  const excluded: string[] = []
  for (const record of overlays) {
    if (!authoritativePaths.has(record.path)) {
      excluded.push(record.path)
      continue
    }
    if (loadedPaths.has(record.path)) continue
    if (!isActive(record.path)) {
      excluded.push(record.path)
      continue
    }
    closure.push({ record, cacheHit: true })
    loadedPaths.add(record.path)
  }
  return excluded
}

export function withoutShadowedPaths<T extends { paths: readonly string[] }>(
  membership: T,
  shadowedPaths: ReadonlySet<string>,
): T {
  if (shadowedPaths.size === 0) return membership
  const paths = membership.paths.filter(sourcePath => !shadowedPaths.has(sourcePath))
  return paths.length === membership.paths.length ? membership : { ...membership, paths }
}
