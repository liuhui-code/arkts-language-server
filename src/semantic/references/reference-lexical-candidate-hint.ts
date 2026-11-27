import type { SemanticReferencesQuery } from "../../contracts/semantic-engine.js"

/** Cost hint only: do not queue a compiler probe without a matching declaration
 * prefix. It carries no scope, freshness or completeness authority. Comments,
 * escaped/multi-binding declarations and ambiguous forms may use the ordinary
 * complete route. The Worker still parses and proves any positive candidate.
 * Keep the parent free of the compiler and avoid a second syntax parser here. */
export function hasLexicalReferenceCandidate(query: SemanticReferencesQuery): boolean {
  const line = query.document.text.split(/\r\n|\r|\n/)[query.position.line]
  if (!line) return false
  let name: string | undefined
  for (const token of line.matchAll(/[$_\p{ID_Start}][$_\p{ID_Continue}\u200c\u200d]*/gu)) {
    if (token.index! <= query.position.character && query.position.character < token.index! + token[0].length) {
      name = token[0]
      break
    }
  }
  if (!name) return false
  for (const declaration of query.document.text.matchAll(/\b(?:let|const)\s+([$_\p{ID_Start}][$_\p{ID_Continue}\u200c\u200d]*)/gu)) {
    if (declaration[1] === name) return true
  }
  return false
}
