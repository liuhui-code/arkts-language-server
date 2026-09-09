import path from "node:path"

import ts from "typescript"

const DEFAULT_MAX_DOCUMENT_BYTES = 4 * 1_024 * 1_024
const HARD_MAX_DOCUMENT_BYTES = 16 * 1_024 * 1_024
const DEFAULT_MAX_EDITS = 4_096
const HARD_MAX_EDITS = 16_384
const DEFAULT_MAX_REPLACEMENT_BYTES = 1 * 1_024 * 1_024
const HARD_MAX_REPLACEMENT_BYTES = 4 * 1_024 * 1_024
const EMPTY_EDITS: readonly Readonly<ArktsOffsetTextEdit>[] = Object.freeze([])

export interface ArktsDocumentFormattingOptions {
  tabSize: number
  insertSpaces: boolean
  trimTrailingWhitespace?: boolean
  insertFinalNewline?: boolean
  trimFinalNewlines?: boolean
}

export interface ArktsDocumentFormatterLimits {
  maxDocumentBytes?: number
  maxEdits?: number
  maxReplacementBytes?: number
}

export interface ArktsOffsetTextEdit {
  start: number
  length: number
  newText: string
}

export function formatArktsDocument(
  filePath: string,
  source: string,
  options: ArktsDocumentFormattingOptions,
  limits: ArktsDocumentFormatterLimits = {},
): readonly Readonly<ArktsOffsetTextEdit>[] {
  const maxDocumentBytes = boundedLimit(
    limits.maxDocumentBytes,
    DEFAULT_MAX_DOCUMENT_BYTES,
    HARD_MAX_DOCUMENT_BYTES,
  )
  const maxEdits = boundedLimit(limits.maxEdits, DEFAULT_MAX_EDITS, HARD_MAX_EDITS)
  const maxReplacementBytes = boundedLimit(
    limits.maxReplacementBytes,
    DEFAULT_MAX_REPLACEMENT_BYTES,
    HARD_MAX_REPLACEMENT_BYTES,
  )
  const tabSize = boundedTabSize(options.tabSize)
  if (
    !filePath
    || maxDocumentBytes === 0
    || maxEdits === 0
    || maxReplacementBytes === 0
    || tabSize === undefined
    || Buffer.byteLength(source, "utf8") > maxDocumentBytes
  ) return EMPTY_EDITS

  const normalizedPath = path.resolve(filePath)
  const snapshot = ts.ScriptSnapshot.fromString(source)
  const compilerOptions: ts.CompilerOptions = {
    allowNonTsExtensions: true,
    noLib: true,
    noResolve: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.Latest,
  }
  const host: ts.LanguageServiceHost = {
    fileExists: candidate => samePath(candidate, normalizedPath),
    getCompilationSettings: () => compilerOptions,
    getCurrentDirectory: () => path.dirname(normalizedPath),
    getDefaultLibFileName: settings => ts.getDefaultLibFilePath(settings),
    getScriptFileNames: () => [normalizedPath],
    getScriptKind: () => ts.ScriptKind.ETS,
    getScriptSnapshot: candidate => samePath(candidate, normalizedPath) ? snapshot : undefined,
    getScriptVersion: () => "0",
    readFile: candidate => samePath(candidate, normalizedPath) ? source : undefined,
    readDirectory: () => [],
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
  }
  const service = ts.createLanguageService(host, ts.createDocumentRegistry())
  const newLineCharacter = source.includes("\r\n") ? "\r\n" : "\n"
  let changes: readonly ts.TextChange[]
  try {
    changes = service.getFormattingEditsForDocument(normalizedPath, {
      convertTabsToSpaces: options.insertSpaces,
      indentSize: tabSize,
      indentStyle: ts.IndentStyle.Smart,
      insertSpaceAfterCommaDelimiter: true,
      insertSpaceAfterKeywordsInControlFlowStatements: true,
      insertSpaceAfterSemicolonInForStatements: true,
      insertSpaceBeforeAndAfterBinaryOperators: true,
      insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
      insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
      insertSpaceBeforeFunctionParenthesis: false,
      newLineCharacter,
      semicolons: ts.SemicolonPreference.Ignore,
      tabSize,
      trimTrailingWhitespace: options.trimTrailingWhitespace ?? false,
    })
    changes = preserveTopLevelStructIndentation(
      changes,
      service.getProgram()?.getSourceFile(normalizedPath),
    )
  } catch {
    return EMPTY_EDITS
  } finally {
    service.dispose()
  }

  const finalNewlineEdit = finalNewlineTextChange(source, newLineCharacter, options)
  if (finalNewlineEdit) changes = [...changes, finalNewlineEdit]

  if (changes.length > maxEdits) return EMPTY_EDITS
  const edits = changes
    .filter(change => source.slice(
      change.span.start,
      change.span.start + change.span.length,
    ) !== change.newText)
    .map(change => ({
      start: change.span.start,
      length: change.span.length,
      newText: change.newText,
    }))
    .sort(compareEdits)
  if (edits.length > maxEdits || !validEdits(source, edits, maxReplacementBytes)) {
    return EMPTY_EDITS
  }

  const formatted = applyEdits(source, edits)
  if (!hasSameTokens(source, formatted)) return EMPTY_EDITS
  return Object.freeze(edits.map(edit => Object.freeze(edit)))
}

