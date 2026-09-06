import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import {
  LSPErrorCodes,
  ResponseError,
  SymbolKind,
  type CallHierarchyIncomingCall,
  type CallHierarchyItem,
  type CallHierarchyOutgoingCall,
  type CallHierarchyPrepareParams,
} from "vscode-languageserver/node.js"

import type {
  SemanticCallHierarchyItem,
  SemanticCallHierarchyIncomingCall,
  SemanticCallHierarchyItemKind,
  SemanticCallHierarchyOutgoingCall,
} from "../contracts/semantic-engine.js"

const MAX_PREPARE_ITEMS = 16
const MAX_EDGES = 256
const MAX_RANGES_PER_EDGE = 64
const MAX_TOTAL_RANGES = 2_048
const MAX_PREPARE_BYTES = 64 * 1_024
const MAX_CALL_BYTES = 256 * 1_024
const MAX_INPUT_ITEM_BYTES = 64 * 1_024
const MAX_URI_BYTES = 16 * 1_024
const MAX_NAME_BYTES = 4 * 1_024
const MAX_DETAIL_BYTES = 16 * 1_024
const CALL_HIERARCHY_DATA_PROTOCOL = 1

export interface ParsedCallHierarchyItem {
  item: SemanticCallHierarchyItem
  rootUri: string
}

export function assertCallHierarchyPrepareParams(
  params: unknown,
): asserts params is CallHierarchyPrepareParams {
  if (
    !isRecord(params)
    || !isTextDocumentIdentifier(params.textDocument)
    || !isCanonicalFileUri(params.textDocument.uri)
    || Buffer.byteLength(params.textDocument.uri) > MAX_URI_BYTES
    || !isProtocolPosition(params.position)
  ) {
    throw invalidParams("Invalid call hierarchy prepare parameters.")
  }
}

export function parseCallHierarchyOutgoingItem(
  params: unknown,
): ParsedCallHierarchyItem {
  if (!isRecord(params) || !isValidCallHierarchyItem(params.item)) {
    throw invalidParams("Invalid call hierarchy outgoing parameters.")
  }
  const kind = toSemanticKind(params.item.kind)
  if (!kind) throw invalidParams("Unsupported call hierarchy item kind.")
  const rootUri = callHierarchyRootUri(params.item.data)
  if (!rootUri) throw invalidParams("Invalid call hierarchy outgoing parameters.")
  return {
    rootUri,
    item: {
      uri: params.item.uri,
      name: params.item.name,
      kind,
      range: params.item.range,
      selectionRange: params.item.selectionRange,
      ...(params.item.detail ? { detail: params.item.detail } : {}),
    },
  }
}

export function parseCallHierarchyIncomingItem(
  params: unknown,
): ParsedCallHierarchyItem {
  if (!isRecord(params) || !isValidCallHierarchyItem(params.item)) {
    throw invalidParams("Invalid call hierarchy incoming parameters.")
  }
  const kind = toSemanticKind(params.item.kind)
  const rootUri = callHierarchyRootUri(params.item.data)
  if (!kind || !rootUri) throw invalidParams("Invalid call hierarchy incoming parameters.")
  return {
    rootUri,
    item: {
      uri: params.item.uri,
      name: params.item.name,
      kind,
      range: params.item.range,
      selectionRange: params.item.selectionRange,
      ...(params.item.detail ? { detail: params.item.detail } : {}),
    },
  }
}

export function boundedCallHierarchyItems(
  items: readonly SemanticCallHierarchyItem[],
  rootUri: string,
): CallHierarchyItem[] {
  assertCallHierarchyPrepareWorkBudget(items)
  const normalized: CallHierarchyItem[] = []
  const seen = new Set<string>()
  for (const semanticItem of items) {
    const item = toLspItem(semanticItem, rootUri)
    const key = JSON.stringify(item)
    if (seen.has(key)) continue
    if (normalized.length >= MAX_PREPARE_ITEMS) {
      throw incompleteCallHierarchy("result-limit-exceeded")
    }
    seen.add(key)
    normalized.push(item)
  }
  normalized.sort(compareItems)
  if (Buffer.byteLength(JSON.stringify(normalized)) > MAX_PREPARE_BYTES) {
    throw incompleteCallHierarchy("result-limit-exceeded")
  }
  return normalized
}

