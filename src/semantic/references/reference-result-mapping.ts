import { pathToFileURL } from "node:url"
import type { SemanticReferencesOutcome, VersionedSemanticResult } from "../../contracts/semantic-engine.js"
import type { SemanticReferenceQueryResult } from "../../core/types/type-engine.js"

export function publicReferenceResult(
  documentVersion: number, result: SemanticReferenceQueryResult,
): VersionedSemanticResult<SemanticReferencesOutcome> {
  return {
    documentVersion,
    value: result.status === "complete" ? {
      status: "complete",
      references: result.references.map(reference => ({
        uri: pathToFileURL(reference.path).href,
        range: {
          start: { line: reference.range.startLine - 1, character: reference.range.startColumn - 1 },
          end: { line: reference.range.endLine - 1, character: reference.range.endColumn - 1 },
        },
      })),
    } : result,
  }
}
