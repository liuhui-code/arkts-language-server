import type { WorkspaceIndexStatus, WorkspaceSymbolSearchResult } from "../contracts/workspace-index.js"

export class SidecarProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SidecarProtocolError"
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new SidecarProtocolError("index sidecar returned an invalid object")
  }
  return value
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function isIndexState(value: unknown): value is WorkspaceIndexStatus["state"] {
  return value === "warming" || value === "ready" || value === "degraded"
}

export function isCompleteness(value: unknown): value is WorkspaceSymbolSearchResult["completeness"] {
  return value === "ready" || value === "partial" || value === "stale"
}

export function isNullableGeneration(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value)
}

export function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}