export function boundedOutgoingCalls(
  calls: readonly SemanticCallHierarchyOutgoingCall[],
  rootUri: string,
): CallHierarchyOutgoingCall[] {
  assertCallHierarchyOutgoingWorkBudget(calls)
  const grouped = new Map<string, CallHierarchyOutgoingCall>()
  let totalRanges = 0
  for (const call of calls) {
    const to = toLspItem(call.to, rootUri)
    const targetKey = JSON.stringify(to)
    const existing = grouped.get(targetKey) ?? { to, fromRanges: [] }
    const seenRanges = new Set(existing.fromRanges.map((range) => JSON.stringify(range)))
    for (const range of call.fromRanges) {
      if (!isProtocolRange(range)) throw incompleteCallHierarchy("source-unmappable")
      const key = JSON.stringify(range)
      if (seenRanges.has(key)) continue
      seenRanges.add(key)
      existing.fromRanges.push({
        start: { ...range.start },
        end: { ...range.end },
      })
      totalRanges += 1
      if (
        existing.fromRanges.length > MAX_RANGES_PER_EDGE
        || totalRanges > MAX_TOTAL_RANGES
      ) throw incompleteCallHierarchy("result-limit-exceeded")
    }
    existing.fromRanges.sort(compareRanges)
    grouped.set(targetKey, existing)
    if (grouped.size > MAX_EDGES) throw incompleteCallHierarchy("result-limit-exceeded")
  }
  const normalized = [...grouped.values()].sort((left, right) => (
    compareItems(left.to, right.to)
  ))
  if (Buffer.byteLength(JSON.stringify(normalized)) > MAX_CALL_BYTES) {
    throw incompleteCallHierarchy("result-limit-exceeded")
  }
  return normalized
}

export function boundedIncomingCalls(
  calls: readonly SemanticCallHierarchyIncomingCall[],
  rootUri: string,
): CallHierarchyIncomingCall[] {
  assertCallHierarchyIncomingWorkBudget(calls)
  const grouped = new Map<string, CallHierarchyIncomingCall>()
  let totalRanges = 0
  for (const call of calls) {
    const from = toLspItem(call.from, rootUri)
    const callerKey = JSON.stringify(from)
    const existing = grouped.get(callerKey) ?? { from, fromRanges: [] }
    const seenRanges = new Set(existing.fromRanges.map((range) => JSON.stringify(range)))
    for (const range of call.fromRanges) {
      if (!isProtocolRange(range)) throw incompleteCallHierarchy("source-unmappable")
      const key = JSON.stringify(range)
      if (seenRanges.has(key)) continue
      seenRanges.add(key)
      existing.fromRanges.push({
        start: { ...range.start },
        end: { ...range.end },
      })
      totalRanges += 1
      if (
        existing.fromRanges.length > MAX_RANGES_PER_EDGE
        || totalRanges > MAX_TOTAL_RANGES
      ) throw incompleteCallHierarchy("result-limit-exceeded")
    }
    existing.fromRanges.sort(compareRanges)
    grouped.set(callerKey, existing)
    if (grouped.size > MAX_EDGES) throw incompleteCallHierarchy("result-limit-exceeded")
  }
  const normalized = [...grouped.values()].sort((left, right) => (
    compareItems(left.from, right.from)
  ))
  if (Buffer.byteLength(JSON.stringify(normalized)) > MAX_CALL_BYTES) {
    throw incompleteCallHierarchy("result-limit-exceeded")
  }
  return normalized
}

export function assertCallHierarchyPrepareWorkBudget(
  items: readonly SemanticCallHierarchyItem[],
): void {
  if (!Array.isArray(items)) throw incompleteCallHierarchy("source-unmappable")
  if (items.length > MAX_PREPARE_ITEMS) throw incompleteCallHierarchy("result-limit-exceeded")
}

export function assertCallHierarchyOutgoingWorkBudget(
  calls: readonly SemanticCallHierarchyOutgoingCall[],
): void {
  assertCallHierarchyCallWorkBudget(calls)
}

export function assertCallHierarchyIncomingWorkBudget(
  calls: readonly SemanticCallHierarchyIncomingCall[],
): void {
  assertCallHierarchyCallWorkBudget(calls)
}

