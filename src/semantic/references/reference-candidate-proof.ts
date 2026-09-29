import type { WorkspaceReferenceCandidateResult } from "../../contracts/workspace-index.js"
import { referenceSourceKind } from "./reference-source-resolution.js"

const MAX_REFERENCE_IDENTITY_SUPPORT_URIS = 64

export function identityReferenceUris(
  result: WorkspaceReferenceCandidateResult,
): readonly string[] {
  if (result.identityComplete && result.identityUris.length > 0) return result.identityUris
  return result.narrowedUris?.length ? result.narrowedUris : result.uris
}

export function identityReferenceSupportUris(
  result: WorkspaceReferenceCandidateResult,
  candidateUris: readonly string[],
): readonly string[] | undefined {
  if (!result.identityComplete || !result.declarationUri) return undefined
  const candidates = new Set(candidateUris)
  const support = new Set([result.declarationUri])
  for (const binding of result.bindings ?? []) {
    if (binding.kind !== "reexport" || !candidates.has(binding.uri)) continue
    if (binding.sourceResolution !== "unique" || !binding.resolvedSourceUri
      || !candidates.has(binding.resolvedSourceUri)) {
      return undefined
    }
    support.add(binding.uri)
    support.add(binding.resolvedSourceUri)
    if (support.size > MAX_REFERENCE_IDENTITY_SUPPORT_URIS) return undefined
  }
  return [...support].sort((left, right) => left.localeCompare(right))
}

export function referenceBindingResolutionSummary(
  result: WorkspaceReferenceCandidateResult,
): string {
  const counts: Record<string, number> = {}
  for (const binding of result.bindings ?? []) {
    const key = `${binding.sourceResolution}:${referenceSourceKind(binding.sourceSpecifier)}`
    counts[key] = (counts[key] ?? 0) + 1
  }
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${key}=${count}`)
    .join(",")
}
