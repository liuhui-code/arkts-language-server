import fs from "node:fs"
import path from "node:path"

import ts from "typescript"

import type {
  SemanticCompletionItem,
  SemanticDefinitionCandidate,
  SemanticDocumentPosition,
  SemanticTextRange,
} from "../protocol.js"
import { lineColumnToOffset, spanToRange } from "../types/text-position.js"
import { ArkUIResourceIndex, type ArkUIResourceIndexOptions } from "./resource-index.js"

const RESOURCE_PREFIX = "app.string."
const RESOURCE_NAME_PREFIX = /^[A-Za-z_$][A-Za-z0-9_$]*$/u
const RESOURCE_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/u

interface ResourceLiteral {
  value: string
  nameStart: number
  valueStart: number
  valueEnd: number
}

export class ArkUIResourceLanguageProvider {
  private readonly rootPath: string
  private readonly canonicalRoot: string
  private readonly resources: ArkUIResourceIndex

  constructor(workspaceRoot: string, options: ArkUIResourceIndexOptions = {}) {
    this.rootPath = path.resolve(workspaceRoot)
    this.canonicalRoot = canonicalPath(this.rootPath)
    this.resources = new ArkUIResourceIndex(this.rootPath, options)
  }

  complete(position: SemanticDocumentPosition, sourceContent: string): SemanticCompletionItem[] {
    if (!this.accepts(position.path)) return []
    const offset = lineColumnToOffset(sourceContent, position.line, position.column)
    const literal = resourceLiteralAt(sourceContent, offset)
    if (!literal || offset < literal.nameStart || offset > literal.valueEnd) return []
    const typedReference = sourceContent.slice(literal.valueStart, offset)
    if (!typedReference.startsWith(RESOURCE_PREFIX)) return []
    const namePrefix = typedReference.slice(RESOURCE_PREFIX.length)
    if (namePrefix.length > 0 && !RESOURCE_NAME_PREFIX.test(namePrefix)) return []
    const replacementRange = spanToRange(
      sourceContent,
      literal.nameStart,
      offset - literal.nameStart,
    )
    return this.resources.findByPrefix(`${RESOURCE_PREFIX}${namePrefix}`).map((resource) => ({
      label: resource.name,
      detail: `ArkUI string resource ${resource.reference}`,
      kind: "property",
      insertText: resource.name,
      filterText: resource.name,
      sortText: `0000:${resource.name}`,
      source: "arkui",
      replacementRange,
      data: { provider: "arkui-resource", reference: resource.reference },
    }))
  }

  define(position: SemanticDocumentPosition, sourceContent: string): SemanticDefinitionCandidate[] {
    if (!this.accepts(position.path)) return []
    const offset = lineColumnToOffset(sourceContent, position.line, position.column)
    const literal = resourceLiteralAt(sourceContent, offset)
    if (!literal || offset < literal.nameStart || offset > literal.valueEnd) return []
    if (!literal.value.startsWith(RESOURCE_PREFIX)) return []
    const name = literal.value.slice(RESOURCE_PREFIX.length)
    if (!RESOURCE_NAME.test(name)) return []
    return this.resources.findExact(literal.value).map(({ path: resourcePath, range }) => ({
      path: resourcePath,
      range,
    }))
  }

  invalidate(): void {
    this.resources.invalidate()
  }

  dispose(): void {
    this.resources.dispose()
  }

  private accepts(filePath: string): boolean {
    return isInside(this.canonicalRoot, canonicalPath(filePath))
  }
}

function resourceLiteralAt(content: string, offset: number): ResourceLiteral | undefined {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    content,
  )
  const previous: Array<{ kind: ts.SyntaxKind; text: string }> = []
  while (true) {
    const kind = scanner.scan()
    if (kind === ts.SyntaxKind.EndOfFileToken) return undefined
    const start = scanner.getTokenPos()
    const end = scanner.getTextPos()
    if (kind === ts.SyntaxKind.StringLiteral && start < offset && offset <= end) {
      const tokenText = scanner.getTokenText()
      const quote = tokenText[0]
      if ((quote !== '"' && quote !== "'") || tokenText.at(-1) !== quote) return undefined
      const rawValue = tokenText.slice(1, -1)
      if (rawValue.includes("\\")) return undefined
      const openParen = previous.at(-1)
      const callee = previous.at(-2)
      if (
        openParen?.kind !== ts.SyntaxKind.OpenParenToken
        || callee?.kind !== ts.SyntaxKind.Identifier
        || callee.text !== "$r"
      ) return undefined
      const valueStart = start + 1
      const valueEnd = end - 1
      const value = rawValue
      if (!value.startsWith(RESOURCE_PREFIX)) return undefined
      return {
        value,
        nameStart: valueStart + RESOURCE_PREFIX.length,
        valueStart,
        valueEnd,
      }
    }
    previous.push({ kind, text: scanner.getTokenText() })
    if (previous.length > 2) previous.shift()
  }
}

function canonicalPath(candidatePath: string): string {
  const resolved = path.resolve(candidatePath)
  try {
    return fs.realpathSync.native(resolved)
  } catch {
    try {
      return path.join(fs.realpathSync.native(path.dirname(resolved)), path.basename(resolved))
    } catch {
      return resolved
    }
  }
}

function isInside(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath)
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}