function assertCallHierarchyCallWorkBudget(
  calls: readonly { fromRanges: readonly unknown[] }[],
): void {
  if (!Array.isArray(calls)) throw incompleteCallHierarchy("source-unmappable")
  if (calls.length > MAX_EDGES) throw incompleteCallHierarchy("result-limit-exceeded")
  let rawRanges = 0
  for (const call of calls) {
    if (!isRecord(call) || !Array.isArray(call.fromRanges)) {
      throw incompleteCallHierarchy("source-unmappable")
    }
    rawRanges += call.fromRanges.length
    if (call.fromRanges.length > MAX_RANGES_PER_EDGE || rawRanges > MAX_TOTAL_RANGES) {
      throw incompleteCallHierarchy("result-limit-exceeded")
    }
  }
}

export function staleCallHierarchy(): ResponseError<void> {
  return new ResponseError(
    LSPErrorCodes.ContentModified,
    "Call hierarchy item no longer matches the current document.",
  )
}

export function incompleteCallHierarchy(reason: string): ResponseError<void> {
  return new ResponseError(
    LSPErrorCodes.RequestFailed,
    `Call hierarchy result is incomplete: ${reason}.`,
  )
}

function isValidCallHierarchyItem(value: unknown): value is CallHierarchyItem {
  if (
    !isRecord(value)
    || typeof value.name !== "string"
    || value.name.length === 0
    || Buffer.byteLength(value.name) > MAX_NAME_BYTES
    || typeof value.uri !== "string"
    || !isCanonicalFileUri(value.uri)
    || Buffer.byteLength(value.uri) > MAX_URI_BYTES
    || !isProtocolInteger(value.kind)
    || toSemanticKind(value.kind as SymbolKind) === undefined
    || !isProtocolRange(value.range)
    || !isProtocolRange(value.selectionRange)
    || !containsRange(value.range, value.selectionRange)
    || callHierarchyRootUri(value.data) === undefined
    || (value.detail !== undefined && (
      typeof value.detail !== "string"
      || Buffer.byteLength(value.detail) > MAX_DETAIL_BYTES
    ))
  ) return false
  return Buffer.byteLength(JSON.stringify(value)) <= MAX_INPUT_ITEM_BYTES
}

function toLspItem(value: unknown, rootUri: string): CallHierarchyItem {
  if (!isRecord(value)) throw incompleteCallHierarchy("source-unmappable")
  const { uri, name, kind: semanticKind, detail, range, selectionRange } = value
  if (
    typeof uri !== "string"
    || typeof name !== "string"
    || typeof semanticKind !== "string"
    || (detail !== undefined && typeof detail !== "string")
  ) throw incompleteCallHierarchy("source-unmappable")
  const kind = toLspKind(semanticKind as SemanticCallHierarchyItemKind)
  if (
    Buffer.byteLength(uri) > MAX_URI_BYTES
    || Buffer.byteLength(name) > MAX_NAME_BYTES
    || (detail !== undefined && Buffer.byteLength(detail) > MAX_DETAIL_BYTES)
  ) throw incompleteCallHierarchy("result-limit-exceeded")
  if (isCanonicalFileUri(uri) && isCanonicalFileUri(rootUri) && !isUriWithinRoot(rootUri, uri)) {
    throw incompleteCallHierarchy("source-outside-workspace")
  }
  if (
    kind === undefined
    || !isCanonicalFileUri(uri)
    || !isCanonicalFileUri(rootUri)
    || !isProtocolRange(range)
    || !isProtocolRange(selectionRange)
    || !containsRange(range, selectionRange)
    || name.length === 0
  ) throw incompleteCallHierarchy("source-unmappable")
  return {
    name,
    kind,
    uri,
    range: {
      start: { ...range.start },
      end: { ...range.end },
    },
    selectionRange: {
      start: { ...selectionRange.start },
      end: { ...selectionRange.end },
    },
    data: {
      arktsCallHierarchy: {
        protocol: CALL_HIERARCHY_DATA_PROTOCOL,
        rootUri,
      },
    },
    ...(detail ? { detail } : {}),
  }
}

