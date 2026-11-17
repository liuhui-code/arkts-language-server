import type { SemanticReferencesQuery, SemanticReferencesOutcome, VersionedSemanticResult } from "../../contracts/semantic-engine.js"
import type { SemanticReadinessQuery, SemanticReadinessReport } from "../../contracts/semantic-readiness.js"
import type { ReferenceResultCache } from "./reference-result-cache.js"

type ReadReadiness = (query: SemanticReadinessQuery) => Promise<SemanticReadinessReport>

/** Both open and disk answers require the current complete source namespace and Program proof. */
export function cachedReferenceResult(query: SemanticReferencesQuery, cache: ReferenceResultCache,
  readReadiness: ReadReadiness, onHit: () => void) {
  const entry = cache.getWithProof(query)
  if (!entry) return undefined
  const publish = (): VersionedSemanticResult<SemanticReferencesOutcome> => {
    onHit()
    return { documentVersion: query.document.version, value: entry.result }
  }
  return diskReferenceProof(query, readReadiness).then(proof =>
    proof !== undefined && proof === entry.inputProof && !query.signal?.aborted ? publish() : undefined)
}

/** Bind storage to the same complete proof before and after the original query. */
export async function referenceCacheAdmission(query: SemanticReferencesQuery, readReadiness: ReadReadiness,
  requiresSourceAdmission = true) {
  const capture = requiresSourceAdmission ? true : "cache"
  const before = await diskReferenceProof(query, readReadiness, capture)
  return async () => {
    const after = await diskReferenceProof(query, readReadiness, capture)
    return before !== undefined && before === after ? before : undefined
  }
}

async function diskReferenceProof(query: SemanticReferencesQuery, readReadiness: ReadReadiness,
  captureSourceInputs: NonNullable<SemanticReadinessQuery["captureSourceInputs"]> = true) {
  const rootUri = query.document.source?.rootUri ?? query.document.workspaceId
  if (!rootUri || query.signal?.aborted) return undefined
  const report = await readReadiness({ rootUri, prepare: false, captureSourceInputs, signal: query.signal })
  const capability = `references:includeDeclaration=${query.includeDeclaration}`
  return !query.signal?.aborted && report.rootUri === rootUri && report.semanticState === "ready"
    && typeof report.semanticGeneration === "string" && report.semanticGeneration.length > 0
    && report.sourceNamespace?.diskSha256 && report.inputIdentity && report.coverage?.dependenciesComplete === true
    && report.readyCapabilities.includes(capability)
    ? `${report.semanticGeneration}:${report.inputIdentity.sha256}:${report.sourceNamespace.sha256}:${report.sourceNamespace.diskSha256}` : undefined
}
