import type { IndexInput, IndexSnapshotIdentity, IndexQualification, IndexReadProof } from "../contracts/index-evidence.js"
export type { IndexInput, IndexSnapshotIdentity, IndexQualification, IndexReadProof } from "../contracts/index-evidence.js"
import { SidecarProtocolError, asRecord, isNonNegativeInteger } from "./sidecar-protocol-validation.js"

export interface ExpectedIndexInput {
  readonly workspaceIdentity: string
  readonly factsDomain: string
  readonly input?: IndexInput
}
export interface MaintenanceTerminal {
  attemptId: string
  input: IndexInput
  phase: "completed" | "failed" | "cancelled"
  outcome: "qualified" | "published-unqualified" | "cancelled" | "failed" | "unknown" | "data-updated" | "unchanged"
  dataPublished: boolean | null
  currentInput: boolean
  qualification: IndexQualification | null
  writtenDocuments?: number
  factRowsWritten?: number
  reusedDocuments?: number
  indexedDocuments?: number
  head?: number
  scope?: "file"
  uri?: string
  snapshot?: IndexSnapshotIdentity
  error?: { code: string; message: string } | string | null
}

export function decodeInput(value: unknown): IndexInput {
  const input = asRecord(value)
  if (!nonempty(input.issuer) || input.issuer.length > 128 || !isNonNegativeInteger(input.revision)) {
    invalid("maintenance input")
  }
  return Object.freeze({ issuer: input.issuer, revision: input.revision })
}

export function sameInput(left: IndexInput, right: IndexInput): boolean {
  return left.issuer === right.issuer && left.revision === right.revision
}

function decodeSnapshot(value: unknown, expected: ExpectedIndexInput): IndexSnapshotIdentity {
  const snapshot = asRecord(value)
  if (snapshot.workspaceIdentity !== expected.workspaceIdentity || snapshot.factsDomain !== expected.factsDomain
    || !nonempty(snapshot.storeId) || !isNonNegativeInteger(snapshot.head)) invalid("snapshot identity")
  return Object.freeze({ workspaceIdentity: expected.workspaceIdentity, factsDomain: expected.factsDomain,
    storeId: snapshot.storeId, head: snapshot.head })
}

function decodeQualification(value: unknown, expected: ExpectedIndexInput,
  snapshot?: IndexSnapshotIdentity): IndexQualification {
  const receipt = asRecord(value)
  const identity = decodeSnapshot(receipt, expected)
  const input = decodeInput(receipt.input)
  if (!expected.input || !sameInput(input, expected.input)
    || (snapshot && (identity.storeId !== snapshot.storeId || identity.head !== snapshot.head))
    || !nonempty(receipt.qualificationId) || !nonempty(receipt.fingerprint)
    || receipt.scanComplete !== true || receipt.rejected !== 0) invalid("complete qualification")
  return Object.freeze({ ...identity, qualificationId: receipt.qualificationId, input,
    scanComplete: true, rejected: 0, fingerprint: receipt.fingerprint })
}

/** No task-state ready or numeric generation alone can establish this proof. */
export function decodeReadProof(value: unknown, expected: ExpectedIndexInput): IndexReadProof {
  const result = asRecord(value)
  if (result.format === "legacy") {
    if (result.snapshot !== null || result.qualification !== null || result.completeness !== "stale") {
      invalid("legacy discovery proof")
    }
    return { format: "legacy", snapshot: null, qualification: null }
  }
  if (result.format !== "versioned") invalid("read format")
  const snapshot = decodeSnapshot(result.snapshot, expected)
  const generation = result.servedGeneration ?? result.committedGeneration
  if (generation !== snapshot.head) invalid("snapshot generation")
  const qualification = result.qualification === null ? null
    : decodeQualification(result.qualification, expected, snapshot)
  if (result.completeness !== (qualification ? "ready" : "stale")) invalid("read completeness")
  return { format: "versioned", snapshot, qualification }
}

