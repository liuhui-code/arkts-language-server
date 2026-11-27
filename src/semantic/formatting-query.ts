import { fileURLToPath } from "node:url"
import type { TextPosition } from "../contracts/document.js"
import type { SemanticDocumentFormattingQuery, SemanticDocumentTextEdit, VersionedSemanticResult } from "../contracts/semantic-engine.js"
import { formatArktsDocument } from "../core/formatting/arkts-document-formatter.js"

/** Source offset adaptation lives with the existing formatting query, keeping
 * the main engine wrapper and its cancellation contract small. */
export function runDocumentFormattingQuery(query: SemanticDocumentFormattingQuery,
  checkpoint: () => void): VersionedSemanticResult<SemanticDocumentTextEdit[]> {
    checkpoint()
    const source = query.document.text
    const lineStarts = sourceLineStarts(source)
    const value = formatArktsDocument(
      fileURLToPath(query.document.uri),
      source,
      query.options,
    ).map((edit) => ({
      range: {
        start: positionAtOffset(lineStarts, edit.start),
        end: positionAtOffset(lineStarts, edit.start + edit.length),
      },
      newText: edit.newText,
    }))
    checkpoint()
    return { documentVersion: query.document.version, value }
}

function sourceLineStarts(source: string): number[] {
  const starts = [0]
  for (let offset = 0; offset < source.length; offset += 1) {
    const character = source[offset]
    if (character === "\r" && source[offset + 1] === "\n") offset += 1
    else if (character !== "\r" && character !== "\n") continue
    starts.push(offset + 1)
  }
  return starts
}

function positionAtOffset(
  lineStarts: readonly number[],
  offset: number,
): TextPosition {
  let low = 0
  let high = lineStarts.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    if ((lineStarts[middle] ?? Number.POSITIVE_INFINITY) <= offset) low = middle + 1
    else high = middle
  }
  const line = Math.max(0, low - 1)
  return { line, character: offset - (lineStarts[line] ?? 0) }
}
