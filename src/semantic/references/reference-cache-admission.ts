import type { SemanticReferencesQuery, SemanticReferencesOutcome, VersionedSemanticResult } from "../../contracts/semantic-engine.js"
import type { SemanticReadinessQuery, SemanticReadinessReport } from "../../contracts/semantic-readiness.js"
import type { ReferenceResultCache } from "./reference-result-cache.js"

type ReadReadiness = (query: SemanticReadinessQuery) => Promise<SemanticReadinessReport>

/** Open results keep their existing revision contract; disk results need a current full proof. */
export function cachedReferenceResult(query: SemanticReferencesQuery, cache: ReferenceResultCache,
  readReadiness: ReadReadiness, onHit: () => void) {
  const entry = cache.getWithProof(query)
  if (!entry) return undefined
  const publish = (): VersionedSemanticResult<SemanticReferencesOutcome> => {
    onHit()
    return { documentVersion: query.document.version, value: entry.result }
  }
  if (query.document.source?.kind !== "disk") return publish()
  return diskReferenceProof(query, readReadiness).then(proof =>
    proof !== undefined && proof === entry.inputProof && !query.signal?.aborted ? publish() : undefined)
}

/** Bind storage to the same complete proof before and after the original query. */
export async function referenceCacheAdmission(query: SemanticReferencesQuery, readReadiness: ReadReadiness) {
  const before = await diskReferenceProof(query, readReadiness)
  return async () => before !== undefined && before === await diskReferenceProof(query, readReadiness)
    ? before : undefined
}

async function diskReferenceProof(query: SemanticReferencesQuery, readReadiness: ReadReadiness) {
  const rootUri = query.document.source?.rootUri
  if (!rootUri || query.signal?.aborted) return undefined
  const report = await readReadiness({ rootUri, prepare: false, signal: query.signal })
  const capability = `references:includeDeclaration=${query.includeDeclaration}`
  return !query.signal?.aborted && report.rootUri === rootUri && report.semanticState === "ready"
    && typeof report.semanticGeneration === "string" && report.semanticGeneration.length > 0
    && report.inputIdentity && report.coverage?.dependenciesComplete === true
    && report.readyCapabilities.includes(capability)
    ? `${report.semanticGeneration}:${report.inputIdentity.sha256}` : undefined
}
