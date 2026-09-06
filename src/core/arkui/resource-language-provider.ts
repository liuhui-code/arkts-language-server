import fs from "node:fs"
import path from "node:path"

import type {
  SemanticCompletionItem,
  SemanticCompletionItemList,
  SemanticDefinitionCandidate,
  SemanticDiagnostic,
  SemanticDocumentPosition,
  SemanticTextRange,
} from "../protocol.js"
import { lineColumnToOffset, spanToRange } from "../types/text-position.js"
import {
  ARKUI_STRING_REFERENCE_PREFIX,
  ArkUIResourceDocumentFactsCache,
  type ArkUIResourceDocumentFactsCacheOptions,
  findResourceLiteralAt,
} from "./resource-document-facts.js"
import { ArkUIResourceIndex, type ArkUIResourceIndexOptions } from "./resource-index.js"

const RESOURCE_NAME_PREFIX = /^[A-Za-z_$][A-Za-z0-9_$]*$/u
const RESOURCE_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/u
const MAX_COMPLETIONS = 128

export interface ArkUIResourceLanguageProviderOptions extends ArkUIResourceIndexOptions {
  documentFacts?: ArkUIResourceDocumentFactsCacheOptions
}

export class ArkUIResourceLanguageProvider {
  private readonly rootPath: string
  private readonly canonicalRoot: string
  private readonly resources: ArkUIResourceIndex
  private readonly documentFacts: ArkUIResourceDocumentFactsCache

  constructor(workspaceRoot: string, options: ArkUIResourceLanguageProviderOptions = {}) {
    this.rootPath = path.resolve(workspaceRoot)
    this.canonicalRoot = canonicalPath(this.rootPath)
    this.resources = new ArkUIResourceIndex(this.rootPath, options)
    this.documentFacts = new ArkUIResourceDocumentFactsCache(options.documentFacts)
  }

  complete(position: SemanticDocumentPosition, sourceContent: string): SemanticCompletionItemList {
    if (!this.accepts(position.path)) return { items: [], isIncomplete: false }
    const offset = lineColumnToOffset(sourceContent, position.line, position.column)
    const literal = findResourceLiteralAt(
      this.documentFacts.forDocument(position, sourceContent),
      offset,
    )
    if (!literal || offset < literal.nameStart || offset > literal.valueEnd) {
      return { items: [], isIncomplete: false }
    }
    const typedReference = sourceContent.slice(literal.valueStart, offset)
    if (!typedReference.startsWith(ARKUI_STRING_REFERENCE_PREFIX)) {
      return { items: [], isIncomplete: false }
    }
    const namePrefix = typedReference.slice(ARKUI_STRING_REFERENCE_PREFIX.length)
    if (namePrefix.length > 0 && !RESOURCE_NAME_PREFIX.test(namePrefix)) {
      return { items: [], isIncomplete: false }
    }
    const replacementRange = spanToRange(
      sourceContent,
      literal.nameStart,
      offset - literal.nameStart,
    )
    const query = this.resources.findByPrefix(
      `${ARKUI_STRING_REFERENCE_PREFIX}${namePrefix}`,
      MAX_COMPLETIONS,
    )
    return {
      items: query.resources.map((resource) => ({
        label: resource.name,
        detail: `ArkUI string resource ${resource.reference}`,
        kind: "property",
        insertText: resource.name,
        filterText: resource.name,
        sortText: `0000:${resource.name}`,
        source: "arkui",
        replacementRange,
        data: { provider: "arkui-resource", reference: resource.reference },
      })),
      isIncomplete: query.isIncomplete,
    }
  }

  define(position: SemanticDocumentPosition, sourceContent: string): SemanticDefinitionCandidate[] {
    if (!this.accepts(position.path)) return []
    const offset = lineColumnToOffset(sourceContent, position.line, position.column)
    const literal = findResourceLiteralAt(
      this.documentFacts.forDocument(position, sourceContent),
      offset,
    )
    if (!literal || offset < literal.nameStart || offset > literal.valueEnd) return []
    if (!literal.value.startsWith(ARKUI_STRING_REFERENCE_PREFIX)) return []
    const name = literal.value.slice(ARKUI_STRING_REFERENCE_PREFIX.length)
    if (!RESOURCE_NAME.test(name)) return []
    return this.resources.findExact(literal.value).resources.map(({ path: resourcePath, range }) => ({
      path: resourcePath,
      range,
    }))
  }

  diagnostics(
    position: SemanticDocumentPosition,
    sourceContent: string,
  ): SemanticDiagnostic[] {
    if (!this.accepts(position.path)) return []
    const literals = this.documentFacts.forDocument(position, sourceContent).literals.filter(({ value }) => (
      value.startsWith(ARKUI_STRING_REFERENCE_PREFIX)
      && RESOURCE_NAME.test(value.slice(ARKUI_STRING_REFERENCE_PREFIX.length))
    ))
    const diagnostics: SemanticDiagnostic[] = []
    for (const literal of literals) {
      const query = this.resources.findExact(literal.value)
      if (query.status !== "ready") return []
      if (query.resources.length > 0) continue
      diagnostics.push({
        source: "language",
        severity: "error",
        code: "arkui.resource.not-found",
        path: path.resolve(position.path),
        range: spanToRange(
          sourceContent,
          literal.nameStart,
          literal.valueEnd - literal.nameStart,
        ),
        message: `ArkUI string resource '${literal.value}' was not found.`,
      })
    }
    return diagnostics
  }

  invalidate(): void {
    this.resources.invalidate()
  }

  dispose(): void {
    this.resources.dispose()
    this.documentFacts.clear()
  }

  private accepts(filePath: string): boolean {
    return isInside(this.canonicalRoot, canonicalPath(filePath))
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
