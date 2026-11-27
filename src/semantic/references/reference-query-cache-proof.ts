import { exactSourceOffset } from "../../core/types/text-position.js"
import { SemanticWorkerSupervisorError } from "../semantic-worker-supervisor-errors.js"
import { readQualifiedReferenceCacheCoverage, type QualifiedReferenceCacheCoverage } from "./reference-qualified-cache-coverage.js"
import { matchesReferenceSourceFingerprint } from "./reference-source-fingerprint.js"
import { retainedInputFactsCurrent } from "../../project/retained-input-facts.js"
import { createHash } from "node:crypto"
import { REFERENCE_QUERY_CACHE_PREFIX, readReferenceQueryProof } from "../../contracts/reference-query-proof.js"
import type { SemanticReferencesOutcome, SemanticReferencesQuery } from "../../contracts/semantic-engine.js"
import type { SemanticReadinessReport } from "../../contracts/semantic-readiness.js"
import { compilerArtifactIdentity } from "../../core/types/typescript-compiler-artifact.js"
import { sameResolvedPath } from "../../project/path-identity.js"
import { toFilePath } from "../semantic-worker-file-identity.js"

const prefix = REFERENCE_QUERY_CACHE_PREFIX
export function hasQueryCacheProof(value: string | undefined): boolean { return value?.startsWith(prefix) === true }

export function referenceNamespaceKey(query: SemanticReferencesQuery, report: SemanticReadinessReport): string | undefined {
  const root = query.document.source?.rootUri ?? query.document.workspaceId
  const ns = report.sourceNamespace
  const admissible = report.semanticState === "ready" || report.semanticState === "partial"
    && report.unavailableReasons.length === 1 && report.unavailableReasons[0] === "sdk-inputs-incomplete"
  return !query.signal?.aborted && report.rootUri === root && admissible && ns?.diskSha256 && !ns.overlayOnly && ns.resolutionIdentity
    ? `${ns.resolutionIdentity}:${ns.sha256}:${ns.diskSha256}` : undefined
}

export function queryCacheProof(query: SemanticReferencesQuery, result: SemanticReferencesOutcome | undefined,
  namespace: string | undefined, indexCoverage?: QualifiedReferenceCacheCoverage): string | undefined {
  return prepareQueryCacheProof(query, result, namespace, indexCoverage, true)
}

function prepareQueryCacheProof(query: SemanticReferencesQuery, result: SemanticReferencesOutcome | undefined,
  namespace: string | undefined, indexCoverage: QualifiedReferenceCacheCoverage | undefined, store: boolean): string | undefined {
  if (result?.status !== "complete" || !namespace) return undefined
  const proof = readReferenceQueryProof(result.queryProof), file = toFilePath(query.document.uri)
  if (!proof || !file || !sameResolvedPath(file, proof.path)
    || proof.compilerSha256 !== compilerArtifactIdentity?.compilerSha256
    || proof.includeDeclaration !== query.includeDeclaration
    || proof.sourceSha256 !== createHash("sha256").update(query.document.text).digest("hex")
    || proof.coverage === "lexical-block" && proof.scopeEnd > query.document.text.length) return undefined
  const offset = exactSourceOffset(query.document.text, query.position.line + 1, query.position.character + 1)
  if (offset === undefined) return undefined
  if (proof.coverage === "lexical-block" && (offset < proof.scopeStart || offset >= proof.scopeEnd)) return undefined
  if (proof.coverage === "full-program" && !referenceInputsCurrent(query, proof.facts)) {
    if (store) throw new SemanticWorkerSupervisorError("content-modified")
    return undefined
  }
  const coverage = proof.coverage === "full-program" && proof.scope === "candidates" ? readQualifiedReferenceCacheCoverage(indexCoverage) : undefined
  if (proof.coverage === "full-program" && proof.scope !== "workspace") {
    if (proof.scope !== "candidates" || !coverage
      || !sameResolvedPath(proof.anchor.path, toFilePath(coverage.anchorUri) ?? "")
      || !matchesReferenceSourceFingerprint(coverage.qualification.fingerprint, /:([a-f0-9]{64})$/.exec(namespace)?.[1])
      || !coverage.uris.every(uri => { const file = toFilePath(uri); return file && proof.searchedPaths.some(searched => sameResolvedPath(file, searched)) })) return undefined
  }
  return prefix + JSON.stringify({ namespace, proof, ...(coverage ? { indexCoverage: coverage } : {}) })
}

export function matchesQueryCacheProof(query: SemanticReferencesQuery, stored: string,
  namespace: string | undefined): boolean {
  if (!hasQueryCacheProof(stored)) return false
  try {
    const value = JSON.parse(stored.slice(prefix.length))
    return value.namespace === namespace && prepareQueryCacheProof(query,
      { status: "complete", references: [], queryProof: value.proof }, namespace, value.indexCoverage, false) === stored
  } catch { return false }
}

/** Freshness is an independent publication fence even when cache admission fails. */
export function assertReferenceQueryInputs(query: SemanticReferencesQuery, result: SemanticReferencesOutcome | undefined): void {
  const proof = result?.status === "complete" ? readReferenceQueryProof(result.queryProof) : undefined
  if (proof?.coverage === "full-program" && !referenceInputsCurrent(query, proof.facts))
    throw new SemanticWorkerSupervisorError("content-modified")
}

function referenceInputsCurrent(query: SemanticReferencesQuery, facts: Parameters<typeof retainedInputFactsCurrent>[0]): boolean {
  return retainedInputFactsCurrent(facts, () => {
    if (query.signal?.aborted) throw query.signal.reason ?? new SemanticWorkerSupervisorError("client-cancelled")
  })
}
