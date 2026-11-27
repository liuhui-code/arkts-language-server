import { sourceReferenceAdmission } from "./source-reference-admission.js"
import { hasSourceReferenceCandidate, sourceReferenceAuthority } from "./source-reference-input.js"
import { hasLexicalReferenceCandidate } from "./reference-lexical-candidate-hint.js"
import { randomUUID } from "node:crypto"
import type { DocumentSnapshot } from "../../contracts/document.js"
import type { SemanticReferencesQuery, SemanticReferencesOutcome, VersionedSemanticResult } from "../../contracts/semantic-engine.js"
import type { SemanticReadinessQuery, SemanticReadinessReport } from "../../contracts/semantic-readiness.js"
import type { StructuredLogger } from "../../observability/logger.js"
import type { SemanticWorkerReferencesArgs } from "../worker-protocol.js"
import type { ReferenceCandidateSelection } from "./reference-candidate-selection.js"
import type { ReferenceInputState, ReferenceInputSnapshot } from "./reference-input-snapshot.js"
import type { ReferenceResultCache } from "./reference-result-cache.js"
import { referenceCacheAdmission } from "./reference-cache-admission.js"
import { logReferenceCache } from "./reference-cache-telemetry.js"
import { routeReferenceQuery } from "./reference-query-router.js"
import { referenceSearchRuntimeConfig } from "./reference-runtime.js"

interface ReferenceQueryEntry {
  readonly environment: NodeJS.ProcessEnv
  readonly logger?: StructuredLogger
  readonly cache: ReferenceResultCache
  readonly inputs: ReferenceInputState
  readonly projectConfiguration: unknown
  readonly sdkConfiguration: unknown
  readonly queriedRoots: ReadonlySet<string>
  documents(): Iterable<DocumentSnapshot>
  cached(query: SemanticReferencesQuery, traceId?: string): VersionedSemanticResult<SemanticReferencesOutcome> | undefined
    | Promise<VersionedSemanticResult<SemanticReferencesOutcome> | undefined>
  readiness(query: SemanticReadinessQuery): Promise<SemanticReadinessReport>
  assertCurrent(snapshot: Pick<ReferenceInputSnapshot, "rootUri" | "rootRevision" | "configurationRevision">): void
  candidates(query: SemanticReferencesQuery, snapshot: ReferenceInputSnapshot, traceId?: string): Promise<ReferenceCandidateSelection | undefined>
  forceLegacy(rootUri: string): boolean
  dispatch(query: SemanticReferencesQuery, args: SemanticWorkerReferencesArgs): Promise<VersionedSemanticResult<SemanticReferencesOutcome | null>>
  retry(query: SemanticReferencesQuery): Promise<VersionedSemanticResult<SemanticReferencesOutcome>>
}

/** Request-local routing; Worker lifetime and shared state remain with the proxy. */
export async function runWorkerReferenceQuery(query: SemanticReferencesQuery, entry: ReferenceQueryEntry) {
  query = Object.freeze({ ...query, document: Object.freeze({ ...query.document }),
    position: Object.freeze({ ...query.position }) })
  const traceId = entry.environment.ARKTS_REFERENCES_TRACE === "1" ? randomUUID() : undefined
  const cached = await entry.cached(query, traceId)
  if (cached) return cached
  const runtime = referenceSearchRuntimeConfig(entry.environment)
  const sourceCandidate = runtime.strategy === "indexed-batched" && runtime.residentFastPath && hasSourceReferenceCandidate(query)
  if (sourceCandidate) {
    logReferenceCache(entry.logger, entry.cache, "references.cache.miss", traceId)
    const result = await sourceReferenceAdmission(query, { inputs: entry.inputs,
      assertCurrent: value => entry.assertCurrent(value), dispatch: args => entry.dispatch(query, args),
      cache: entry.cache, logger: entry.logger, traceId, sourceAllowed: () => sourceReferenceAuthority(query, entry.documents()) })
    if (result) return result
  }
  const cacheAdmission = await referenceCacheAdmission(query, entry.readiness, runtime.strategy !== "legacy")
  const snapshot = entry.inputs.capture(query.document.workspaceId,
    entry.documents(), entry.projectConfiguration, entry.sdkConfiguration)
  if (!sourceCandidate) logReferenceCache(entry.logger, entry.cache, "references.cache.miss", traceId)
  return routeReferenceQuery(query, {
    traceId, logger: entry.logger, cache: entry.cache, cacheAdmission, strategy: runtime.strategy,
    preferQualified: runtime.strategy === "indexed-batched" && runtime.residentFastPath
      && hasLexicalReferenceCandidate(query),
    preferResident: entry.queriedRoots.has(query.document.workspaceId) && runtime.residentFastPath
      && (entry.environment.ARKTS_REFERENCES_RESIDENT_FIRST ?? "1") === "1",
    assertCurrent: () => entry.assertCurrent(snapshot),
    selectCandidates: () => entry.candidates(query, snapshot, traceId),
    forceLegacy: () => entry.forceLegacy(query.document.workspaceId),
    dispatch: args => entry.dispatch(query, args), retryWithoutSeed: () => entry.retry(query),
  })
}