function toSemanticKind(kind: SymbolKind): SemanticCallHierarchyItemKind | undefined {
  switch (kind) {
    case SymbolKind.File: return "file"
    case SymbolKind.Module: return "module"
    case SymbolKind.Struct: return "struct"
    case SymbolKind.Class: return "class"
    case SymbolKind.Interface: return "interface"
    case SymbolKind.Function: return "function"
    case SymbolKind.Method: return "method"
    case SymbolKind.Property: return "property"
    case SymbolKind.Constructor: return "constructor"
    case SymbolKind.Variable: return "variable"
    case SymbolKind.Constant: return "constant"
    default: return undefined
  }
}

function toLspKind(kind: SemanticCallHierarchyItemKind): SymbolKind | undefined {
  switch (kind) {
    case "file": return SymbolKind.File
    case "module": return SymbolKind.Module
    case "struct": return SymbolKind.Struct
    case "class": return SymbolKind.Class
    case "interface": return SymbolKind.Interface
    case "function": return SymbolKind.Function
    case "method": return SymbolKind.Method
    case "property": return SymbolKind.Property
    case "constructor": return SymbolKind.Constructor
    case "variable": return SymbolKind.Variable
    case "constant": return SymbolKind.Constant
    default: return undefined
  }
}

export function isCanonicalCallHierarchyFileUri(value: string): boolean {
  try {
    const parsed = new URL(value)
    if (
      parsed.protocol !== "file:"
      || parsed.username !== ""
      || parsed.password !== ""
      || parsed.search !== ""
      || parsed.hash !== ""
      || parsed.pathname.length === 0
      || parsed.href !== value
    ) return false
    return pathToFileURL(fileURLToPath(parsed)).href === value
  } catch {
    return false
  }
}

function isCanonicalFileUri(value: string): boolean {
  return isCanonicalCallHierarchyFileUri(value)
}

function callHierarchyRootUri(value: unknown): string | undefined {
  if (!isRecord(value) || Object.keys(value).length !== 1) return undefined
  const route = value.arktsCallHierarchy
  if (
    !isRecord(route)
    || Object.keys(route).length !== 2
    || route.protocol !== CALL_HIERARCHY_DATA_PROTOCOL
    || typeof route.rootUri !== "string"
    || Buffer.byteLength(route.rootUri) > MAX_URI_BYTES
    || !isCanonicalFileUri(route.rootUri)
  ) return undefined
  return route.rootUri
}

function isUriWithinRoot(rootUri: string, documentUri: string): boolean {
  try {
    const relative = path.relative(fileURLToPath(rootUri), fileURLToPath(documentUri))
    return relative === ""
      || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  } catch {
    return false
  }
}

function isTextDocumentIdentifier(value: unknown): value is { uri: string } {
  return isRecord(value) && typeof value.uri === "string" && value.uri.length > 0
}

function isProtocolRange(value: unknown): value is CallHierarchyItem["range"] {
  return isRecord(value)
    && isProtocolPosition(value.start)
    && isProtocolPosition(value.end)
    && comparePositions(value.start, value.end) <= 0
}

function containsRange(
  outer: CallHierarchyItem["range"],
  inner: CallHierarchyItem["range"],
): boolean {
  return comparePositions(outer.start, inner.start) <= 0
    && comparePositions(inner.end, outer.end) <= 0
}

function compareItems(left: CallHierarchyItem, right: CallHierarchyItem): number {
  return compareOrdinalStrings(left.uri, right.uri)
    || compareRanges(left.selectionRange, right.selectionRange)
    || compareOrdinalStrings(left.name, right.name)
    || left.kind - right.kind
}

function compareOrdinalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareRanges(
  left: CallHierarchyItem["range"],
  right: CallHierarchyItem["range"],
): number {
  return comparePositions(left.start, right.start) || comparePositions(left.end, right.end)
}

function comparePositions(left: unknown, right: unknown): number {
  if (!isRecord(left) || !isRecord(right)) return 0
  return Number(left.line) - Number(right.line)
    || Number(left.character) - Number(right.character)
}

function isProtocolPosition(value: unknown): value is { line: number; character: number } {
  return isRecord(value)
    && isProtocolInteger(value.line)
    && isProtocolInteger(value.character)
}

function isProtocolInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= 2_147_483_647
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function invalidParams(message: string): ResponseError<void> {
  return new ResponseError(-32602, message)
}
