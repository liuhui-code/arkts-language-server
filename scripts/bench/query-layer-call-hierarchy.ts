import path from "node:path"
import { pathToFileURL } from "node:url"
import ts from "typescript"

import type { SemanticCallHierarchyItem, SemanticCallHierarchyItemKind } from "../../src/contracts/semantic-engine.js"
import { boundedCallHierarchyItems, boundedIncomingCalls } from "../../src/lsp/call-hierarchy-adapter.js"

interface Target {
  id: string; kind: string; callHierarchyTargetId?: string
  callHierarchySelector?: { name: string; kind?: number }
}

/** Official calls and public LSP mapping are separate so compiler timing excludes result encoding. */
export function queryOfficialCallHierarchy(service: ts.LanguageService, file: string, offset: number,
  target: Target, root: string, prepared: Map<string, readonly ts.CallHierarchyItem[]>) {
  const rootUri = pathToFileURL(root).href
  const map = (item: ts.CallHierarchyItem): SemanticCallHierarchyItem => {
    const kind = kinds.get(item.kind)
    if (!kind) throw new Error(`QUERY_LAYER_CALL_KIND_UNSUPPORTED:${item.kind}`)
    return { uri: pathToFileURL(item.file).href, name: item.name, kind,
      range: range(service, item.file, item.span), selectionRange: range(service, item.file, item.selectionSpan),
      ...(item.containerName ? { detail: item.containerName } : {}) }
  }
  if (target.kind === "prepareCallHierarchy") {
    const raw = service.prepareCallHierarchy(file, offset)
    const items = raw ? Array.isArray(raw) ? raw : [raw] : []
    prepared.set(target.id, items)
    return () => boundedCallHierarchyItems(items.map(map), rootUri)
  }
  const selector = target.callHierarchySelector!
  const items = (prepared.get(target.callHierarchyTargetId!) ?? []).filter(item => {
    const mapped = boundedCallHierarchyItems([map(item)], rootUri)[0]
    return mapped.name === selector.name && (selector.kind === undefined || mapped.kind === selector.kind)
  })
  if (items.length !== 1) throw new Error("QUERY_LAYER_CALL_SOURCE_UNAVAILABLE")
  const item = items[0]
  const calls = service.provideCallHierarchyIncomingCalls(item.file, item.selectionSpan.start)
  return () => boundedIncomingCalls(calls.map(call => ({ from: map(call.from),
    fromRanges: call.fromSpans.map(span => range(service, call.from.file, span)) })), rootUri)
}

function range(service: ts.LanguageService, file: string, span: ts.TextSpan) {
  const source = service.getProgram()?.getSourceFile(path.resolve(file))
  if (!source) throw new Error("QUERY_LAYER_CALL_SOURCE_UNAVAILABLE")
  return { start: source.getLineAndCharacterOfPosition(span.start),
    end: source.getLineAndCharacterOfPosition(span.start + span.length) }
}

const kinds = new Map<string, SemanticCallHierarchyItemKind>([
  [ts.ScriptElementKind.structElement, "struct"], [ts.ScriptElementKind.scriptElement, "file"],
  [ts.ScriptElementKind.moduleElement, "module"], [ts.ScriptElementKind.classElement, "class"],
  [ts.ScriptElementKind.localClassElement, "class"], [ts.ScriptElementKind.interfaceElement, "interface"],
  [ts.ScriptElementKind.functionElement, "function"], [ts.ScriptElementKind.localFunctionElement, "function"],
  [ts.ScriptElementKind.memberFunctionElement, "method"], [ts.ScriptElementKind.memberGetAccessorElement, "method"],
  [ts.ScriptElementKind.memberSetAccessorElement, "method"], [ts.ScriptElementKind.memberVariableElement, "property"],
  [ts.ScriptElementKind.memberAccessorVariableElement, "property"],
  [ts.ScriptElementKind.constructorImplementationElement, "constructor"], [ts.ScriptElementKind.constElement, "constant"],
  [ts.ScriptElementKind.letElement, "variable"], [ts.ScriptElementKind.variableElement, "variable"],
  [ts.ScriptElementKind.localVariableElement, "variable"],
])
