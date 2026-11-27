import ts from "typescript"
import type { DocumentSnapshot } from "../contracts/document.js"
import type { SemanticQuery } from "../contracts/semantic-engine.js"
import type { StructuredLogger } from "../observability/logger.js"
import type { SourceReferenceOwner } from "./references/source-reference-owner.js"
import { hasLexicalReferenceCandidate } from "./references/reference-lexical-candidate-hint.js"
import { SemanticWorkerSupervisorError } from "./semantic-worker-supervisor-errors.js"
import { SemanticInputUnavailableError, SemanticResultInvalidatedError } from "../core/types/typescript-query-inputs.js"
import { sourceReferenceAuthority, sourceReferenceBudgetAllows, sourceReferenceCheckpoint,
  sourceReferenceInputKey } from "./references/source-reference-input.js"

/** Positive syntax domain for the pinned compiler. Call/new/tag targets may add
 * externally resolved signatures; property names/shorthand/type positions are
 * also outside this domain. The actual lexical symbol proof is still required. */
export function localNavigationToken(source: ts.SourceFile, offset: number,
  checkpoint: () => void): ts.Identifier | undefined {
  let token: ts.Identifier | undefined
  const visit = (node: ts.Node): void => {
    checkpoint()
    if (offset < node.getStart(source) || offset > node.end) return
    if (ts.isIdentifier(node)) token = node
    else ts.forEachChild(node, visit)
  }
  visit(source)
  if (!token || invokesValue(token)) return undefined
  const parent = token.parent
  const allowed = ts.isVariableDeclaration(parent) && parent.name === token
    || ts.isBinaryExpression(parent) && (parent.left === token || parent.right === token)
    || ts.isReturnStatement(parent) && parent.expression === token
    || ts.isExpressionStatement(parent) && parent.expression === token
    || ts.isPropertyAccessExpression(parent) && parent.expression === token
    || ts.isElementAccessExpression(parent) && parent.expression === token
    || ts.isElementAccessExpression(parent) && parent.argumentExpression === token
    || ts.isCallExpression(parent) && parent.arguments.some(argument => argument === token)
    || ts.isPrefixUnaryExpression(parent) && parent.operand === token
    || ts.isPostfixUnaryExpression(parent) && parent.operand === token
    || transparentOperand(parent) === token
    || ts.isArrowFunction(parent) && parent.body === token
    || ts.isConditionalExpression(parent) && [parent.condition, parent.whenTrue, parent.whenFalse].includes(token)
    || ts.isArrayLiteralExpression(parent) && parent.elements.some(element => element === token)
    || (ts.isSpreadElement(parent) || ts.isSpreadAssignment(parent) || ts.isTemplateSpan(parent)) && parent.expression === token
  return allowed ? token : undefined
}

function transparentOperand(node: ts.Node): ts.Expression | undefined {
  return ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node) || ts.isAsExpression(node)
    || ts.isTypeAssertionExpression(node) || ts.isAwaitExpression(node) || ts.isTypeOfExpression(node)
    || ts.isVoidExpression(node) ? node.expression : undefined
}

/** Refuse wrapped invocations too; do not depend on today's alias-signature
 * walker stopping at parentheses/assertions. Receivers and arguments are values. */
function invokesValue(node: ts.Node): boolean {
  while (node.parent && transparentOperand(node.parent) === node) node = node.parent
  const parent = node.parent
  return (ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.expression === node
    || ts.isTaggedTemplateExpression(parent) && parent.tag === node
}

/** Same serialized Worker, mutation barrier, cancellation scope and private
 * source owner as references. Only a successful bounded proof bypasses the
 * project route; unsupported queries retain its complete input/final fences. */
export function trySourceLocalNavigation(query: SemanticQuery, owner: SourceReferenceOwner,
  documents: (() => Iterable<DocumentSnapshot>) | undefined, checkpoint: () => void,
  logger?: StructuredLogger) {
  const hinted = { ...query, includeDeclaration: true }
  const candidate = hasLexicalReferenceCandidate(hinted) || query.position.character > 0
    && hasLexicalReferenceCandidate({ ...hinted, position: { ...query.position, character: query.position.character - 1 } })
  if (!documents || !/\.(?:ts|ets)$/.test(query.document.uri) || !candidate
    || !sourceReferenceBudgetAllows(process.env) || !sourceReferenceAuthority(query, documents())) return undefined
  checkpoint()
  const before = navigationInputKey(query)
  if (!before) return undefined
  const result = owner.define(query, checkpoint, logger)
  if (result.value === null) return undefined
  checkpoint(); sourceReferenceCheckpoint(query)
  if (!sourceReferenceBudgetAllows(process.env) || !sourceReferenceAuthority(query, documents())
    || navigationInputKey(query) !== before) throw new SemanticResultInvalidatedError(new SemanticInputUnavailableError())
  return { documentVersion: result.documentVersion, value: result.value }
}

/** The shared target reader also serves the parent proxy. Preserve the Worker
 * engine's existing typed stale-result classification at this boundary. */
function navigationInputKey(query: SemanticQuery): string | undefined {
  try { return sourceReferenceInputKey(query) }
  catch (error) {
    if (error instanceof SemanticWorkerSupervisorError && error.code === "content-modified")
      throw new SemanticResultInvalidatedError(new SemanticInputUnavailableError())
    throw error
  }
}
