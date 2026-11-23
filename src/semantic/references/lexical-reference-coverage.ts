import { createHash } from "node:crypto"
import type { ReferenceQueryProof } from "../../contracts/reference-query-proof.js"
import type { SemanticWorkspaceView } from "../../core/workspace/document-store.js"
import type { SemanticDocumentPosition } from "../../core/protocol.js"
import type { SemanticReferenceQueryResult } from "../../core/types/type-engine-contract.js"
import { compilerArtifactIdentity } from "../../core/types/typescript-compiler-artifact.js"
import { createLineStartIndex } from "../../core/types/text-position.js"
import { sameResolvedPath } from "../../project/path-identity.js"

/** The finite universe is this non-escaping binding's original function body.
 * Files omitted by this proof cannot bind its name, regardless of their count.
 * Keep the full input/final fences; this proves coverage, not disk freshness. */
export function lexicalReferenceCoverage(proof: ReferenceQueryProof, workspace: SemanticWorkspaceView,
  position: SemanticDocumentPosition, result: Extract<SemanticReferenceQueryResult, { status: "complete" }>): boolean {
  if (proof.coverage !== "lexical-block" || !sameResolvedPath(proof.path, position.path) || proof.compilerSha256 !== compilerArtifactIdentity?.compilerSha256) return false
  const document = workspace.documents.find(file => sameResolvedPath(file.path, proof.path))
  if (!document || proof.sourceSha256 !== createHash("sha256").update(document.content).digest("hex")
    || proof.scopeEnd > document.content.length) return false
  const starts = createLineStartIndex(document.content)
  const offset = (line: number, column: number): number | undefined => {
    if (!Number.isSafeInteger(line) || !Number.isSafeInteger(column) || line < 1 || column < 1) return undefined
    const start = starts[line - 1]
    if (start === undefined) return undefined
    const end = starts[line] === undefined ? document.content.length : starts[line] - 1
    const at = start + column - 1
    return at <= end ? at : undefined
  }
  const queryOffset = offset(position.line, position.column)
  if (queryOffset === undefined || queryOffset < proof.scopeStart || queryOffset >= proof.scopeEnd) return false
  return [...result.references, ...result.otherReferences ?? []].every(reference => {
    if (!sameResolvedPath(reference.path, proof.path)) return false
    const start = offset(reference.range.startLine, reference.range.startColumn)
    const end = offset(reference.range.endLine, reference.range.endColumn)
    return start !== undefined && end !== undefined && start >= proof.scopeStart && end <= proof.scopeEnd && start <= end
  })
}
