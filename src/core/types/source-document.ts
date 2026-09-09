import type { SemanticTextRange } from "../protocol.js"
import { createLineStartIndex, offsetToLineColumn } from "./text-position.js"

export interface SourceDocument {
  sourceContent: string
  generatedContent: string
  toGeneratedOffset(sourceOffset: number): number
  toSourceOffset(generatedOffset: number): number
  generatedSpanToSourceRange(start: number, length: number): SemanticTextRange
}

export function createSourceDocument(sourceContent: string): SourceDocument {
  const lineStarts = createLineStartIndex(sourceContent)
  const bounded = (offset: number) => Math.max(0, Math.min(offset, sourceContent.length))
  return {
    sourceContent,
    generatedContent: sourceContent,
    toGeneratedOffset: bounded,
    toSourceOffset: bounded,
    generatedSpanToSourceRange(start, length) {
      const sourceStart = bounded(start)
      const sourceEnd = bounded(start + length)
      const from = offsetToLineColumn(sourceContent, sourceStart, lineStarts)
      const to = offsetToLineColumn(sourceContent, sourceEnd, lineStarts)
      return {
        startLine: from.line,
        startColumn: from.column,
        endLine: to.line,
        endColumn: to.column,
      }
    },
  }
}
