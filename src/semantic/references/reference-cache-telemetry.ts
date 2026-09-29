import type { StructuredLogger } from "../../observability/logger.js"
import type { ReferenceResultCache } from "./reference-result-cache.js"

export function logReferenceCache(
  logger: StructuredLogger | undefined,
  cache: ReferenceResultCache,
  event: "references.cache.hit" | "references.cache.miss" | "references.cache.store",
  traceId: string | undefined,
  locations?: number,
): void {
  if (!logger) return
  const { entries, bytes } = cache.stats()
  logger.info(event, {
    traceId,
    cacheEntries: entries,
    cacheBytes: bytes,
    ...(locations === undefined ? {} : { locations }),
  })
}
