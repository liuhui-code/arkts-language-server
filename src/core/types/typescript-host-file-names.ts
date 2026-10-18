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
