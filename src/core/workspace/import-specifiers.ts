/** Preserve the existing regex captures while excluding an impossible quote-free suffix. */
export function extractImportSpecifiers(content: string): string[] {
  const end = Math.max(content.lastIndexOf("'"), content.lastIndexOf('"')) + 1
  if (end === 0) return []
  // Every successful match ends in a quote; the caller consumes captures, never match.input.
  return [...content.slice(0, end).matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => Boolean(specifier))
}