function preserveTopLevelStructIndentation(
  changes: readonly ts.TextChange[],
  sourceFile: ts.SourceFile | undefined,
): readonly ts.TextChange[] {
  if (!sourceFile) return changes
  const starts = new Set(sourceFile.statements
    .filter(ts.isStructDeclaration)
    .map(statement => statement.getChildren(sourceFile)
      .find(child => child.kind === ts.SyntaxKind.StructKeyword)
      ?.getStart(sourceFile))
    .filter((start): start is number => start !== undefined))
  return changes.filter(change => !(
    change.span.length === 0
    && starts.has(change.span.start)
    && /^\s+$/u.test(change.newText)
  ))
}

function finalNewlineTextChange(
  source: string,
  newLineCharacter: "\r\n" | "\n",
  options: ArktsDocumentFormattingOptions,
): ts.TextChange | undefined {
  const trailingNewlines = /(?:\r\n|\r|\n)+$/u.exec(source)
  if (options.trimFinalNewlines && trailingNewlines) {
    return {
      span: { start: trailingNewlines.index, length: trailingNewlines[0].length },
      newText: newLineCharacter,
    }
  }
  if (options.insertFinalNewline && !trailingNewlines) {
    return {
      span: { start: source.length, length: 0 },
      newText: newLineCharacter,
    }
  }
  return undefined
}

function boundedLimit(value: number | undefined, fallback: number, hardMaximum: number): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value <= 0) return 0
  return Math.min(value, hardMaximum)
}

function boundedTabSize(value: number): number | undefined {
  if (!Number.isSafeInteger(value) || value < 1 || value > 16) return undefined
  return value
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = path.resolve(left)
  if (ts.sys.useCaseSensitiveFileNames) return normalizedLeft === right
  return normalizedLeft.toLocaleLowerCase() === right.toLocaleLowerCase()
}

function compareEdits(left: ArktsOffsetTextEdit, right: ArktsOffsetTextEdit): number {
  return left.start - right.start
    || left.length - right.length
    || left.newText.localeCompare(right.newText)
}

function validEdits(
  source: string,
  edits: readonly ArktsOffsetTextEdit[],
  maxReplacementBytes: number,
): boolean {
  let previousEnd = 0
  let replacementBytes = 0
  for (const edit of edits) {
    if (
      !Number.isSafeInteger(edit.start)
      || !Number.isSafeInteger(edit.length)
      || edit.start < previousEnd
      || edit.length < 0
      || edit.start + edit.length > source.length
    ) return false
    previousEnd = edit.start + edit.length
    replacementBytes += Buffer.byteLength(edit.newText, "utf8")
    if (replacementBytes > maxReplacementBytes) return false
  }
  return true
}

function applyEdits(source: string, edits: readonly ArktsOffsetTextEdit[]): string {
  let result = source
  for (let index = edits.length - 1; index >= 0; index -= 1) {
    const edit = edits[index]
    if (!edit) continue
    result = result.slice(0, edit.start)
      + edit.newText
      + result.slice(edit.start + edit.length)
  }
  return result
}

function hasSameTokens(before: string, after: string): boolean {
  const beforeScanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    before,
  )
  const afterScanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    after,
  )
  while (true) {
    const beforeKind = beforeScanner.scan()
    const afterKind = afterScanner.scan()
    if (
      beforeKind !== afterKind
      || beforeScanner.getTokenText() !== afterScanner.getTokenText()
    ) return false
    if (beforeKind === ts.SyntaxKind.EndOfFileToken) return true
  }
}
