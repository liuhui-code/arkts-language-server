import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { validPosition } from "./reference-location-oracle.mjs"

export const editCallKinds = ["prepareRename", "rename", "prepareCallHierarchy", "outgoingCalls", "incomingCalls"]
export const isCallFollowup = kind => ["outgoingCalls", "incomingCalls"].includes(kind)
export const preparedRequestMethod = kind => kind === "completionResolve" ? "completionItem/resolve"
  : isCallFollowup(kind) ? `callHierarchy/${kind}` : `textDocument/${kind}`

export function editCallSelectionIdentity(target) {
  return target.kind === "rename" ? [target.newName] : isCallFollowup(target.kind)
    ? [target.callHierarchyTargetId, target.callHierarchySelector?.name, target.callHierarchySelector?.kind] : []
}

export function validCallSelector(selector) {
  return selector && typeof selector.name === "string" && selector.name.length > 0
    && Object.keys(selector).every(key => ["name", "kind"].includes(key))
    && (selector.kind === undefined || Number.isInteger(selector.kind))
}

export function selectCallItem(items, selector) {
  const matches = items?.filter(item => Object.entries(selector).every(([key, value]) => item[key] === value)) ?? []
  if (matches.length !== 1) throw new Error("CALL_SOURCE_BLOCKED=AMBIGUOUS_OR_MISSING_ITEM")
  return matches[0]
}

/** Validate wire/source integrity without projecting or discarding any semantic field. */
export function validateEditCallPayload(kind, payload, { workspace, overlays = new Map(), versions,
  sourceUri, sourceItem } = {}) {
  const root = fs.realpathSync(workspace)
  const fail = message => { throw new Error(`EDIT_CALL_PAYLOAD_INVALID=${message}`) }
  const source = uri => {
    if (typeof uri !== "string") fail("URI")
    const file = fileURLToPath(uri), relative = path.relative(root, fs.realpathSync(file))
    if (uri !== pathToFileURL(file).href || relative.startsWith("..") || path.isAbsolute(relative)) fail("SOURCE_SCOPE")
    return overlays.get(uri) ?? fs.readFileSync(file, "utf8")
  }
  const range = (uri, value) => {
    const lines = source(uri).split(/\r?\n/u), { start, end } = value ?? {}
    if (!validPosition(start, lines) || !validPosition(end, lines)
      || end.line < start.line || end.line === start.line && end.character < start.character) fail("UTF16_RANGE")
  }
  const item = value => {
    if (!value || typeof value.name !== "string" || !Number.isInteger(value.kind)) fail("ITEM")
    range(value.uri, value.range)
    range(value.uri, value.selectionRange)
    const key = position => [position.line, position.character]
    const less = (a, b) => a[0] < b[0] || a[0] === b[0] && a[1] < b[1]
    if (less(key(value.selectionRange.start), key(value.range.start))
      || less(key(value.range.end), key(value.selectionRange.end))) fail("SELECTION_RANGE")
    const data = value.data?.arktsCallHierarchy
    if (data?.protocol !== 1 || data.rootUri !== pathToFileURL(workspace).href) fail("ITEM_DATA")
  }
  if (kind === "prepareRename") {
    if (payload === null) return
    if (!payload || typeof payload.placeholder !== "string") fail("PREPARE_RENAME")
    range(sourceUri, payload.range)
  } else if (kind === "rename") {
    if (!Array.isArray(payload?.documentChanges) || !payload.documentChanges.length
      || Object.hasOwn(payload, "changes")) fail("WORKSPACE_EDIT")
    for (const change of payload.documentChanges) {
      const { uri, version } = change.textDocument ?? {}
      if (change.kind !== undefined || !Array.isArray(change.edits)
        || version !== null && !Number.isSafeInteger(version)) fail("VERSIONED_EDIT")
      if (versions && version !== (versions.get(uri) ?? null)) fail("EDIT_VERSION")
      for (const edit of change.edits) {
        range(uri, edit.range)
        if (typeof edit.newText !== "string") fail("EDIT_TEXT")
      }
    }
  } else if (kind === "prepareCallHierarchy") {
    if (payload === null) return
    if (!Array.isArray(payload)) fail("PREPARE_CALL")
    payload.forEach(item)
  } else if (isCallFollowup(kind)) {
    if (!Array.isArray(payload) || !sourceItem) fail("CALL_EDGES")
    item(sourceItem)
    for (const edge of payload) {
      const endpoint = kind === "outgoingCalls" ? edge.to : edge.from
      item(endpoint)
      if (!Array.isArray(edge.fromRanges)) fail("CALL_RANGES")
      edge.fromRanges.forEach(value => range(kind === "outgoingCalls" ? sourceItem.uri : endpoint.uri, value))
    }
  }
}
