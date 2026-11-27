import path from "node:path"
import type { SemanticDocumentPosition } from "../protocol.js"
import type { SemanticWorkspaceView } from "../workspace/document-store.js"
import type { SemanticGroups } from "./semantic-groups.js"
import type { SemanticTypeQueryContext, SemanticReferenceQueryResult } from "./type-engine-contract.js"
import { OPERATION_SCOPE, isFullOperationScopeRequired, type ScopedWorkspace } from "./operation-scope-execution.js"
import { hasLocalBindingHint } from "../../semantic/references/reference-lexical-probe.js"
import { lexicalReferenceCoverage } from "../../semantic/references/lexical-reference-coverage.js"

/** Uses the existing group owner and original query/final fences. Syntax only
 * selects an attempt; an actual compiler receipt alone proves completeness. */
export function tryRetainedLexicalReference(workspace: SemanticWorkspaceView,
  position: SemanticDocumentPosition, includeDeclaration: boolean, groups: SemanticGroups,
  prepare: (view: SemanticWorkspaceView, id: string) => SemanticTypeQueryContext,
  checkpoint?: () => void, trace?: (event: string, fields: Record<string, string | number | boolean>) => void,
): SemanticReferenceQueryResult | undefined {
  const document = workspace.documents.find(file => path.resolve(file.path) === path.resolve(position.path))
  if (!document || !hasLocalBindingHint(position, document.content, checkpoint)
    || workspace.projectMembership?.status !== "complete"
    || !groups.hasOperationScopes(workspace.canonicalRootId) || !groups.available(workspace)) return undefined
  const group = groups.select(workspace, workspace.projectMembership)
  // A local attempt cannot implicitly expand to an entire large semantic unit.
  if (!group || (group.workspace as ScopedWorkspace)[OPERATION_SCOPE]?.projected !== true) return undefined
  checkpoint?.()
  const started = performance.now()
  try {
    const result = prepare(group.workspace, group.id).references(position, includeDeclaration, false,
      current => current.queryProof?.coverage === "lexical-block"
        && lexicalReferenceCoverage(current.queryProof, workspace, position, current))
    checkpoint?.()
    if (result.status !== "complete" || result.queryProof?.coverage !== "lexical-block"
      || !lexicalReferenceCoverage(result.queryProof, workspace, position, result)) return undefined
    trace?.("references.lexical-owner.complete", { durationMs: performance.now() - started,
      locations: result.references.length, rootFiles: group.workspace.semanticRootPaths?.length ?? 0 })
    return result
  } catch (error) {
    // This one explicit projection refusal may use the complete fallback;
    // cancellation, stale-input fences, compiler and ownership failures may not.
    if (isFullOperationScopeRequired(error)) return undefined
    throw error
  }
}
