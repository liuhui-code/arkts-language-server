import ts from "typescript"
import type { SemanticDocumentSymbolInfo, SemanticDocumentSymbolKind } from "../protocol.js"
import type { ScriptRecord } from "./typescript-script-record.js"
import { CooperativeWork } from "./cooperative-work.js"

interface NavigationTraversalFrame {
  item?: ts.NavigationTree
  span?: ts.TextSpan
  kind?: SemanticDocumentSymbolKind | null
  childItems: readonly ts.NavigationTree[]
  nextChildIndex: number
  symbols: SemanticDocumentSymbolInfo[]
}

export function navigationSymbols(
  items: readonly ts.NavigationTree[],
  script: ScriptRecord,
  work: CooperativeWork,
): SemanticDocumentSymbolInfo[] {
  const root: NavigationTraversalFrame = {
    childItems: items,
    nextChildIndex: 0,
    symbols: [],
  }
  const stack = [root]
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]
    if (frame.nextChildIndex < frame.childItems.length) {
      const item = frame.childItems[frame.nextChildIndex]
      frame.nextChildIndex += 1
      const span = item.spans[0]
      work.item()
      if (!span) continue
      stack.push({
        item,
        span,
        kind: documentSymbolKind(item, script),
        childItems: item.childItems ?? [],
        nextChildIndex: 0,
        symbols: [],
      })
      continue
    }

    stack.pop()
    if (!frame.item || !frame.span) return frame.symbols
    frame.symbols.sort(work.comparator(compareDocumentSymbols))
    const parent = stack[stack.length - 1]
    if (!frame.kind) {
      for (const symbol of frame.symbols) {
        parent.symbols.push(symbol)
        work.item()
      }
      continue
    }
    const nameSpan = frame.item.nameSpan ?? { start: frame.span.start, length: 0 }
    parent.symbols.push({
      name: frame.item.text,
      kind: frame.kind,
      range: script.virtualDocument.generatedSpanToSourceRange(
        frame.span.start,
        frame.span.length,
      ),
      selectionRange: script.virtualDocument.generatedSpanToSourceRange(
        nameSpan.start,
        nameSpan.length,
      ),
      children: frame.symbols.length > 0 ? frame.symbols : undefined,
    })
    work.item()
  }
  return root.symbols
}

function documentSymbolKind(
  item: ts.NavigationTree,
  script: ScriptRecord,
): SemanticDocumentSymbolKind | null {
  switch (item.kind) {
    case ts.ScriptElementKind.structElement: return "struct"
    case ts.ScriptElementKind.classElement:
    case ts.ScriptElementKind.localClassElement:
      return isArktsStruct(item, script) ? "struct" : "class"
    case ts.ScriptElementKind.interfaceElement: return "interface"
    case ts.ScriptElementKind.enumElement: return "enum"
    case ts.ScriptElementKind.enumMemberElement: return "enumMember"
    case ts.ScriptElementKind.functionElement:
    case ts.ScriptElementKind.localFunctionElement:
      return "function"
    case ts.ScriptElementKind.memberFunctionElement:
    case ts.ScriptElementKind.memberGetAccessorElement:
    case ts.ScriptElementKind.memberSetAccessorElement:
      return "method"
    case ts.ScriptElementKind.memberVariableElement:
    case ts.ScriptElementKind.memberAccessorVariableElement:
      return "property"
    case ts.ScriptElementKind.constructorImplementationElement:
      return item.spans[0]?.length === 0 ? null : "constructor"
    case ts.ScriptElementKind.moduleElement: return "module"
    case ts.ScriptElementKind.typeElement: return "type"
    case ts.ScriptElementKind.constElement:
    case ts.ScriptElementKind.letElement:
    case ts.ScriptElementKind.variableElement:
    case ts.ScriptElementKind.localVariableElement:
      return "variable"
    default: return null
  }
}


function isArktsStruct(item: ts.NavigationTree, script: ScriptRecord): boolean {
  const span = item.spans[0]
  const nameSpan = item.nameSpan
  if (!span || !nameSpan) return false
  const sourceStart = script.virtualDocument.toSourceOffset(span.start)
  const sourceNameStart = script.virtualDocument.toSourceOffset(nameSpan.start)
  return /\bstruct\s*$/.test(script.sourceContent.slice(sourceStart, sourceNameStart))
}

export function compareDocumentSymbols(
  left: SemanticDocumentSymbolInfo,
  right: SemanticDocumentSymbolInfo,
): number {
  return left.range.startLine - right.range.startLine
    || left.range.startColumn - right.range.startColumn
}
