const MAX_DOCUMENT_BYTES = 4 * 1_024 * 1_024
const MAX_TOKENS = 200_000
const MAX_DEPTH = 256
const MAX_RANGES = 5_000

const EMPTY_RANGES: readonly FoldingRange[] = Object.freeze([])

export type FoldingRangeKind = "comment" | "imports" | "region"

export interface FoldingRange {
  readonly startLine: number
  readonly startCharacter?: number
  readonly endLine: number
  readonly endCharacter?: number
  readonly kind?: FoldingRangeKind
}

export interface FoldingRangeClientOptions {
  lineFoldingOnly?: boolean
  rangeLimit?: number
}

export interface FoldingRangeProviderOptions {
  maxDocumentBytes?: number
  maxTokens?: number
  maxDepth?: number
  maxRanges?: number
}

interface SourcePosition {
  line: number
  character: number
}

interface Delimiter extends SourcePosition {
  characterToken: "{" | "["
}

interface MutableFoldingRange {
  startLine: number
  startCharacter: number
  endLine: number
  endCharacter: number
  kind?: FoldingRangeKind
}

interface ImportStatement extends MutableFoldingRange {}

interface ImportState extends SourcePosition {
  baseDepth: number
  valid: boolean
  sawFollower: boolean
}

interface ScanResult {
  ranges: MutableFoldingRange[]
  imports: ImportStatement[]
}

export class FoldingRangeProvider {
  private readonly maxDocumentBytes: number
  private readonly maxTokens: number
  private readonly maxDepth: number
  private readonly maxRanges: number

  constructor(options: FoldingRangeProviderOptions = {}) {
    this.maxDocumentBytes = boundedLimit(
      options.maxDocumentBytes,
      MAX_DOCUMENT_BYTES,
      "folding document bytes",
    )
    this.maxTokens = boundedLimit(options.maxTokens, MAX_TOKENS, "folding tokens")
    this.maxDepth = boundedLimit(options.maxDepth, MAX_DEPTH, "folding depth")
    this.maxRanges = boundedLimit(options.maxRanges, MAX_RANGES, "folding ranges")
  }

  provide(
    source: string,
    client: FoldingRangeClientOptions,
  ): readonly Readonly<FoldingRange>[] {
    if (Buffer.byteLength(source) > this.maxDocumentBytes) return EMPTY_RANGES
    const scanned = scanSource(source, {
      maxTokens: this.maxTokens,
      maxDepth: this.maxDepth,
      maxRanges: this.maxRanges,
    })
    if (!scanned) return EMPTY_RANGES
    const importRanges = groupImports(scanned.imports, source)
    const structuralRanges = scanned.ranges.filter((range) => (
      !scanned.imports.some((statement) => contains(statement, range))
    ))
    const ranges = uniqueSortedRanges([...importRanges, ...structuralRanges])
    const rangeLimit = clientRangeLimit(client.rangeLimit, this.maxRanges)
    if (rangeLimit === 0) return EMPTY_RANGES
    return Object.freeze(ranges.slice(0, rangeLimit).map((range) => Object.freeze(
      client.lineFoldingOnly
        ? {
            startLine: range.startLine,
            endLine: range.endLine,
            ...(range.kind ? { kind: range.kind } : {}),
          }
        : { ...range },
    )))
  }
}

