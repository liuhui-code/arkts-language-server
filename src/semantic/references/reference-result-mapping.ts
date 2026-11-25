import { readReferenceQueryProof, type ReferenceQueryProof } from "../../contracts/reference-query-proof.js"
import { pathToFileURL } from "node:url"
import type { SemanticReferencesOutcome, VersionedSemanticResult } from "../../contracts/semantic-engine.js"
import type { SemanticReferenceQueryResult } from "../../core/types/type-engine.js"
import type { SemanticDefinitionCandidate } from "../../core/protocol.js"
import { MAX_SEMANTIC_WORKER_MESSAGE_BYTES, MAX_SEMANTIC_WORKER_VALUE_NODES } from "../worker-protocol.js"

export function publicReferenceResult(
  documentVersion: number, result: SemanticReferenceQueryResult,
): VersionedSemanticResult<SemanticReferencesOutcome> {
  if (result.status !== "complete") return { documentVersion, value: result }
  const references = mapReferences(result.references)
  const otherReferences = result.otherReferences && mapReferences(result.otherReferences)
  const receipt = readReferenceQueryProof(result.queryProof)
  const queryProof = receipt && proofWithinResponse(references, receipt) ? receipt : undefined
  const reusable = otherReferences && reusableWithinResponse(references, otherReferences, queryProof)
  return {
    documentVersion,
    value: {
      status: "complete",
      references,
      ...(queryProof ? { queryProof } : {}),
      ...(reusable ? { otherReferences } : {}),
    },
  }
}

function reusableWithinResponse(references: ReturnType<typeof mapReferences>, otherReferences: ReturnType<typeof mapReferences>, queryProof?: ReferenceQueryProof) {
  // Each Location has nine JSON values. Optional reuse must not crowd out the primary result.
  if (4 + (queryProof ? receiptNodes(queryProof) : 0) + 9 * (references.length + otherReferences.length) > MAX_SEMANTIC_WORKER_VALUE_NODES) return false
  const value = { status: "complete", references, otherReferences, ...(queryProof ? { queryProof } : {}) }
  return Buffer.byteLength(JSON.stringify(value)) <= MAX_SEMANTIC_WORKER_MESSAGE_BYTES - 1024
}

function mapReferences(references: readonly SemanticDefinitionCandidate[]) {
  return references.map(reference => ({
    uri: pathToFileURL(reference.path).href,
    range: {
      start: { line: reference.range.startLine - 1, character: reference.range.startColumn - 1 },
      end: { line: reference.range.endLine - 1, character: reference.range.endColumn - 1 },
    },
  }))
}

function proofWithinResponse(references: ReturnType<typeof mapReferences>, queryProof: ReferenceQueryProof): boolean {
  // Optional metadata must not crowd a previously legal primary result out of the wire budget.
  return 4 + receiptNodes(queryProof) + 9 * references.length <= MAX_SEMANTIC_WORKER_VALUE_NODES
    && Buffer.byteLength(JSON.stringify({ status: "complete", references, queryProof })) <= MAX_SEMANTIC_WORKER_MESSAGE_BYTES - 1024
}

/** Exact data-only receipt shapes; count nested values as the wire decoder does. */
function receiptNodes(proof: ReferenceQueryProof): number {
  return proof.coverage === "lexical-block" ? 10 : 14 + proof.searchedPaths.length + 4 * proof.facts.length
}
