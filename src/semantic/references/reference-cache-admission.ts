import type { ReferenceCandidateSelection } from "./reference-candidate-selection.js"
import type { SemanticReferencesQuery, SemanticReferencesOutcome, VersionedSemanticResult } from "../../contracts/semantic-engine.js"
import type { SemanticReadinessQuery, SemanticReadinessReport } from "../../contracts/semantic-readiness.js"
import type { ReferenceResultCache } from "./reference-result-cache.js"
import { assertReferenceQueryInputs, hasQueryCacheProof, matchesQueryCacheProof, queryCacheProof, referenceNamespaceKey } from "./reference-query-cache-proof.js"

type ReadReadiness = (query: SemanticReadinessQuery) => Promise<SemanticReadinessReport>

/** Global and query-local evidence have distinct eligibility, the same disk fence. */
export function cachedReferenceResult(query: SemanticReferencesQuery, cache: ReferenceResultCache,
  readReadiness: ReadReadiness, onHit: (inputProof?: string) => void) {
  const entry = cache.getWithProof(query)
  if (!entry) return undefined
  return readDiskAdmission(query, readReadiness).then(current => {
    const valid = hasQueryCacheProof(entry.inputProof)
      ? matchesQueryCacheProof(query, entry.inputProof!, current.namespace)
      : current.global !== undefined && current.global === entry.inputProof
    // readReadiness can invalidate the root while awaiting the fresh observation.
    if (!valid || query.signal?.aborted || cache.getWithProof(query)?.identity !== entry.identity) return undefined
    onHit(entry.inputProof)
    return { documentVersion: query.document.version, value: entry.result } as VersionedSemanticResult<SemanticReferencesOutcome>
  })
}

/** Never elide the final disk read merely because global cache eligibility failed. */
export async function referenceCacheAdmission(query: SemanticReferencesQuery, readReadiness: ReadReadiness,
  requiresSourceAdmission = true) {
  const capture = requiresSourceAdmission ? true : "cache"
  const before = await readDiskAdmission(query, readReadiness, capture)
  return async (result?: SemanticReferencesOutcome, selection?: ReferenceCandidateSelection) => {
    const after = await readDiskAdmission(query, readReadiness, capture)
    if (before.global !== undefined && before.global === after.global) {
      assertReferenceQueryInputs(query, result)
      return before.global
    }
    if (before.namespace !== undefined && before.namespace === after.namespace)
      return queryCacheProof(query, result, after.namespace, selection?.cacheCoverage)
    assertReferenceQueryInputs(query, result)
    return undefined
  }
}

async function readDiskAdmission(query: SemanticReferencesQuery, readReadiness: ReadReadiness,
  captureSourceInputs: NonNullable<SemanticReadinessQuery["captureSourceInputs"]> = true) {
  const rootUri = query.document.source?.rootUri ?? query.document.workspaceId
  if (!rootUri || query.signal?.aborted) return {}
  const report = await readReadiness({ rootUri, prepare: false, captureSourceInputs, signal: query.signal })
  const capability = `references:includeDeclaration=${query.includeDeclaration}`
  const global = !query.signal?.aborted && report.rootUri === rootUri && report.semanticState === "ready"
    && typeof report.semanticGeneration === "string" && report.semanticGeneration.length > 0
    && report.sourceNamespace?.diskSha256 && report.inputIdentity && report.coverage?.dependenciesComplete === true
    && report.readyCapabilities.includes(capability)
    ? `${report.semanticGeneration}:${report.inputIdentity.sha256}:${report.sourceNamespace.sha256}:${report.sourceNamespace.diskSha256}` : undefined
  return { global, namespace: referenceNamespaceKey(query, report) }
}