/** A successful old-input terminal remains historical, never a dirty-input ACK. */
export function decodeMaintenanceTerminal(value: unknown, expected: ExpectedIndexInput): MaintenanceTerminal {
  const event = asRecord(value)
  if (event.protocol !== 1 || event.event !== "maintenance/terminal" || "id" in event
    || !nonempty(event.attemptId)) invalid("maintenance terminal envelope")
  const input = decodeInput(event.input)
  if (!expected.input || !sameInput(input, expected.input)) invalid("terminal input")
  if (event.currentInput !== undefined && typeof event.currentInput !== "boolean") invalid("terminal currency")
  const base = { attemptId: event.attemptId, input, currentInput: event.currentInput === true }
  for (const field of ["writtenDocuments", "factRowsWritten", "reusedDocuments"] as const) {
    if (event[field] !== undefined && !isNonNegativeInteger(event[field])) invalid("terminal counts")
  }
  switch (event.outcome) {
    case "data-updated":
    case "unchanged": {
      if (event.phase !== "completed" || event.scope !== "file" || !nonempty(event.uri)
        || event.currentInput !== false || event.qualification !== null
        || event.dataPublished !== (event.outcome === "data-updated")
        || !isNonNegativeInteger(event.writtenDocuments) || !isNonNegativeInteger(event.factRowsWritten)) {
        invalid("file maintenance terminal")
      }
      return { ...base, phase: "completed", outcome: event.outcome, qualification: null,
        dataPublished: event.dataPublished, scope: "file", uri: event.uri,
        snapshot: decodeSnapshot(event.snapshot, expected),
        writtenDocuments: event.writtenDocuments, factRowsWritten: event.factRowsWritten }
    }
    case "qualified": {
      if (event.scope === "file" || event.phase !== "completed" || typeof event.dataPublished !== "boolean"
        || typeof event.currentInput !== "boolean" || !isNonNegativeInteger(event.indexedDocuments)) invalid("qualified terminal")
      const qualification = decodeQualification(event.qualification, expected)
      return { ...base, phase: "completed", outcome: "qualified", dataPublished: event.dataPublished,
        qualification, indexedDocuments: event.indexedDocuments, ...counts(event) }
    }
    case "published-unqualified":
      if (event.phase !== "completed" || event.dataPublished !== true || event.qualification !== null
        || base.currentInput || !isNonNegativeInteger(event.head) || typeof event.error !== "string") {
        invalid("unqualified publication")
      }
      return { ...base, phase: "completed", outcome: "published-unqualified", dataPublished: true,
        qualification: null, head: event.head, error: event.error, ...counts(event) }
    case "cancelled":
      if (event.phase !== "cancelled" || event.dataPublished !== false || event.qualification !== null
        || base.currentInput || event.error !== null) invalid("cancelled terminal")
      return { ...base, phase: "cancelled", outcome: "cancelled", dataPublished: false, qualification: null }
    case "failed":
    case "unknown": {
      const error = asRecord(event.error)
      const published = event.outcome === "unknown" ? null : false
      if (event.phase !== "failed" || event.dataPublished !== published || event.qualification !== null
        || base.currentInput || !nonempty(error.code) || typeof error.message !== "string") invalid("failed terminal")
      return { ...base, phase: "failed", outcome: event.outcome, dataPublished: published,
        qualification: null, error: { code: error.code, message: error.message } }
    }
    default: return invalid("terminal outcome")
  }
}

function counts(value: Record<string, unknown>): {
  writtenDocuments: number; factRowsWritten: number; reusedDocuments: number
} {
  if (!isNonNegativeInteger(value.writtenDocuments) || !isNonNegativeInteger(value.factRowsWritten)
    || !isNonNegativeInteger(value.reusedDocuments)) invalid("complete terminal counts")
  return { writtenDocuments: value.writtenDocuments, factRowsWritten: value.factRowsWritten,
    reusedDocuments: value.reusedDocuments }
}
function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}
function invalid(field: string): never {
  throw new SidecarProtocolError(`index sidecar returned an invalid ${field}`)
}

// A Native JSON field cannot forge this transport-owned annotation.
const READ_PROOF = Symbol("validated index read proof")
type Annotated = { [READ_PROOF]?: IndexReadProof }
export function attachReadProof(value: Record<string, unknown>, proof: IndexReadProof): Record<string, unknown> {
  return { ...value, [READ_PROOF]: proof }
}
export function retainedReadProof(value: unknown): { indexProof?: IndexReadProof } {
  const proof = value && typeof value === "object" ? (value as Annotated)[READ_PROOF] : undefined
  return proof ? { indexProof: proof } : {}
}
