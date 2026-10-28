import type { LocalPackageResolver } from "../sdk/local-package-resolver.js"

/** Server-only compiler recipe. The LSP adapter exposes its own authenticated ticket. */
export function compilerCompletionData(resolver: LocalPackageResolver, engineVersion: string,
  documentVersion: number | undefined, entry: { name: string; source?: string; data?: unknown },
  discoveryCandidateUris?: readonly string[]): Record<string, unknown> {
  return {
    provider: "typescript", engineVersion, documentVersion,
    resolutionNamespace: resolver.namespaceIdentity,
    entryName: entry.name, entrySource: entry.source, entryData: entry.data,
    ...(discoveryCandidateUris?.length
      ? { discoveryCandidateUris: [...new Set(discoveryCandidateUris)].sort() } : {}),
  }
}

export function completionNamespaceCurrent(resolver: LocalPackageResolver,
  item: { readonly data?: Readonly<Record<string, unknown>> }): boolean {
  const namespace = item.data?.resolutionNamespace
  // Other providers and legacy internal recipes retain their existing validation.
  return typeof namespace !== "string" || namespace === resolver.namespaceIdentity
}
