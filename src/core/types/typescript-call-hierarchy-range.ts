import ts from "typescript"

import type { SemanticCallHierarchyItemInfo, SemanticTextRange } from "../protocol.js"
import { spanToRange } from "./text-position.js"
import { exactSourceRange, type ReferenceSourceView } from "./typescript-reference-query.js"

export function exactCallHierarchySelectionRange(
  sourceView: ReferenceSourceView,
  item: ts.CallHierarchyItem,
): SemanticTextRange | undefined {
  if (item.selectionSpan.length !== 0) return exactSourceRange(sourceView, item.selectionSpan)
  // TypeScript uses an empty selection at offset zero for whole-file callers.
  // Do not accept empty names/spans for ordinary symbols or nested modules.
  if ((item.kind !== ts.ScriptElementKind.moduleElement && item.kind !== ts.ScriptElementKind.scriptElement)
    || item.name !== item.file || item.selectionSpan.start !== 0
    || item.span.start + item.span.length !== sourceView.content.length
    || !exactSourceBoundaryRange(sourceView, item.span)
    || sourceView.virtualDocument.toSourceOffset(0) !== 0
    || sourceView.virtualDocument.toGeneratedOffset(0) !== 0) return undefined
  return spanToRange(sourceView.virtualDocument.sourceContent, 0, 0)
}

export function currentWholeFileCallHierarchyItem(
  sourceFile: ts.SourceFile,
  sourceView: ReferenceSourceView & { readonly sourceFingerprint: string },
): SemanticCallHierarchyItemInfo | undefined {
  if (sourceFile.text !== sourceView.content
    || sourceView.virtualDocument.toSourceOffset(0) !== 0
    || sourceView.virtualDocument.toGeneratedOffset(0) !== 0) return undefined
  const range = exactSourceBoundaryRange(sourceView, { start: 0, length: sourceFile.getEnd() })
  if (!range) return undefined
  return { path: sourceFile.fileName, name: sourceFile.fileName,
    kind: ts.isExternalModule(sourceFile) ? "module" : "file",
    sourceFingerprint: sourceView.sourceFingerprint, range,
    selectionRange: spanToRange(sourceView.virtualDocument.sourceContent, 0, 0) }
}

export function exactSourceBoundaryRange(
  sourceView: ReferenceSourceView,
  span: ts.TextSpan,
): SemanticTextRange | undefined {
  if (
    !Number.isSafeInteger(span.start)
    || !Number.isSafeInteger(span.length)
    || span.start < 0
    || span.length <= 0
    || span.start + span.length > sourceView.content.length
  ) return undefined
  const generatedEnd = span.start + span.length
  const sourceStart = sourceView.virtualDocument.toSourceOffset(span.start)
  const sourceEnd = sourceView.virtualDocument.toSourceOffset(generatedEnd)
  if (
    sourceEnd <= sourceStart
    || sourceView.virtualDocument.toGeneratedOffset(sourceStart) !== span.start
    || sourceView.virtualDocument.toGeneratedOffset(sourceEnd) !== generatedEnd
  ) return undefined
  return spanToRange(
    sourceView.virtualDocument.sourceContent,
    sourceStart,
    sourceEnd - sourceStart,
  )
}
