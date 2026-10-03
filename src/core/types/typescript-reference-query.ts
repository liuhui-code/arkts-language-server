import path from "node:path"
import type ts from "typescript"

import type { SemanticDefinitionCandidate, SemanticDocumentPosition, SemanticTextRange } from "../protocol.js"
import type { SemanticReferenceQueryResult } from "./type-engine-contract.js"
import type { SourceDocument } from "./source-document.js"
import { CooperativeWork } from "./cooperative-work.js"
import { lineColumnToOffset } from "./text-position.js"
import { completedReferenceSearchPaths } from "./typescript-reference-search-scope.js"

export interface ReferenceSourceView {
  readonly content: string
  readonly virtualDocument: SourceDocument
}

export interface ReferenceQueryPort {
  readonly rootPath: string
  readonly service: ts.LanguageService
  readonly checkpoint?: () => void
  readonly querySource: (filePath: string) => ReferenceSourceView | undefined
  readonly sourceView: (filePath: string) => ReferenceSourceView | undefined
  readonly membershipFailure: () => Extract<SemanticReferenceQueryResult, { status: "incomplete" }> | undefined
}

/** One complete compiler search; discovery candidates never enter this query. */
export function queryTypeScriptReferences(
  port: ReferenceQueryPort,
  position: SemanticDocumentPosition,
  includeDeclaration: boolean,
  captureSearchScope = false,
  expectedProgram?: ts.Program,
): SemanticReferenceQueryResult {
  const work = new CooperativeWork(port.checkpoint)
  work.boundary()
  const initialMembershipFailure = port.membershipFailure()
  if (initialMembershipFailure) return work.finish(initialMembershipFailure)
  const filePath = path.resolve(position.path)
  const script = port.querySource(filePath)
  if (!script) return work.finish({ status: "incomplete", reason: "source-unavailable" })
  const sourceOffset = lineColumnToOffset(script.virtualDocument.sourceContent, position.line, position.column)
  const offset = script.virtualDocument.toGeneratedOffset(sourceOffset)
  work.boundary()
  const searchedProgram = captureSearchScope ? port.service.getProgram() : undefined
  if (expectedProgram && searchedProgram !== expectedProgram) {
    return work.finish({ status: "incomplete", reason: "source-unavailable" })
  }
  const definitions = port.service.getDefinitionAtPosition(filePath, offset) ?? []
  work.boundary()
  const definitionMembershipFailure = port.membershipFailure()
  if (definitionMembershipFailure) return work.finish(definitionMembershipFailure)
  if (definitions.length === 0) return work.finish({ status: "complete", references: [] })

  const canonicalDefinitionKeys = new Set<string>()
  for (const definition of definitions) {
    canonicalDefinitionKeys.add(typescriptSpanKey(path.resolve(definition.fileName), definition.textSpan))
    work.item()
  }
  const sourceViews = new Map<string, ReferenceSourceView>()
  const references: SemanticDefinitionCandidate[] = []
  const seen = new Set<string>()
  let returnedSymbols = false
  for (const definition of definitions) {
    work.boundary()
    const symbols = port.service.findReferences(definition.fileName, definition.textSpan.start) ?? []
    returnedSymbols ||= symbols.length > 0
    work.boundary()
    const referenceMembershipFailure = port.membershipFailure()
    if (referenceMembershipFailure) return work.finish(referenceMembershipFailure)
    for (const symbol of symbols) {
      for (const reference of symbol.references) {
        const targetPath = path.resolve(reference.fileName)
        work.item()
        const isCanonicalDefinition = reference.isDefinition === true
          || canonicalDefinitionKeys.has(typescriptSpanKey(targetPath, reference.textSpan))
        if (!includeDeclaration && isCanonicalDefinition) continue
        if (!within(port.rootPath, targetPath)) {
          return work.finish({ status: "incomplete", reason: "source-outside-workspace" })
        }
        let sourceView = sourceViews.get(targetPath)
        if (!sourceView) {
          sourceView = port.sourceView(targetPath)
          if (!sourceView) return work.finish({ status: "incomplete", reason: "source-unavailable" })
          sourceViews.set(targetPath, sourceView)
        }
        const range = exactSourceRange(sourceView, reference.textSpan)
        if (!range) return work.finish({ status: "incomplete", reason: "source-unmappable" })
        const key = semanticLocationKey(targetPath, range)
        if (seen.has(key)) continue
        seen.add(key)
        references.push({ path: targetPath, range })
      }
    }
  }
  work.boundary()
  const searchedProjectPaths = captureSearchScope
    ? completedReferenceSearchPaths(searchedProgram, port.service.getProgram(),
        definitions.length, returnedSymbols, port.rootPath)
    : undefined
  const finalMembershipFailure = port.membershipFailure()
  if (finalMembershipFailure) return work.finish(finalMembershipFailure)
  references.sort(work.comparator(compareSemanticLocations))
  const definition = definitions[0]
  const constructorTarget = searchedProjectPaths
    && definition.kind === "constructor"
    ? { path: path.resolve(definition.fileName), start: definition.textSpan.start,
        length: definition.textSpan.length } : undefined
  return work.finish({ status: "complete", references,
    ...(searchedProjectPaths ? { searchedProjectPaths } : {}),
    ...(constructorTarget ? { constructorTarget } : {}) })
}

export function typescriptSpanKey(filePath: string, span: ts.TextSpan): string {
  return `${filePath}:${span.start}:${span.length}`
}

export function exactSourceRange(sourceView: ReferenceSourceView, span: ts.TextSpan): SemanticTextRange | undefined {
  if (
    !Number.isSafeInteger(span.start)
    || !Number.isSafeInteger(span.length)
    || span.start < 0
    || span.length <= 0
    || span.start + span.length > sourceView.content.length
  ) return undefined
  const sourceStart = sourceView.virtualDocument.toSourceOffset(span.start)
  const sourceEnd = sourceView.virtualDocument.toSourceOffset(span.start + span.length)
  if (
    sourceEnd <= sourceStart
    || sourceView.virtualDocument.toGeneratedOffset(sourceStart) !== span.start
    || sourceView.virtualDocument.toGeneratedOffset(sourceEnd) !== span.start + span.length
    || sourceView.content.slice(span.start, span.start + span.length)
      !== sourceView.virtualDocument.sourceContent.slice(sourceStart, sourceEnd)
  ) return undefined
  return sourceView.virtualDocument.generatedSpanToSourceRange(span.start, span.length)
}

export function semanticLocationKey(filePath: string, range: SemanticTextRange): string {
  return [filePath, range.startLine, range.startColumn, range.endLine, range.endColumn].join(":")
}

function compareSemanticLocations(left: SemanticDefinitionCandidate, right: SemanticDefinitionCandidate): number {
  return left.path.localeCompare(right.path)
    || left.range.startLine - right.range.startLine
    || left.range.startColumn - right.range.startColumn
    || left.range.endLine - right.range.endLine
    || left.range.endColumn - right.range.endColumn
}

function within(rootPath: string, filePath: string): boolean {
  const relative = path.relative(rootPath, filePath)
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}
