import path from "node:path"
import { fileURLToPath } from "node:url"

import type { WorkspaceExportIndexPort } from "../contracts/workspace-index.js"
import type {
  SemanticCompletionDiscovery,
  SemanticQuery,
} from "../contracts/semantic-engine.js"

export async function discoverCompletionCandidates(
  exportIndex: WorkspaceExportIndexPort | undefined,
  query: SemanticQuery,
): Promise<SemanticCompletionDiscovery | undefined> {
  if (!exportIndex) return undefined
  const context = completionPrefixContext(query.document.text, query.position)
  if (context.memberAccess || Array.from(context.prefix).length < 2) return undefined
  try {
    const result = await exportIndex.searchExports(
      query.document.workspaceId,
      context.prefix,
      128,
      query.signal,
    )
    return {
      incomplete: result.completeness !== "ready",
      candidates: result.items
        .filter(candidate => candidate.uri !== query.document.uri)
        .flatMap(candidate => {
          const importSpecifier = candidate.importSpecifier
            ?? relativeImportSpecifier(query.document.uri, candidate.uri)
          return importSpecifier
            ? [{
                exportedName: candidate.exportedName,
                kind: candidate.kind,
                uri: candidate.uri,
                ordinal: candidate.ordinal,
                ...(candidate.declarationIdentity
                  ? { declarationIdentity: candidate.declarationIdentity }
                  : {}),
                importSpecifier,
                ...(candidate.moduleId ? { moduleId: candidate.moduleId } : {}),
                ...(candidate.targetScope ? { targetScope: candidate.targetScope } : {}),
              }]
            : []
        }),
    }
  } catch {
    return undefined
  }
}

function completionPrefixContext(
  text: string,
  position: { line: number; character: number },
): { prefix: string; memberAccess: boolean } {
  const lines = text.split(/\r?\n/u)
  const line = lines[position.line] ?? ""
  let utf16 = 0
  let offset = 0
  while (offset < line.length && utf16 < position.character) {
    const codePoint = line.codePointAt(offset)
    if (codePoint === undefined) break
    const width = codePoint > 0xffff ? 2 : 1
    if (utf16 + width > position.character) break
    utf16 += width
    offset += width
  }
  const before = line.slice(0, offset)
  const prefix = /[\p{ID_Continue}$_]*$/u.exec(before)?.[0] ?? ""
  return {
    prefix,
    memberAccess: before.slice(0, before.length - prefix.length).endsWith("."),
  }
}

function relativeImportSpecifier(fromUri: string, candidateUri: string): string | undefined {
  if (!fromUri.startsWith("file:") || !candidateUri.startsWith("file:")) return undefined
  try {
    const fromDirectory = path.dirname(fileURLToPath(fromUri))
    const candidatePath = fileURLToPath(candidateUri)
      .replace(/\.(?:d\.)?(?:ets|ts)$/u, "")
      .replace(/[\\/]index$/u, "")
    let relative = path.relative(fromDirectory, candidatePath).split(path.sep).join("/")
    if (!relative.startsWith(".")) relative = `./${relative}`
    return relative
  } catch {
    return undefined
  }
}
