import path from "node:path"

import ts from "typescript"

const MAX_FACT_DOCUMENTS = 64
const MAX_FACT_BYTES = 4 * 1_024 * 1_024
const ESTIMATED_LITERAL_OVERHEAD_BYTES = 64

export const ARKUI_STRING_REFERENCE_PREFIX = "app.string."

export interface ArkUIResourceLiteral {
  value: string
  nameStart: number
  valueStart: number
  valueEnd: number
}

export interface ArkUIResourceDocumentFacts {
  literals: readonly Readonly<ArkUIResourceLiteral>[]
}

export interface ArkUIResourceDocumentIdentity {
  path: string
  documentVersion?: number
}

export interface ArkUIResourceDocumentFactsCacheOptions {
  maxDocuments?: number
  maxBytes?: number
}

interface CachedDocumentFacts {
  documentVersion?: number
  content: string
  facts: ArkUIResourceDocumentFacts
  byteSize: number
  lastAccess: number
}

export class ArkUIResourceDocumentFactsCache {
  private readonly maxDocuments: number
  private readonly maxBytes: number
  private readonly entries = new Map<string, CachedDocumentFacts>()
  private accessClock = 0
  private cachedBytes = 0

  constructor(options: ArkUIResourceDocumentFactsCacheOptions = {}) {
    this.maxDocuments = boundedLimit(
      options.maxDocuments,
      MAX_FACT_DOCUMENTS,
      "ArkUI fact documents",
    )
    this.maxBytes = boundedLimit(options.maxBytes, MAX_FACT_BYTES, "ArkUI fact bytes")
  }

  forDocument(
    document: ArkUIResourceDocumentIdentity,
    content: string,
  ): ArkUIResourceDocumentFacts {
    const documentPath = path.resolve(document.path)
    const cached = this.entries.get(documentPath)
    if (
      cached
      && cached.documentVersion === document.documentVersion
      && cached.content === content
    ) {
      cached.lastAccess = ++this.accessClock
      return cached.facts
    }

    const facts = createDocumentFacts(content)
    const byteSize = estimateByteSize(content, facts.literals)
    this.delete(documentPath)
    if (byteSize > this.maxBytes) return facts
    this.entries.set(documentPath, {
      documentVersion: document.documentVersion,
      content,
      facts,
      byteSize,
      lastAccess: ++this.accessClock,
    })
    this.cachedBytes += byteSize
    this.evict()
    return facts
  }

  cacheState(): { documents: number; bytes: number } {
    return { documents: this.entries.size, bytes: this.cachedBytes }
  }

  clear(): void {
    this.entries.clear()
    this.cachedBytes = 0
  }

  private evict(): void {
    while (this.entries.size > this.maxDocuments || this.cachedBytes > this.maxBytes) {
      const oldest = [...this.entries.entries()]
        .sort((left, right) => left[1].lastAccess - right[1].lastAccess)[0]
      if (!oldest) return
      this.delete(oldest[0])
    }
  }

  private delete(documentPath: string): void {
    const cached = this.entries.get(documentPath)
    if (!cached) return
    this.cachedBytes -= cached.byteSize
    this.entries.delete(documentPath)
  }
}

export function findResourceLiteralAt(
  facts: ArkUIResourceDocumentFacts,
  offset: number,
): Readonly<ArkUIResourceLiteral> | undefined {
  let low = 0
  let high = facts.literals.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    if ((facts.literals[middle]?.valueStart ?? Number.POSITIVE_INFINITY) <= offset) low = middle + 1
    else high = middle
  }
  const literal = facts.literals[low - 1]
  return literal && offset <= literal.valueEnd ? literal : undefined
}

function createDocumentFacts(content: string): ArkUIResourceDocumentFacts {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    content,
  )
  const previous: Array<{ kind: ts.SyntaxKind; text: string }> = []
  const literals: Readonly<ArkUIResourceLiteral>[] = []
  while (true) {
    const kind = scanner.scan()
    if (kind === ts.SyntaxKind.EndOfFileToken) break
    const tokenText = scanner.getTokenText()
    if (kind === ts.SyntaxKind.StringLiteral) {
      const literal = resourceLiteral(
        scanner.getTokenPos(),
        scanner.getTextPos(),
        tokenText,
        previous,
      )
      if (literal) literals.push(Object.freeze(literal))
    }
    previous.push({ kind, text: tokenText })
    if (previous.length > 2) previous.shift()
  }
  return Object.freeze({ literals: Object.freeze(literals) })
}

function resourceLiteral(
  start: number,
  end: number,
  tokenText: string,
  previous: readonly { kind: ts.SyntaxKind; text: string }[],
): ArkUIResourceLiteral | undefined {
  const quote = tokenText[0]
  if ((quote !== '"' && quote !== "'") || tokenText.at(-1) !== quote) return undefined
  const value = tokenText.slice(1, -1)
  if (value.includes("\\") || !value.startsWith(ARKUI_STRING_REFERENCE_PREFIX)) return undefined
  const openParen = previous.at(-1)
  const callee = previous.at(-2)
  if (
    openParen?.kind !== ts.SyntaxKind.OpenParenToken
    || callee?.kind !== ts.SyntaxKind.Identifier
    || callee.text !== "$r"
  ) return undefined
  const valueStart = start + 1
  return {
    value,
    nameStart: valueStart + ARKUI_STRING_REFERENCE_PREFIX.length,
    valueStart,
    valueEnd: end - 1,
  }
}

function estimateByteSize(
  content: string,
  literals: readonly Readonly<ArkUIResourceLiteral>[],
): number {
  return Buffer.byteLength(content) + literals.reduce((total, literal) => (
    total + ESTIMATED_LITERAL_OVERHEAD_BYTES + Buffer.byteLength(literal.value)
  ), 0)
}

function boundedLimit(value: number | undefined, hardMaximum: number, label: string): number {
  if (value === undefined) return hardMaximum
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${label} limit must be a positive safe integer`)
  }
  return Math.min(value, hardMaximum)
}
