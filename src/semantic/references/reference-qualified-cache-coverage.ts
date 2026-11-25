import { createHash } from "node:crypto"
import type { TextPosition } from "../../contracts/document.js"
import type { IndexQualification } from "../../contracts/index-evidence.js"
import type { WorkspaceReferenceCandidateResult } from "../../contracts/workspace-index.js"
import { readProofDataRecord, readProofDataArray } from "../../contracts/reference-query-proof.js"
import { matchesReferenceSourceFingerprint } from "./reference-source-fingerprint.js"

export interface QualifiedReferenceCacheCoverage {
  readonly version: 1
  readonly qualification: IndexQualification
  readonly uris: readonly string[]
  readonly anchorUri: string
  readonly anchorPosition: TextPosition
  readonly declarationIdentity: string
  readonly digest: string
}

/** Called only after accepted current qualification + binding/support admission.
 * Preserve that coverage certificate, not a boolean or a live SQLite reader. */
export function captureQualifiedReferenceCacheCoverage(result: WorkspaceReferenceCandidateResult,
  uris: readonly string[], identityComplete: boolean, sourceFingerprint: string | undefined,
  anchorPosition: TextPosition | undefined): QualifiedReferenceCacheCoverage | undefined {
  if (!identityComplete || !result.supported || !result.complete || result.completeness !== "ready"
    || !result.declarationUri || !result.declarationIdentity || !anchorPosition
    || !matchesReferenceSourceFingerprint(result.indexProof?.qualification?.fingerprint, sourceFingerprint)) return undefined
  return readQualifiedReferenceCacheCoverage({ version: 1, qualification: result.indexProof!.qualification,
    uris, anchorUri: result.declarationUri, anchorPosition, declarationIdentity: result.declarationIdentity,
    digest: createHash("sha256").update(JSON.stringify(result)).digest("hex") })
}

export function readQualifiedReferenceCacheCoverage(value: unknown): QualifiedReferenceCacheCoverage | undefined {
  const data = readProofDataRecord(value, ["version", "qualification", "uris", "anchorUri", "anchorPosition", "declarationIdentity", "digest"])
  if (!data || data.version !== 1) return undefined
  const q = readProofDataRecord(data.qualification, ["workspaceIdentity", "storeId", "factsDomain", "head", "qualificationId", "input", "scanComplete", "rejected", "fingerprint"])
  const input = q && readProofDataRecord(q.input, ["issuer", "revision"])
  const position = readProofDataRecord(data.anchorPosition, ["line", "character"])
  const uris = readProofDataArray(data.uris)
  const nonempty = (v: unknown): v is string => typeof v === "string" && v.length > 0
  const integer = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0
  if (!q || !input || !position || !integer(position.line) || !integer(position.character)
    || ![q.workspaceIdentity, q.storeId, q.factsDomain, q.qualificationId, input.issuer].every(nonempty)
    || !integer(q.head) || !integer(input.revision) || q.scanComplete !== true || q.rejected !== 0
    || typeof q.fingerprint !== "string" || !/^arkts-complete-scan-v2:[a-f0-9]{64}:[a-f0-9]{64}$/.test(q.fingerprint)
    || !uris?.length || !uris.every(v => typeof v === "string" && v.startsWith("file:"))
    || new Set(uris).size !== uris.length || !uris.includes(data.anchorUri)
    || !nonempty(data.declarationIdentity) || typeof data.digest !== "string" || !/^[a-f0-9]{64}$/.test(data.digest)) return undefined
  return Object.freeze({ ...data, qualification: Object.freeze({ ...q, input: Object.freeze(input) }),
    anchorPosition: Object.freeze(position), uris: Object.freeze(uris) }) as unknown as QualifiedReferenceCacheCoverage
}
