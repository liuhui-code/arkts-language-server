import type { SemanticTextRange } from "../protocol.js"
import type { CooperativeWork } from "./cooperative-work.js"

export function compareTextEdits(
  left: { path: string; range: SemanticTextRange },
  right: { path: string; range: SemanticTextRange },
) {
  return left.path.localeCompare(right.path)
    || left.range.startLine - right.range.startLine
    || left.range.startColumn - right.range.startColumn
    || left.range.endLine - right.range.endLine
    || left.range.endColumn - right.range.endColumn
}

export function hasOverlappingEdits(
  edits: Array<{ path: string; range: SemanticTextRange }>,
  work: CooperativeWork,
): boolean {
  for (let index = 1; index < edits.length; index += 1) {
    work.item()
    const previous = edits[index - 1]
    const current = edits[index]
    if (previous.path !== current.path) continue
    if (
      current.range.startLine < previous.range.endLine
      || (
        current.range.startLine === previous.range.endLine
        && current.range.startColumn < previous.range.endColumn
      )
    ) return true
  }
  return false
}
