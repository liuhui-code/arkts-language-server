import ts from "typescript"

import type { SemanticTextRange } from "../protocol.js"
import { createLineStartIndex, offsetToLineColumn } from "../types/text-position.js"

const MAX_ARKUI_BUILDER_TRANSFORMS = 512
const MAX_ARKUI_GENERATED_EXPANSION = 8 * 1024

interface TextRewrite {
  sourceStart: number
  sourceEnd: number
  generatedText: string
}

interface RewriteSegment {
  sourceStart: number
  sourceEnd: number
  generatedStart: number
  generatedEnd: number
}

export interface ArktsVirtualDocument {
  sourceContent: string
  generatedContent: string
  toGeneratedOffset(sourceOffset: number): number
  toSourceOffset(generatedOffset: number): number
  generatedSpanToSourceRange(start: number, length: number): SemanticTextRange
}

export function createArktsVirtualDocument(
  filePath: string,
  sourceContent: string,
): ArktsVirtualDocument {
  const rewrites = filePath.toLowerCase().endsWith(".ets")
    ? collectArktsRewrites(sourceContent)
    : []
  const { generatedContent, segments } = applyRewrites(sourceContent, rewrites)
  const sourceLineStarts = createLineStartIndex(sourceContent)

  const toGeneratedOffset = (offset: number) => mapOffset(
    bounded(offset, sourceContent.length),
    segments,
    "source",
  )
  const toSourceOffset = (offset: number) => mapOffset(
    bounded(offset, generatedContent.length),
    segments,
    "generated",
  )

  return {
    sourceContent,
    generatedContent,
    toGeneratedOffset,
    toSourceOffset,
    generatedSpanToSourceRange(start, length) {
      const sourceStart = toSourceOffset(start)
      const sourceEnd = toSourceOffset(start + length)
      const from = offsetToLineColumn(sourceContent, sourceStart, sourceLineStarts)
      const to = offsetToLineColumn(sourceContent, sourceEnd, sourceLineStarts)
      return {
        startLine: from.line,
        startColumn: from.column,
        endLine: to.line,
        endColumn: to.column,
      }
    },
  }
}

function collectArktsRewrites(content: string): TextRewrite[] {
  const declarationRewrites = [...content.matchAll(/\bstruct(?=\s+[A-Za-z_$])/g)].map((match) => ({
    sourceStart: match.index,
    sourceEnd: match.index + match[0].length,
    generatedText: "class",
  }))
  const declarationNormalization = applyRewrites(content, declarationRewrites)
  const builderRewrites = collectArkUIBuilderRewrites(declarationNormalization.generatedContent)
    .map((rewrite) => ({
      sourceStart: mapOffset(rewrite.sourceStart, declarationNormalization.segments, "generated"),
      sourceEnd: mapOffset(rewrite.sourceEnd, declarationNormalization.segments, "generated"),
      generatedText: rewrite.generatedText,
    }))
  return [...declarationRewrites, ...builderRewrites]
    .sort((left, right) => left.sourceStart - right.sourceStart || left.sourceEnd - right.sourceEnd)
}

function collectArkUIBuilderRewrites(content: string): TextRewrite[] {
  const sourceFile = ts.createSourceFile(
    "arkts-virtual-document.ets",
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const rewrites: TextRewrite[] = []
  let builderTransforms = 0
  let generatedExpansion = 0
  let transformLimitExceeded = false
  let expansionLimitExceeded = false
  const visitStatements = (statements: ts.NodeArray<ts.Statement>) => {
    for (let index = 1; index < statements.length; index += 1) {
      const expression = statements[index - 1]
      const block = statements[index]
      if (
        !expression
        || !block
        || !ts.isExpressionStatement(expression)
        || !ts.isCallExpression(expression.expression)
        || !ts.isBlock(block)
        || !isArkUIComponentCall(expression.expression)
      ) continue
      const blockStart = block.getStart(sourceFile)
      const gap = content.slice(expression.end, blockStart)
      if (!/^[ \t]+$/u.test(gap)) continue
      builderTransforms += 1
      if (builderTransforms > MAX_ARKUI_BUILDER_TRANSFORMS) {
        transformLimitExceeded = true
        return
      }
      const expressionStart = expression.getStart(sourceFile)
      const builderRewrites = [
        {
          sourceStart: expressionStart,
          sourceEnd: expressionStart,
          generatedText: "([",
        },
        {
          sourceStart: expression.end,
          sourceEnd: blockStart,
          generatedText: ",()=>",
        },
        {
          sourceStart: block.end,
          sourceEnd: block.end,
          generatedText: "] as const)[0]",
        },
      ]
      const builderExpansion = builderRewrites.reduce((total, rewrite) => (
        total + Math.max(0, rewrite.generatedText.length - (rewrite.sourceEnd - rewrite.sourceStart))
      ), 0)
      generatedExpansion += builderExpansion
      if (generatedExpansion > MAX_ARKUI_GENERATED_EXPANSION) {
        expansionLimitExceeded = true
        return
      }
      rewrites.push(...builderRewrites)
    }
  }
  const visit = (node: ts.Node) => {
    if (transformLimitExceeded || expansionLimitExceeded) return
    if (ts.isSourceFile(node) || ts.isBlock(node)) visitStatements(node.statements)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return transformLimitExceeded || expansionLimitExceeded ? [] : rewrites
}

function isArkUIComponentCall(call: ts.CallExpression): boolean {
  const expression = call.expression
  const name = ts.isIdentifier(expression)
    ? expression.text
    : ts.isPropertyAccessExpression(expression)
      ? expression.name.text
      : undefined
  return name !== undefined && /^[A-Z]/u.test(name)
}

function applyRewrites(source: string, rewrites: TextRewrite[]) {
  let generatedContent = ""
  let sourceCursor = 0
  const segments: RewriteSegment[] = []
  for (const rewrite of rewrites) {
    generatedContent += source.slice(sourceCursor, rewrite.sourceStart)
    const generatedStart = generatedContent.length
    generatedContent += rewrite.generatedText
    segments.push({
      sourceStart: rewrite.sourceStart,
      sourceEnd: rewrite.sourceEnd,
      generatedStart,
      generatedEnd: generatedContent.length,
    })
    sourceCursor = rewrite.sourceEnd
  }
  generatedContent += source.slice(sourceCursor)
  return { generatedContent, segments }
}

function mapOffset(
  offset: number,
  segments: RewriteSegment[],
  direction: "source" | "generated",
): number {
  const segment = lastSegmentStartingBefore(segments, offset, direction)
  if (!segment) return offset
  const start = direction === "source" ? segment.sourceStart : segment.generatedStart
  const end = direction === "source" ? segment.sourceEnd : segment.generatedEnd
  const targetStart = direction === "source" ? segment.generatedStart : segment.sourceStart
  const targetEnd = direction === "source" ? segment.generatedEnd : segment.sourceEnd
  if (offset <= end) {
    if (offset === end) return targetEnd
    return targetStart + Math.min(offset - start, targetEnd - targetStart)
  }
  return offset + targetEnd - end
}

function lastSegmentStartingBefore(
  segments: RewriteSegment[],
  offset: number,
  direction: "source" | "generated",
): RewriteSegment | undefined {
  let low = 0
  let high = segments.length - 1
  let match: RewriteSegment | undefined
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const segment = segments[middle]
    if (!segment) break
    const start = direction === "source" ? segment.sourceStart : segment.generatedStart
    if (start <= offset) {
      match = segment
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return match
}

function bounded(value: number, maximum: number): number {
  return Math.max(0, Math.min(value, maximum))
}
