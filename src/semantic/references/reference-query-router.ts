import type { SemanticReferencesQuery, SemanticReferencesOutcome, VersionedSemanticResult } from "../../contracts/semantic-engine.js"
import type { StructuredLogger } from "../../observability/logger.js"
import type { SemanticWorkerReferencesArgs } from "../worker-protocol.js"
import type { ReferenceCandidateSelection } from "./reference-candidate-selection.js"
import type { ReferenceSearchStrategy } from "./reference-runtime.js"
import type { ReferenceResultCache } from "./reference-result-cache.js"
import { logReferenceCache } from "./reference-cache-telemetry.js"
import { logReferenceCandidateSelection } from "./reference-index-telemetry.js"

interface ReferenceQueryRoute {
  readonly traceId?: string
  readonly logger?: StructuredLogger
  readonly strategy: ReferenceSearchStrategy
  readonly preferResident: boolean
  readonly cache: ReferenceResultCache
  readonly cacheAdmission?: () => Promise<string | undefined>
  assertCurrent(): void
  selectCandidates(): Promise<ReferenceCandidateSelection | undefined>
  forceLegacy(): boolean
  dispatch(args: SemanticWorkerReferencesArgs): Promise<VersionedSemanticResult<SemanticReferencesOutcome | null>>
  retryWithoutSeed(): Promise<VersionedSemanticResult<SemanticReferencesOutcome>>
}

/** One request's route and publication fences; all state remains with the existing proxy. */
export async function routeReferenceQuery(query: SemanticReferencesQuery, route: ReferenceQueryRoute) {
  const base = { position: query.position, includeDeclaration: query.includeDeclaration,
    ...(route.traceId ? { traceId: route.traceId } : {}) }
  if (route.preferResident && route.strategy !== "legacy") {
    route.assertCurrent()
    const resident = await route.dispatch({ ...base, retainedOnly: true })
    route.assertCurrent()
    if (resident.value !== null) return publishReferenceResult(query,
      { documentVersion: resident.documentVersion, value: resident.value }, route)
  }
  const selectionStarted = performance.now()
  const candidates = await route.selectCandidates()
  route.assertCurrent()
  logReferenceCandidateSelection(route.logger, route.strategy, route.traceId, selectionStarted, candidates)
  const response = await route.dispatch({
    ...base,
    ...(route.forceLegacy() ? { forceLegacy: true } : {}),
    ...(candidates ? {
      candidateUris: candidates.uris,
      candidateIdentityComplete: candidates.identityComplete,
      ...(candidates.anchorUri ? { candidateAnchorUri: candidates.anchorUri } : {}),
      ...(candidates.anchorPosition ? { candidateAnchorPosition: candidates.anchorPosition } : {}),
      ...(candidates.supportUris ? { candidateSupportUris: candidates.supportUris } : {}),
    } : {}),
  })
  route.assertCurrent()
  if (response.value === null) throw new Error("Reference fallback returned a resident-only miss")
  if (candidates?.anchorPosition && response.value.status === "incomplete"
    && response.value.reason !== "resource-budget-exceeded") {
    route.logger?.info("references.anchor.seed.fallback", { traceId: route.traceId, reason: response.value.reason })
    return route.retryWithoutSeed()
  }
  return publishReferenceResult(query, { documentVersion: response.documentVersion, value: response.value }, route)
}

async function publishReferenceResult(query: SemanticReferencesQuery,
  response: VersionedSemanticResult<SemanticReferencesOutcome>, route: ReferenceQueryRoute) {
  if (query.signal?.aborted || response.value.status !== "complete") return response
  const inputProof = route.cacheAdmission ? await route.cacheAdmission() : undefined
  if (!query.signal?.aborted && (!route.cacheAdmission || inputProof !== undefined)
    && route.cache.set(query, response.value, inputProof)) {
    logReferenceCache(route.logger, route.cache, "references.cache.store", route.traceId,
      response.value.status === "complete" ? response.value.references.length : 0)
  }
  return response
}
