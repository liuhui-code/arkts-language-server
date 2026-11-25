import type { SemanticReadinessQuery, SemanticReadinessReport } from "../../contracts/semantic-readiness.js"
import type { WorkspaceReferenceIndexPort } from "../../contracts/workspace-index.js"
import type { ReferenceResultCache } from "./reference-result-cache.js"
import type { ReferenceInputState } from "./reference-input-snapshot.js"
import type { ReferenceIndexFreshness } from "./reference-index-freshness.js"
import { ReferenceNamespaceAdmission } from "./reference-namespace-admission.js"

/** Wire semantic invalidation separately from index input reconciliation.
 * Current versioned bytes need no new epoch; unknown/legacy inputs keep recovery. */
export function createReferenceNamespaceAdmission(input: {
  readonly readiness: (query: SemanticReadinessQuery) => Promise<SemanticReadinessReport>
  readonly results: Pick<ReferenceResultCache, "invalidateRoot">
  readonly inputs: ReferenceInputState
  readonly freshness: ReferenceIndexFreshness
  readonly index: WorkspaceReferenceIndexPort | undefined
  readonly reconcile: ((rootUri: string, kind: "namespace" | "content") => void) | undefined
}): ReferenceNamespaceAdmission {
  const { index, reconcile, freshness } = input
  return new ReferenceNamespaceAdmission(input.readiness, root => {
    input.results.invalidateRoot(root)
    input.inputs.changed(root)
  }, (root, kind) => {
    if (index && reconcile) {
      freshness.changed(root, index)
      reconcile(root, kind)
    }
  }, index && reconcile ? (root, fingerprint, signal) =>
    freshness.confirmsCurrentSources(root, index, fingerprint, signal) : undefined)
}
