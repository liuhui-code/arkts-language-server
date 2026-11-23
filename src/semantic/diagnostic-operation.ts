import type { SemanticDiagnostic, SemanticDocumentQuery, VersionedSemanticResult } from "../contracts/semantic-engine.js"
import type { SemanticDocumentPosition } from "../core/protocol.js"
import type { SemanticTypeQueryContext } from "../core/types/type-engine-contract.js"
import { withSynchronousInputPreparation } from "../project/request-input-validation.js"
import { toPublicRange } from "./legacy-result-mappers.js"

interface DiagnosticPreparation {
  readonly engine: Pick<SemanticTypeQueryContext, "diagnostics">
  readonly position: SemanticDocumentPosition
}

/** Preparation lends original facts to the diagnostic lease's independent final fence. */
export function runDiagnosticQuery(query: SemanticDocumentQuery, ports: {
  sync(): void
  prepare(): DiagnosticPreparation
}): VersionedSemanticResult<SemanticDiagnostic[]> {
  return withSynchronousInputPreparation(() => {
    if (query.signal?.aborted) throw query.signal.reason instanceof Error
      ? query.signal.reason : new Error("Semantic request cancelled")
    ports.sync()
    const prepared = ports.prepare()
    const value = prepared.engine.diagnostics(prepared.position).map(diagnostic => ({
      range: toPublicRange(diagnostic.range), severity: diagnostic.severity,
      code: diagnostic.code, message: diagnostic.message, source: "arkts" as const,
    }))
    return { documentVersion: query.document.version, value }
  })
}
