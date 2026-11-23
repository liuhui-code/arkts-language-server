import path from "node:path"
import type { ReferenceQueryProof } from "../../contracts/reference-query-proof.js"
import type { SemanticWorkspaceView } from "../../core/workspace/document-store.js"

/** Called after all required verification/final exclusion fences, not at discovery. */
export function completedReferenceCoverage(proof: ReferenceQueryProof | undefined, workspace: SemanticWorkspaceView,
  queryPath: string, candidatePaths?: readonly string[], identityComplete = false, anchorVerified = false): ReferenceQueryProof | undefined {
  if (!proof || proof.coverage === "lexical-block") return proof
  if (workspace.projectMembership?.status !== "complete") return undefined
  const searched = new Set(proof.searchedPaths.map(file => path.resolve(file)))
  const covers = (files: readonly string[]) => files.every(file => searched.has(path.resolve(file)))
  if (!covers([queryPath, ...workspace.documents.filter(doc => doc.overlay).map(doc => doc.path)])) return undefined
  if (covers(workspace.projectMembership.paths)) return Object.freeze({ ...proof, scope: "workspace" })
  if (identityComplete && anchorVerified && candidatePaths?.length && covers(candidatePaths)
    && candidatePaths.some(file => path.resolve(file) === path.resolve(proof.anchor.path)))
    return Object.freeze({ ...proof, scope: "candidates" })
  return undefined
}
