import type { SemanticWorkerPosition, SemanticWorkerReferencesArgs } from "./worker-protocol.js"

interface ReferenceArgsValidation {
  record(value: unknown, required: readonly string[], optional: readonly string[]): Record<string, unknown> | undefined
  position(value: unknown): SemanticWorkerPosition
  uri(value: unknown): value is string
  files(value: unknown): readonly unknown[]
  invalid(): Error
}

export function decodeReferencesArgs(value: unknown, validation: ReferenceArgsValidation): SemanticWorkerReferencesArgs {
  const { record: ownDataRecord, position: decodePosition, uri: isCanonicalSemanticWorkerFileUri, invalid: invalidRequest } = validation
  const args = ownDataRecord(
    value,
    ["position", "includeDeclaration"],
    ["candidateUris", "candidateIdentityComplete", "candidateAnchorUri", "candidateAnchorPosition", "candidateSupportUris", "forceLegacy", "traceId", "residentOnly"],
  )
  if (!args || !hasRequiredAndOnlyKeys(
    args,
    ["position", "includeDeclaration"],
    ["candidateUris", "candidateIdentityComplete", "candidateAnchorUri", "candidateAnchorPosition", "candidateSupportUris", "forceLegacy", "traceId", "residentOnly"],
  )) {
    throw invalidRequest()
  }
  const position = decodePosition(args.position)
  if (typeof args.includeDeclaration !== "boolean") throw invalidRequest()
  if (Object.hasOwn(args, "residentOnly") && typeof args.residentOnly !== "boolean") throw invalidRequest()
  if (args.residentOnly === true && Object.keys(args).some(key =>
    !["position", "includeDeclaration", "residentOnly", "traceId"].includes(key))) throw invalidRequest()
  if (Object.hasOwn(args, "traceId")
    && (typeof args.traceId !== "string" || !/^[0-9a-f-]{36}$/.test(args.traceId))) {
    throw invalidRequest()
  }
  if (Object.hasOwn(args, "forceLegacy") && typeof args.forceLegacy !== "boolean") {
    throw invalidRequest()
  }
  let candidateUris: readonly string[] | undefined
  if (Object.hasOwn(args, "candidateUris")) {
    candidateUris = Object.freeze(validation.files(args.candidateUris).map((uri) => {
      if (!isCanonicalSemanticWorkerFileUri(uri)) throw invalidRequest()
      return uri
    }))
  }
  let candidateIdentityComplete: boolean | undefined
  if (Object.hasOwn(args, "candidateIdentityComplete")) {
    if (typeof args.candidateIdentityComplete !== "boolean" || !candidateUris) {
      throw invalidRequest()
    }
    candidateIdentityComplete = args.candidateIdentityComplete
  }
  let candidateAnchorUri: string | undefined
  if (Object.hasOwn(args, "candidateAnchorUri")) {
    if (!isCanonicalSemanticWorkerFileUri(args.candidateAnchorUri)
      || candidateIdentityComplete !== true
      || !candidateUris?.includes(args.candidateAnchorUri)) throw invalidRequest()
    candidateAnchorUri = args.candidateAnchorUri
  }
  let candidateSupportUris: readonly string[] | undefined
  const candidateAnchorPosition = Object.hasOwn(args, "candidateAnchorPosition")
    ? decodePosition(args.candidateAnchorPosition) : undefined
  if (candidateAnchorPosition && !candidateAnchorUri) throw invalidRequest()
  if (Object.hasOwn(args, "candidateSupportUris")) {
    candidateSupportUris = Object.freeze(validation.files(args.candidateSupportUris).map((uri) => {
      if (!isCanonicalSemanticWorkerFileUri(uri) || !candidateUris?.includes(uri)) {
        throw invalidRequest()
      }
      return uri
    }))
    if (candidateIdentityComplete !== true || !candidateAnchorUri
      || !candidateSupportUris.includes(candidateAnchorUri)) throw invalidRequest()
  }
  return Object.freeze({
    position,
    includeDeclaration: args.includeDeclaration,
    ...(Object.hasOwn(args, "residentOnly") ? { residentOnly: args.residentOnly as boolean } : {}),
    ...(Object.hasOwn(args, "traceId") ? { traceId: args.traceId as string } : {}),
    ...(Object.hasOwn(args, "forceLegacy") ? { forceLegacy: args.forceLegacy as boolean } : {}),
    ...(candidateUris ? { candidateUris } : {}),
    ...(candidateIdentityComplete === undefined ? {} : { candidateIdentityComplete }),
    ...(candidateAnchorUri ? { candidateAnchorUri } : {}),
    ...(candidateAnchorPosition ? { candidateAnchorPosition } : {}),
    ...(candidateSupportUris ? { candidateSupportUris } : {}),
  })
}

function hasRequiredAndOnlyKeys(value: Record<string, unknown>, required: readonly string[],
  optional: readonly string[]): boolean {
  return required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => [...required, ...optional].includes(key))
}
