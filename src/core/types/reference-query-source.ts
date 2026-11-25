/** Reference lookup updates LRU access only for an existing admitted script. */
export function touchReferenceSource<T extends { lastAccess: number }>(source: T | undefined, nextAccess: () => number): T | undefined {
  if (source) source.lastAccess = nextAccess()
  return source
}
