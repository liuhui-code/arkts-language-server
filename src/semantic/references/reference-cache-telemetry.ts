import { REFERENCE_QUERY_CACHE_PREFIX } from "../../contracts/reference-query-proof.js"
import type { StructuredLogger } from "../../observability/logger.js"
import type { ReferenceResultCache } from "./reference-result-cache.js"

export function logReferenceCache(
  logger: StructuredLogger | undefined,
  cache: ReferenceResultCache,
  event: "references.cache.hit" | "references.cache.miss" | "references.cache.store",
  traceId: string | undefined,
  locations?: number,
  inputProof?: string,
): void {
  if (!logger) return
  const { entries, bytes } = cache.stats()
  logger.info(event, {
    traceId,
    cacheEntries: entries,
    cacheBytes: bytes,
    ...(locations === undefined ? {} : { locations }),
    ...(inputProof === undefined ? {} : inputProof.startsWith(REFERENCE_QUERY_CACHE_PREFIX)
      ? { proofKind: "query-qualified", proofVersion: 1, ...cacheCoverage(inputProof) }
      : { proofKind: "global-ready" }),
  })
}

function cacheCoverage(proof: string): { coverageKind?: string; coverageScope?: string } {
  try {
    const value = JSON.parse(proof.slice(REFERENCE_QUERY_CACHE_PREFIX.length)).proof
    return { coverageKind: value?.coverage, ...(value?.scope ? { coverageScope: value.scope } : {}) }
  } catch { return {} }
}
