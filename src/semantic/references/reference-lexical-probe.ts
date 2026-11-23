import ts from "typescript"
import path from "node:path"
import type { SemanticWorkspaceView } from "../../core/workspace/document-store.js"
import type { SemanticDocumentPosition } from "../../core/protocol.js"
import type { SemanticReferenceQueryResult } from "../../core/types/type-engine-contract.js"
import { exactSourceOffset } from "../../core/types/text-position.js"
import { lexicalReferenceCoverage } from "./lexical-reference-coverage.js"
import { scopedWorkspace } from "./reference-scoped-workspace.js"
import { verificationTraceFields } from "./reference-verification-trace.js"
import type { ReferenceSearchExecutorOptions } from "./reference-search-executor.js"

/** Syntax is only a cost hint. Only the verifier's actual compiler binding and
 * closed-universe proof can justify omitting any conservative search batch. */
export async function probeLexicalReferences(workspace: SemanticWorkspaceView,
  position: SemanticDocumentPosition, includeDeclaration: boolean,
  options: ReferenceSearchExecutorOptions, admitVerifier?: () => boolean,
): Promise<SemanticReferenceQueryResult | undefined> {
  const document = workspace.documents.find(file => path.resolve(file.path) === path.resolve(position.path))
  if (!document || !hasLocalBindingHint(position, document.content, options.checkpoint)) return undefined
  options.checkpoint?.()
  if (admitVerifier && !admitVerifier()) return { status: "incomplete", reason: "resource-budget-exceeded" }
  const started = performance.now()
  options.trace?.("references.lexical-probe.start", { batchRootFiles: 1 })
  // Full SDK and project dependency resolution remain enabled. No narrowed
  // project admission, identity-only host or reduced ambient profile is used.
  const verification = await options.verifyBatch(scopedWorkspace(workspace, [position.path], true),
    position, includeDeclaration, "closure")
  options.checkpoint?.()
  const result = verification.result
  const proved = result.status === "complete" && result.queryProof?.coverage === "lexical-block"
    && lexicalReferenceCoverage(result.queryProof, workspace, position, result)
  options.trace?.(proved ? "references.lexical-probe.complete" : "references.lexical-probe.refused", {
    batchRootFiles: 1, durationMs: performance.now() - started,
    locations: result.status === "complete" ? result.references.length : undefined,
    reason: proved ? undefined : result.status === "incomplete" ? result.reason : result.queryProofRefusal ?? "lexical-coverage-unproved",
    ...verificationTraceFields(verification),
  })
  // An unsuccessful probe contributes neither Locations nor completeness to
  // the ordinary plan. Exceptions/cancellation propagate; they are not misses.
  return proved ? result : undefined
}

function hasLocalBindingHint(position: SemanticDocumentPosition, text: string, checkpoint?: () => void): boolean {
  const offset = exactSourceOffset(text, position.line, position.column)
  if (offset === undefined) return false
  const source = ts.createSourceFile(position.path, text, ts.ScriptTarget.ES2022, true,
    position.path.endsWith(".ets") ? ts.ScriptKind.ETS : ts.ScriptKind.TS)
  if (source.isDeclarationFile || ((source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length ?? 0)) return false
  let token: ts.Identifier | undefined
  const visit = (node: ts.Node): void => {
    checkpoint?.()
    if (offset < node.getStart(source) || offset >= node.end) return
    if (ts.isIdentifier(node)) token = node
    else ts.forEachChild(node, visit)
  }
  visit(source)
  if (!token) return false
  const { name, propertyName, label } = token.parent as ts.Node & { name?: ts.Node; propertyName?: ts.Node; label?: ts.Node }
  if (propertyName === token || label === token || name === token && !ts.isVariableDeclaration(token.parent)
    || ts.isQualifiedName(token.parent) && token.parent.right === token) return false
  for (let parent: ts.Node | undefined = token.parent; parent; parent = parent?.parent) {
    checkpoint?.()
    if (!ts.isBlock(parent) || !ts.isFunctionLike(parent.parent)
      || !("body" in parent.parent) || parent.parent.body !== parent) continue
    return parent.statements.some(statement => ts.isVariableStatement(statement)
      && (statement.declarationList.flags & ts.NodeFlags.BlockScoped) !== 0
      && statement.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name)
        && declaration.name.text === token!.text))
  }
  return false
}
