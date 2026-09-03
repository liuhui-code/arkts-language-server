import { randomUUID } from "node:crypto"

const MAX_CODE_ACTION_RESOLUTIONS = 512
const MAX_CODE_ACTION_RESOLUTION_BYTES = 512 * 1024
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export interface CodeActionDiagnosticDescriptor {
  readonly range: {
    readonly start: { readonly line: number; readonly character: number }
    readonly end: { readonly line: number; readonly character: number }
  }
  readonly severity: number
  readonly code: number
  readonly source: string
  readonly message: string
}

export interface CanonicalCodeActionDescriptor {
  readonly title: string
  readonly kind: "quickfix"
  readonly diagnostic: CodeActionDiagnosticDescriptor
}

export interface CodeActionResolutionRecord {
  readonly documentUri: string
  readonly documentVersion: number
  readonly action: CanonicalCodeActionDescriptor
  readonly fingerprint: string
}

export interface CodeActionResolutionData {
  readonly arktsCodeActionId: string
}

export type CodeActionResolutionLookup =
  | { status: "active"; record: CodeActionResolutionRecord }
  | { status: "stale" }
  | { status: "unknown" }

type CodeActionResolutionEntry =
  | { status: "active"; record: CodeActionResolutionRecord; byteSize: number }
  | { status: "stale" }
const STALE_ENTRY = Object.freeze({ status: "stale" } as const)
const UNKNOWN_LOOKUP = Object.freeze({ status: "unknown" } as const)

export class CodeActionResolutionStore {
  private readonly entries = new Map<string, CodeActionResolutionEntry>()
  private recordBytes = 0

  remember(record: CodeActionResolutionRecord): CodeActionResolutionData {
    const snapshot = immutableSnapshot(record)
    const byteSize = Buffer.byteLength(JSON.stringify(snapshot))
    if (byteSize > MAX_CODE_ACTION_RESOLUTION_BYTES) {
      throw new RangeError(
        `Code-action resolution record exceeds ${MAX_CODE_ACTION_RESOLUTION_BYTES} bytes`,
      )
    }
    const id = randomUUID()
    this.entries.set(id, Object.freeze({
      status: "active",
      record: snapshot,
      byteSize,
    }))
    this.recordBytes += byteSize
    while (
      this.entries.size > MAX_CODE_ACTION_RESOLUTIONS
      || this.recordBytes > MAX_CODE_ACTION_RESOLUTION_BYTES
    ) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.deleteEntry(oldest)
    }
    return Object.freeze({ arktsCodeActionId: id })
  }

  lookup(data: unknown): CodeActionResolutionLookup {
    if (
      data === null
      || typeof data !== "object"
      || Array.isArray(data)
    ) return UNKNOWN_LOOKUP
    const ownKeys = Reflect.ownKeys(data)
    if (ownKeys.length !== 1 || ownKeys[0] !== "arktsCodeActionId") return UNKNOWN_LOOKUP
    const descriptor = Object.getOwnPropertyDescriptor(data, "arktsCodeActionId")
    if (typeof descriptor?.value !== "string" || !UUID_PATTERN.test(descriptor.value)) {
      return UNKNOWN_LOOKUP
    }
    const entry = this.entries.get(
      descriptor.value,
    )
    if (!entry) return UNKNOWN_LOOKUP
    return entry.status === "stale"
      ? STALE_ENTRY
      : Object.freeze({ status: "active", record: entry.record })
  }

  forgetDocument(documentUri: string): void {
    for (const [id, entry] of this.entries) {
      if (entry.status === "active" && entry.record.documentUri === documentUri) {
        this.recordBytes -= entry.byteSize
        this.entries.set(id, STALE_ENTRY)
      }
    }
  }

  clear(): void {
    this.entries.clear()
    this.recordBytes = 0
  }

  private deleteEntry(id: string): void {
    const entry = this.entries.get(id)
    if (entry?.status === "active") this.recordBytes -= entry.byteSize
    this.entries.delete(id)
  }
}

function immutableSnapshot<T>(value: T): T {
  return deepFreeze(structuredClone(value))
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}