function scanSource(
  source: string,
  limits: { maxTokens: number; maxDepth: number; maxRanges: number },
): ScanResult | undefined {
  let offset = 0
  let line = 0
  let column = 0
  let tokens = 0
  let lineHasCode = false
  let expressionExpected = true
  let currentImport: ImportState | undefined
  const delimiters: Delimiter[] = []
  const ranges: MutableFoldingRange[] = []
  const imports: ImportStatement[] = []

  const acceptToken = (): boolean => {
    tokens += 1
    return tokens <= limits.maxTokens
  }
  const acceptRange = (range: MutableFoldingRange): boolean => {
    if (range.endLine <= range.startLine) return true
    ranges.push(range)
    return ranges.length + imports.length <= limits.maxRanges
  }
  const finishImport = (endLine: number, endCharacter: number): boolean => {
    if (!currentImport) return true
    if (currentImport.valid && currentImport.sawFollower) {
      imports.push({
        startLine: currentImport.line,
        startCharacter: currentImport.character,
        endLine,
        endCharacter,
      })
      if (ranges.length + imports.length > limits.maxRanges) return false
    }
    currentImport = undefined
    return true
  }
  const advance = (): void => {
    if (source[offset] === "\r" && source[offset + 1] === "\n") offset += 2
    else offset += 1
    line += 1
    column = 0
    lineHasCode = false
  }

  while (offset < source.length) {
    const current = source[offset]
    const next = source[offset + 1]
    if (current === "\n" || current === "\r") {
      if (
        currentImport
        && delimiters.length <= currentImport.baseDepth
        && !finishImport(line, column)
      ) return undefined
      advance()
      continue
    }
    if (isHorizontalWhitespace(current)) {
      offset += 1
      column += 1
      continue
    }
    if (current === "/" && next === "/") {
      if (!acceptToken()) return undefined
      offset += 2
      column += 2
      while (offset < source.length && source[offset] !== "\n" && source[offset] !== "\r") {
        offset += 1
        column += 1
      }
      continue
    }
    if (current === "/" && next === "*") {
      if (!acceptToken()) return undefined
      const startLine = line
      const startCharacter = column
      offset += 2
      column += 2
      let closed = false
      while (offset < source.length) {
        if (source[offset] === "*" && source[offset + 1] === "/") {
          offset += 2
          column += 2
          closed = true
          break
        }
        if (source[offset] === "\n" || source[offset] === "\r") advance()
        else {
          offset += 1
          column += 1
        }
      }
      if (!closed) return undefined
      if (!acceptRange({ startLine, startCharacter, endLine: line, endCharacter: column, kind: "comment" })) {
        return undefined
      }
      continue
    }
    if (current === "/" && expressionExpected) {
      const regularExpressionEnd = scanRegularExpressionLiteral(source, offset)
      if (regularExpressionEnd !== undefined) {
        if (!acceptToken()) return undefined
        column += regularExpressionEnd - offset
        offset = regularExpressionEnd
        if (currentImport && !currentImport.sawFollower) currentImport.sawFollower = true
        lineHasCode = true
        expressionExpected = false
        continue
      }
    }
    if (current === '"' || current === "'" || current === "`") {
      if (!acceptToken()) return undefined
      if (currentImport && !currentImport.sawFollower) currentImport.sawFollower = true
      const quote = current
      offset += 1
      column += 1
      let closed = false
      while (offset < source.length) {
        const stringCharacter = source[offset]
        if (stringCharacter === "\\") {
          offset += 1
          column += 1
          if (offset >= source.length) break
          if (source[offset] === "\n" || source[offset] === "\r") advance()
          else {
            offset += 1
            column += 1
          }
          continue
        }
        if (stringCharacter === quote) {
          offset += 1
          column += 1
          closed = true
          break
        }
        if (stringCharacter === "\n" || stringCharacter === "\r") {
          if (quote !== "`") return undefined
          advance()
        } else {
          offset += 1
          column += 1
        }
      }
      if (!closed) return undefined
      lineHasCode = true
      expressionExpected = false
      continue
    }
    if (isIdentifierStart(current)) {
      if (!acceptToken()) return undefined
      const startLine = line
      const startCharacter = column
      const startOffset = offset
      do {
        offset += 1
        column += 1
      } while (offset < source.length && isIdentifierPart(source[offset]))
      const identifier = source.slice(startOffset, offset)
      if (identifier === "import" && !lineHasCode && !currentImport) {
        currentImport = {
          line: startLine,
          character: startCharacter,
          baseDepth: delimiters.length,
          valid: true,
          sawFollower: false,
        }
      } else if (currentImport && !currentImport.sawFollower) {
        currentImport.sawFollower = true
      }
      lineHasCode = true
      expressionExpected = identifierExpectsExpression(identifier)
      continue
    }
    if (isDecimalDigit(current)) {
      if (!acceptToken()) return undefined
      while (offset < source.length && isDecimalDigit(source[offset])) {
        offset += 1
        column += 1
      }
      if (currentImport && !currentImport.sawFollower) currentImport.sawFollower = true
      lineHasCode = true
      expressionExpected = false
      continue
    }
    if (!acceptToken()) return undefined
    const tokenLine = line
    const tokenColumn = column
    offset += 1
    column += 1
    if (currentImport && !currentImport.sawFollower) {
      if (current === "(" || current === ".") currentImport.valid = false
      else currentImport.sawFollower = true
    }
    if (current === "{" || current === "[") {
      delimiters.push({ line: tokenLine, character: tokenColumn, characterToken: current })
      if (delimiters.length > limits.maxDepth) return undefined
      expressionExpected = true
    } else if (current === "}" || current === "]") {
      const expected = current === "}" ? "{" : "["
      const opened = delimiters.pop()
      if (!opened || opened.characterToken !== expected) return undefined
      if (!acceptRange({
        startLine: opened.line,
        startCharacter: opened.character,
        endLine: tokenLine,
        endCharacter: tokenColumn + 1,
      })) return undefined
      expressionExpected = false
    } else {
      expressionExpected = punctuationExpectsExpression(current)
    }
    if (current === ";" && !finishImport(tokenLine, tokenColumn + 1)) return undefined
    lineHasCode = true
  }

  if (delimiters.length > 0) return undefined
  if (!finishImport(line, column)) return undefined
  return { ranges, imports }
}

