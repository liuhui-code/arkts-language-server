import type { SemanticReferencesQuery, SemanticReferencesOutcome, VersionedSemanticResult } from "../../contracts/semantic-engine.js"
import type { ReferenceInputState, ReferenceInputSnapshot } from "./reference-input-snapshot.js"
import type { ReferenceResultCache } from "./reference-result-cache.js"
import type { SemanticWorkerReferencesArgs } from "../worker-protocol.js"
import type { StructuredLogger } from "../../observability/logger.js"
import { queryCacheProof } from "./reference-query-cache-proof.js"
import { sourceReferenceInputKey, sourceReferenceCheckpoint } from "./source-reference-input.js"
import { SemanticWorkerSupervisorError } from "../semantic-worker-supervisor-errors.js"
import { logReferenceCache } from "./reference-cache-telemetry.js"

export async function sourceReferenceAdmission(query: SemanticReferencesQuery, ports: {
  inputs: ReferenceInputState
  assertCurrent(snapshot: Pick<ReferenceInputSnapshot, "rootUri" | "rootRevision" | "configurationRevision">): void
  dispatch(args: SemanticWorkerReferencesArgs): Promise<VersionedSemanticResult<SemanticReferencesOutcome | null>>
  cache: ReferenceResultCache
  logger?: StructuredLogger
  traceId?: string
  sourceAllowed(): boolean
}): Promise<VersionedSemanticResult<SemanticReferencesOutcome> | undefined> {
  const revision = ports.inputs.captureRevision(query.document.workspaceId)
  ports.assertCurrent(revision)
  if (!ports.sourceAllowed()) return undefined
  const before = sourceReferenceInputKey(query)
  if (!before) return undefined
  const response = await ports.dispatch({ position: query.position, includeDeclaration: query.includeDeclaration,
    qualifiedOnly: "source", ...(ports.traceId ? { traceId: ports.traceId } : {}) })
  ports.assertCurrent(revision)
  if (!ports.sourceAllowed()) throw new SemanticWorkerSupervisorError("content-modified")
  sourceReferenceCheckpoint(query)
  const after = sourceReferenceInputKey(query)
  if (after !== before) throw new SemanticWorkerSupervisorError("content-modified")
  if (response.value === null) return undefined
  if (response.value.status !== "complete" || response.value.queryProof?.coverage !== "lexical-block")
    throw new SemanticWorkerSupervisorError("internal-error")
  const proof = queryCacheProof(query, response.value, before)
  if (!proof) throw new SemanticWorkerSupervisorError("content-modified")
  if (ports.cache.set(query, response.value, proof))
    logReferenceCache(ports.logger, ports.cache, "references.cache.store", ports.traceId, response.value.references.length, proof)
  return { documentVersion: response.documentVersion, value: response.value }
}
