import type { SemanticReferencesQuery } from "../../contracts/semantic-engine.js"
import type { WorkspaceExportIndexPort, WorkspaceReferenceCandidateResult } from "../../contracts/workspace-index.js"

/** Opaque identity is matched against export metadata, never parsed or treated as compiler proof. */
export async function indexedReferenceAnchorSeed(
  index: WorkspaceExportIndexPort | undefined, query: SemanticReferencesQuery,
  candidates: WorkspaceReferenceCandidateResult,
) {
  if (!index || !candidates.identityComplete || !candidates.declarationUri
    || !candidates.declarationIdentity || candidates.names.length > 64) return undefined
  for (const name of candidates.names) {
    const exports = await index.searchExports(query.document.workspaceId, name, 128, query.signal)
    if (exports.completeness !== "ready" || exports.servedGeneration !== candidates.servedGeneration
      || exports.items.length >= 128) return undefined
    const matches = exports.items.filter(item => item.uri === candidates.declarationUri
      && item.declarationIdentity === candidates.declarationIdentity)
    if (matches.length > 1) return undefined
    if (matches.length === 1) return matches[0]
  }
  return undefined
}

/** Discovery only. Every verifier must prove the query resolves to this declaration. */
export async function localExportAnchorSeed(
  index: WorkspaceExportIndexPort | undefined,
  query: SemanticReferencesQuery,
) {
  if (!index) return undefined
  const line = query.document.text.split(/\r\n|\r|\n/)[query.position.line]
  if (!line) return undefined
  const token = [...line.matchAll(/[$_\p{ID_Start}][$_\p{ID_Continue}]*/gu)]
    .find(match => match.index !== undefined && match.index <= query.position.character
      && query.position.character < match.index + match[0].length)?.[0]
  if (!token) return undefined
  const result = await index.searchExports(query.document.workspaceId, token, 128, query.signal)
  if (result.completeness !== "ready" || result.items.length >= 128) return undefined
  const candidates = result.items.filter(item => item.exportedName === token
    && item.uri === query.document.uri && item.kind === "class" && item.declarationIdentity)
  if (candidates.length !== 1) return undefined
  return { ...candidates[0], servedGeneration: result.servedGeneration }
}