function scanRegularExpressionLiteral(source: string, start: number): number | undefined {
  let offset = start + 1
  let inCharacterClass = false
  while (offset < source.length) {
    const character = source[offset]
    if (character === "\n" || character === "\r") return undefined
    if (character === "\\") {
      offset += 2
      continue
    }
    if (character === "[") inCharacterClass = true
    else if (character === "]") inCharacterClass = false
    else if (character === "/" && !inCharacterClass) {
      offset += 1
      while (offset < source.length && isIdentifierPart(source[offset])) offset += 1
      return offset
    }
    offset += 1
  }
  return undefined
}

function identifierExpectsExpression(identifier: string): boolean {
  switch (identifier) {
    case "await":
    case "case":
    case "delete":
    case "do":
    case "else":
    case "in":
    case "instanceof":
    case "new":
    case "of":
    case "return":
    case "throw":
    case "typeof":
    case "void":
    case "yield":
      return true
    default:
      return false
  }
}

function punctuationExpectsExpression(character: string): boolean {
  return character !== ")"
    && character !== "]"
    && character !== "}"
    && character !== "."
}

function groupImports(imports: readonly ImportStatement[], source: string): MutableFoldingRange[] {
  if (imports.length === 0) return []
  const lines = source.split(/\r?\n/u)
  const groups: MutableFoldingRange[] = []
  let start = imports[0]
  let end = start
  const flush = (): void => {
    if (!start || !end) return
    if (start.startLine < end.endLine) {
      groups.push({
        startLine: start.startLine,
        startCharacter: start.startCharacter,
        endLine: end.endLine,
        endCharacter: end.endCharacter,
        kind: "imports",
      })
    }
  }
  for (let index = 1; index < imports.length; index += 1) {
    const candidate = imports[index]
    if (!candidate) continue
    const between = lines.slice(end.endLine + 1, candidate.startLine)
    if (between.every((line) => line.trim().length === 0)) {
      end = candidate
      continue
    }
    flush()
    start = candidate
    end = candidate
  }
  flush()
  return groups
}

function contains(container: ImportStatement, candidate: MutableFoldingRange): boolean {
  return candidate.startLine >= container.startLine
    && candidate.endLine <= container.endLine
}

function uniqueSortedRanges(ranges: MutableFoldingRange[]): MutableFoldingRange[] {
  const result: MutableFoldingRange[] = []
  const seen = new Set<string>()
  for (const range of ranges.filter(({ startLine, endLine }) => endLine > startLine)) {
    const key = [
      range.startLine,
      range.startCharacter,
      range.endLine,
      range.endCharacter,
      range.kind ?? "",
    ].join(":")
    if (seen.has(key)) continue
    seen.add(key)
    result.push(range)
  }
  return result.sort(compareRanges)
}

function compareRanges(left: MutableFoldingRange, right: MutableFoldingRange): number {
  return left.startLine - right.startLine
    || left.startCharacter - right.startCharacter
    || right.endLine - left.endLine
    || right.endCharacter - left.endCharacter
    || ordinalCompare(left.kind ?? "", right.kind ?? "")
}

function clientRangeLimit(requested: number | undefined, hardLimit: number): number {
  if (requested === undefined) return hardLimit
  if (!Number.isSafeInteger(requested) || requested < 0) return hardLimit
  return Math.min(requested, hardLimit)
}

function boundedLimit(value: number | undefined, hardMaximum: number, label: string): number {
  if (value === undefined) return hardMaximum
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${label} limit must be a positive safe integer`)
  }
  return Math.min(value, hardMaximum)
}

function isHorizontalWhitespace(character: string | undefined): boolean {
  return character === " " || character === "\t" || character === "\v" || character === "\f"
}

function isIdentifierStart(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z_$]/u.test(character)
}

function isIdentifierPart(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_$]/u.test(character)
}

function isDecimalDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "0" && character <= "9"
}

function ordinalCompare(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
