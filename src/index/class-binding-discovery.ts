import type { ClassBindingDiscoveryQuery, ClassBindingDiscoveryResult, ClassBindingSourceAvailability } from "../contracts/class-binding-discovery.js"
import type { DocumentUri, TextPosition, TextRange, WorkspaceId } from "../contracts/document.js"

const MAX_DOCUMENTS = 128
const MAX_URI_BYTES = 4_096
const MAX_TOTAL_URI_BYTES = 65_536
const MAX_OVERLAY_BYTES = 2_097_152
const MAX_TOTAL_OVERLAY_BYTES = 8_388_608

export interface ClassBindingRequestParams {
  workspaceIdentity: string
  expectedGeneration: number
  documentUris: DocumentUri[]
  overlays: { uri: DocumentUri; text: string }[]
  sourceAvailability?: ClassBindingSourceAvailability[]
  documentUri: DocumentUri
  classNamePosition: TextPosition
}

export function prepareClassBindingQuery(
  workspaceId: WorkspaceId,
  workspaceIdentity: string,
  query: ClassBindingDiscoveryQuery,
  mapUri: (uri: DocumentUri) => DocumentUri,
): ClassBindingRequestParams {
  if (!isRecord(query) || !isNonNegativeInteger(query.expectedGeneration)
    || !isPosition(query.classNamePosition) || !Array.isArray(query.documentUris)
    || query.documentUris.length > MAX_DOCUMENTS || !Array.isArray(query.overlays)
    || query.overlays.length > MAX_DOCUMENTS || typeof query.documentUri !== "string"
    || Array.from(query.documentUris).some(uri => typeof uri !== "string" || uri.length === 0)) {
    throw new RangeError("invalid class binding query")
  }
  const documentUris = query.documentUris.map(mapUri)
  const requested = new Set(documentUris)
  const documentUri = mapUri(query.documentUri)
  if (requested.size !== documentUris.length || !requested.has(documentUri)
    || documentUris.some(uri => Buffer.byteLength(uri) > MAX_URI_BYTES)
    || documentUris.reduce((total, uri) => total + Buffer.byteLength(uri), 0) > MAX_TOTAL_URI_BYTES) {
    throw new RangeError("invalid class binding query: requested document set exceeds its bounds")
  }
  let overlayBytes = 0
  const overlayUris = new Set<DocumentUri>()
  const overlays = Array.from(query.overlays, overlay => {
    if (!isRecord(overlay) || overlay.workspaceId !== workspaceId
      || !isNonNegativeInteger(overlay.version) || typeof overlay.uri !== "string"
      || typeof overlay.text !== "string") {
      throw new RangeError("invalid class binding query: invalid workspace overlay")
    }
    const uri = mapUri(overlay.uri)
    const textBytes = Buffer.byteLength(overlay.text)
    overlayBytes += textBytes
    if (!requested.has(uri) || overlayUris.has(uri) || textBytes > MAX_OVERLAY_BYTES
      || overlayBytes > MAX_TOTAL_OVERLAY_BYTES) {
      throw new RangeError("invalid class binding query: source overlay exceeds its bounds")
    }
    overlayUris.add(uri)
    return { uri, text: overlay.text }
  })
  if (query.sourceAvailability !== undefined && (!Array.isArray(query.sourceAvailability)
    || query.sourceAvailability.length > documentUris.length)) {
    throw new RangeError("invalid class binding query: source availability exceeds its bounds")
  }
  const availabilityUris = new Set<DocumentUri>()
  const sourceAvailability = query.sourceAvailability === undefined ? undefined
    : Array.from(query.sourceAvailability, (entry): ClassBindingSourceAvailability => {
      if (!isRecord(entry) || typeof entry.uri !== "string"
        || (entry.state !== "present" && entry.state !== "absent" && entry.state !== "unknown")) {
        throw new RangeError("invalid class binding query: invalid source availability")
      }
      const uri = mapUri(entry.uri)
      if (!requested.has(uri) || availabilityUris.has(uri)
        || (entry.state === "absent" && overlayUris.has(uri))) {
        throw new RangeError("invalid class binding query: contradictory source availability")
      }
      availabilityUris.add(uri)
      return { uri, state: entry.state }
    })
  return {
    workspaceIdentity,
    expectedGeneration: query.expectedGeneration,
    documentUris, overlays, documentUri,
    ...(sourceAvailability === undefined ? {} : { sourceAvailability }),
    classNamePosition: { ...query.classNamePosition },
  }
}

export function mapClassBindingResult(
  value: unknown,
  params: ClassBindingRequestParams,
  mapUri: (uri: DocumentUri) => DocumentUri,
  protocolError: (message: string) => Error,
): ClassBindingDiscoveryResult {
  if (!isRecord(value)) throw protocolError("index sidecar returned an invalid class binding result")
  const result = value
  if (result.workspaceIdentity !== params.workspaceIdentity) {
    throw protocolError("index sidecar class binding used the wrong workspace identity")
  }
  if (!isNonNegativeInteger(result.servedGeneration)
    || (result.completeness !== "ready" && result.completeness !== "partial" && result.completeness !== "stale")
    || !isRecord(result.binding)) {
    throw protocolError("index sidecar returned an invalid class binding result")
  }
  const binding = result.binding
  if (binding.kind !== "unknown" && binding.kind !== "no-base" && binding.kind !== "resolved") {
    throw protocolError("index sidecar returned an invalid class binding kind")
  }
  if (binding.kind !== "unknown"
    && (result.completeness !== "ready" || result.servedGeneration !== params.expectedGeneration)) {
    throw protocolError("index sidecar returned class binding without a ready matching generation")
  }
  if (binding.kind !== "resolved") {
    return { servedGeneration: result.servedGeneration, completeness: result.completeness,
      binding: { kind: binding.kind } }
  }
  if (typeof binding.name !== "string" || binding.name.trim().length === 0
    || typeof binding.declarationUri !== "string" || !isNonEmptyRange(binding.nameRange)
    || !Array.isArray(binding.supportUris)
      || binding.supportUris.length > params.documentUris.length
      || new Set(binding.supportUris).size !== binding.supportUris.length
      || binding.supportUris.some(uri => !params.documentUris.includes(uri))
      || !binding.supportUris.includes(binding.declarationUri)
      || !binding.supportUris.includes(params.documentUri)) {
    throw protocolError("index sidecar returned invalid resolved class binding")
  }
  return {
    servedGeneration: result.servedGeneration,
    completeness: result.completeness,
    binding: {
      kind: "resolved", name: binding.name,
      nameRange: { start: { ...binding.nameRange.start }, end: { ...binding.nameRange.end } },
      declarationUri: mapUri(binding.declarationUri),
      supportUris: binding.supportUris.map(mapUri),
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isPosition(value: unknown): value is TextPosition {
  return isRecord(value) && isNonNegativeInteger(value.line) && isNonNegativeInteger(value.character)
    && value.line <= 0xffff_ffff && value.character <= 0xffff_ffff
}

function isNonEmptyRange(value: unknown): value is TextRange {
  return isRecord(value) && isPosition(value.start) && isPosition(value.end)
    && (value.start.line < value.end.line
      || (value.start.line === value.end.line && value.start.character < value.end.character))
}
