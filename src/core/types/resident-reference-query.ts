import type { SemanticReferenceQueryResult } from "./type-engine-contract.js"
import type { SemanticMemoryLevel } from "../../semantic/coordinator/semantic-coordinator.js"

/** Observe an existing leased attempt; the overlay-sync experiment never creates a context. */
export function queryResidentReferences(query: () => SemanticReferenceQueryResult | undefined,
  logMiss: boolean, memoryLevel: SemanticMemoryLevel,
  trace: (event: string, fields: Readonly<Record<string, string | number | boolean | null>>) => void,
): SemanticReferenceQueryResult | undefined {
  const started = performance.now()
  const resident = query()
  if (resident?.status === "complete") {
    trace("references.resident.hit", {
      durationMs: performance.now() - started, locations: resident.references.length,
      sameProgram: true, completeScope: true, verifierWorkerStarts: 0,
      programBuilds: process.env.ARKTS_REFERENCES_OVERLAY_SYNC === "1" ? null : 0,
    })
    return resident
  }
  if (logMiss) trace("references.resident.miss", { memoryLevel })
  return undefined
}
