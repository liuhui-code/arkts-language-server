import type { DocumentUri } from "../contracts/document.js"
import type {
  WorkspaceExportCandidate,
  WorkspaceExportSearchResult,
  WorkspaceSymbol,
  WorkspaceSymbolSearchResult,
} from "../contracts/workspace-index.js"
import {
  SidecarProtocolError,
  asRecord,
  isCompleteness,
  isNonNegativeInteger,
} from "./sidecar-protocol-validation.js"

export function mapSearchResult(
  value: unknown,
  mapUri: (uri: DocumentUri) => DocumentUri = (uri) => uri,
): WorkspaceSymbolSearchResult {
  const result = asRecord(value)
  if (!Array.isArray(result.items)
    || !isNonNegativeInteger(result.servedGeneration)
    || !isCompleteness(result.completeness)) {
    throw new SidecarProtocolError("index sidecar returned an invalid symbol search result")
  }
  return {
    items: result.items.map((item) => {
      const symbol = mapWorkspaceSymbol(item)
      return { ...symbol, uri: mapUri(symbol.uri) }
    }),
    servedGeneration: result.servedGeneration,
    completeness: result.completeness,
  }
}

export function mapExportSearchResult(
  value: unknown,
  mapUri: (uri: DocumentUri) => DocumentUri = (uri) => uri,
): WorkspaceExportSearchResult {
  const result = asRecord(value)
  if (!Array.isArray(result.items)
    || !isNonNegativeInteger(result.servedGeneration)
    || !isCompleteness(result.completeness)) {
    throw new SidecarProtocolError("index sidecar returned an invalid export search result")
  }
  return {
    items: result.items.map((item) => {
      const candidate = mapWorkspaceExport(item)
      return { ...candidate, uri: mapUri(candidate.uri) }
    }),
    servedGeneration: result.servedGeneration,
    completeness: result.completeness,
  }
}

function mapWorkspaceSymbol(value: unknown): WorkspaceSymbol {
  const symbol = asRecord(value)
  if (typeof symbol.name !== "string"
    || typeof symbol.kind !== "string"
    || typeof symbol.uri !== "string"
    || (symbol.containerName !== undefined
      && symbol.containerName !== null
      && typeof symbol.containerName !== "string")) {
    throw new SidecarProtocolError("index sidecar returned an invalid workspace symbol")
  }
  const range = asRecord(symbol.range)
  const start = mapPosition(range.start)
  const end = mapPosition(range.end)
  return {
    name: symbol.name,
    kind: symbol.kind,
    uri: symbol.uri,
    range: { start, end },
    ...(typeof symbol.containerName === "string" ? { containerName: symbol.containerName } : {}),
  }
}

function mapWorkspaceExport(value: unknown): WorkspaceExportCandidate {
  const candidate = asRecord(value)
  if (typeof candidate.exportedName !== "string"
    || typeof candidate.kind !== "string"
    || typeof candidate.uri !== "string"
    || !isNonNegativeInteger(candidate.ordinal)) {
    throw new SidecarProtocolError("index sidecar returned an invalid export candidate")
  }
  for (const field of ["declarationIdentity", "importSpecifier", "moduleId", "targetScope"] as const) {
    if (candidate[field] !== undefined && typeof candidate[field] !== "string") {
      throw new SidecarProtocolError("index sidecar returned invalid export metadata")
    }
  }
  const range = asRecord(candidate.range)
  return {
    exportedName: candidate.exportedName,
    kind: candidate.kind,
    uri: candidate.uri,
    range: { start: mapPosition(range.start), end: mapPosition(range.end) },
    ordinal: candidate.ordinal,
    ...(typeof candidate.declarationIdentity === "string"
      ? { declarationIdentity: candidate.declarationIdentity }
      : {}),
    ...(typeof candidate.importSpecifier === "string"
      ? { importSpecifier: candidate.importSpecifier }
      : {}),
    ...(typeof candidate.moduleId === "string" ? { moduleId: candidate.moduleId } : {}),
    ...(typeof candidate.targetScope === "string" ? { targetScope: candidate.targetScope } : {}),
  }
}

function mapPosition(value: unknown): { line: number; character: number } {
  const position = asRecord(value)
  if (!isNonNegativeInteger(position.line) || !isNonNegativeInteger(position.character)) {
    throw new SidecarProtocolError("index sidecar returned an invalid symbol position")
  }
  return { line: position.line, character: position.character }
}
