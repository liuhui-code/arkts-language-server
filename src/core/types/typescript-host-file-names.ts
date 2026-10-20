/** Keep the host's admitted roots distinct from resident overlays and SDK roots. */
export function compilerHostFileNames(
  membershipFiles: string[],
  hasSemanticRoots: boolean,
  scriptPaths: Iterable<string>,
  membershipPaths: ReadonlySet<string>,
  sdkPaths: readonly string[],
): string[] {
  if (hasSemanticRoots) return membershipFiles
  const extras = [...scriptPaths].filter(filePath => (
    !membershipPaths.has(filePath) && !sdkPaths.includes(filePath)
  ))
  return extras.length === 0 ? membershipFiles : [...extras, ...membershipFiles]
}

/** Semantic groups and complete inferred projects retain their own legal root list. */
export function membershipHostFileNames(semanticRoots: ReadonlySet<string> | undefined,
  membershipComplete: boolean, membershipPaths: ReadonlySet<string>, sdkPaths: readonly string[]): string[] {
  const roots = semanticRoots ?? (membershipComplete ? membershipPaths : new Set<string>())
  return [...roots, ...sdkPaths.filter(filePath => !roots.has(filePath))]
}
