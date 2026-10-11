import { fileURLToPath, pathToFileURL } from "node:url"

import type { TextRange } from "../contracts/document.js"
import type { SemanticCallHierarchyItem, SemanticCompletion, SemanticCompletionKind,
  SemanticDocumentSymbol } from "../contracts/semantic-engine.js"
import type { SemanticCallHierarchyItemInfo, SemanticCompletionItem,
  SemanticDocumentSymbolInfo } from "../core/protocol.js"

function completionKind(kind: string): SemanticCompletionKind {
  switch (kind) {
    case "method":
    case "field":
    case "function":
    case "class":
    case "enum":
    case "enumMember":
    case "interface":
    case "keyword":
    case "module":
    case "variable":
      return kind
    default:
      return "property"
  }
}

export function toPublicCompletion(
  item: SemanticCompletionItem,
  documentVersion: number,
): SemanticCompletion {
  return {
    label: item.label,
    detail: item.detail,
    kind: completionKind(item.kind),
    documentation: item.documentation,
    insertText: item.insertText,
    filterText: item.filterText,
    sortText: item.sortText,
    commitCharacters: item.commitCharacters,
    isSnippet: item.isSnippet,
    replacementRange: item.replacementRange
      ? toPublicRange(item.replacementRange)
      : undefined,
    additionalTextEdits: item.additionalTextEdits?.map((edit) => ({
      uri: pathToFileURL(edit.path).href,
      range: toPublicRange(edit.range),
      newText: edit.newText,
      expectedVersion: edit.expectedVersion ?? documentVersion,
    })),
    preResolved: item.preResolved
      ? {
          documentVersion: item.preResolved.documentVersion,
          detail: item.preResolved.detail,
          documentation: item.preResolved.documentation,
          additionalTextEdits: item.preResolved.additionalTextEdits?.map((edit) => ({
            uri: pathToFileURL(edit.path).href,
            range: toPublicRange(edit.range),
            newText: edit.newText,
            expectedVersion: edit.expectedVersion ?? documentVersion,
          })),
        }
      : undefined,
    data: item.data,
  }
}

export function toLegacyCompletion(item: SemanticCompletion): SemanticCompletionItem {
  return {
    label: item.label,
    detail: item.detail,
    kind: item.kind,
    documentation: item.documentation,
    insertText: item.insertText,
    filterText: item.filterText,
    sortText: item.sortText,
    commitCharacters: item.commitCharacters,
    isSnippet: item.isSnippet,
    replacementRange: item.replacementRange
      ? toLegacyRange(item.replacementRange)
      : undefined,
    data: item.data,
  }
}

export function toPublicCallHierarchyItem(
  item: SemanticCallHierarchyItemInfo,
): SemanticCallHierarchyItem {
  return {
    uri: pathToFileURL(item.path).href,
    name: item.name,
    kind: item.kind,
    ...(item.sourceFingerprint ? { sourceFingerprint: item.sourceFingerprint } : {}),
    range: toPublicRange(item.range),
    selectionRange: toPublicRange(item.selectionRange),
    ...(item.detail ? { detail: item.detail } : {}),
  }
}

export function toLegacyCallHierarchyItem(
  item: SemanticCallHierarchyItem,
): SemanticCallHierarchyItemInfo {
  return {
    path: fileURLToPath(item.uri),
    name: item.name,
    kind: item.kind,
    ...(item.sourceFingerprint ? { sourceFingerprint: item.sourceFingerprint } : {}),
    range: toLegacyRange(item.range),
    selectionRange: toLegacyRange(item.selectionRange),
    ...(item.detail ? { detail: item.detail } : {}),
  }
}

export function toLegacyRange(range: TextRange) {
  return {
    startLine: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLine: range.end.line + 1,
    endColumn: range.end.character + 1,
  }
}

export function toPublicRange(range: {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}) {
  return {
    start: { line: range.startLine - 1, character: range.startColumn - 1 },
    end: { line: range.endLine - 1, character: range.endColumn - 1 },
  }
}

export function toPublicDocumentSymbol(symbol: SemanticDocumentSymbolInfo): SemanticDocumentSymbol {
  return {
    name: symbol.name,
    detail: symbol.detail,
    kind: symbol.kind,
    range: toPublicRange(symbol.range),
    selectionRange: toPublicRange(symbol.selectionRange),
    children: symbol.children?.map(toPublicDocumentSymbol),
  }
}
