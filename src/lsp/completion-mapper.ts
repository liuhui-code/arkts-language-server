import { CompletionItemKind, ErrorCodes, InsertTextFormat, ResponseError, type CompletionItem } from "vscode-languageserver/node.js"

import type { SemanticCompletion } from "../contracts/semantic-engine.js"
import type { CompletionResolutionData, CompletionResolutionRecord } from "./completion-resolution-store.js"

export interface CompletionClientProfile {
  commitCharacters: boolean
  insertReplaceEdits: boolean
  snippets: boolean
}

export function toLspCompletionItem(
  item: SemanticCompletion,
  data: CompletionResolutionData,
  profile: CompletionClientProfile,
  position?: { line: number; character: number },
) {
  const insertText = clientInsertText(item, profile)
  const textEdit = item.replacementRange
    ? toLspCompletionTextEdit(item.replacementRange, insertText, profile, position)
    : undefined
  return {
    label: item.label,
    detail: item.detail,
    kind: completionKind(item.kind),
    insertText,
    filterText: item.filterText,
    sortText: item.sortText,
    ...(profile.commitCharacters && item.commitCharacters !== undefined
      ? { commitCharacters: item.commitCharacters }
      : {}),
    ...(profile.snippets && item.isSnippet === true
      ? { insertTextFormat: InsertTextFormat.Snippet }
      : {}),
    textEdit,
    data,
  }
}

function clientInsertText(item: SemanticCompletion, profile: CompletionClientProfile): string {
  const insertText = item.insertText ?? item.label
  return profile.snippets && item.isSnippet === true
    ? insertText
    : stripSnippetPlaceholders(insertText)
}

function stripSnippetPlaceholders(text: string): string {
  return text
    .replace(/\$\{\d+:([^}]*)\}/g, "$1")
    .replace(/\$\{\d+\}/g, "")
    .replace(/\$\d+/g, "")
}

export function toLspResolvedCompletionItem(
  item: SemanticCompletion,
  original: CompletionItem,
  record: CompletionResolutionRecord,
) {
  const additionalTextEdits = item.additionalTextEdits?.map((edit) => {
    if (
      edit.uri !== record.documentUri
      || edit.expectedVersion !== record.documentVersion
    ) throw invalidCompletionResolution()
    return { range: edit.range, newText: edit.newText }
  })
  return {
    ...original,
    detail: item.detail,
    documentation: item.documentation,
    additionalTextEdits,
  }
}

function toLspCompletionTextEdit(
  replacementRange: { start: { line: number; character: number }; end: { line: number; character: number } },
  newText: string,
  profile: CompletionClientProfile,
  position: { line: number; character: number } | undefined,
) {
  if (
    profile.insertReplaceEdits
    && position
    && replacementRange
    && replacementRange.start.line === replacementRange.end.line
    && replacementRange.start.line === position.line
    && comparePositions(replacementRange.start, position) <= 0
    && comparePositions(position, replacementRange.end) <= 0
  ) {
    return {
      insert: { start: replacementRange.start, end: position },
      replace: replacementRange,
      newText,
    }
  }
  return { range: replacementRange, newText }
}

function comparePositions(
  left: { line: number; character: number },
  right: { line: number; character: number },
): number {
  if (left.line !== right.line) return left.line - right.line
  return left.character - right.character
}

export function invalidCompletionResolution(): ResponseError<void> {
  return new ResponseError(
    ErrorCodes.InvalidParams,
    "Completion item is unknown or invalid",
  )
}

function completionKind(kind: SemanticCompletion["kind"]): CompletionItemKind {
  switch (kind) {
    case "method": return CompletionItemKind.Method
    case "field": return CompletionItemKind.Field
    case "function": return CompletionItemKind.Function
    case "class": return CompletionItemKind.Class
    case "enum": return CompletionItemKind.Enum
    case "enumMember": return CompletionItemKind.EnumMember
    case "interface": return CompletionItemKind.Interface
    case "keyword": return CompletionItemKind.Keyword
    case "module": return CompletionItemKind.Module
    case "variable": return CompletionItemKind.Variable
    default: return CompletionItemKind.Property
  }
}
