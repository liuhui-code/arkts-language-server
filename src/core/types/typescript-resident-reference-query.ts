import path from "node:path"
import { createHash } from "node:crypto"
import type ts from "typescript"

import type { SemanticDefinitionCandidate } from "../protocol.js"
import type { SemanticWorkspaceView } from "../workspace/document-store.js"
import type { SemanticReferenceQueryResult } from "./type-engine-contract.js"
import type { TypeScriptResidentReferenceState } from "./typescript-resident-reference-state.js"

const MAX_REUSED_FINGERPRINTS = 512
const MAX_REUSED_TEXT_CODE_UNITS = 4 * 1024 * 1024

/** A single validated anchor must retain its original admitted Program and inputs. */
export function queryAdmittedDefinition(
  state: TypeScriptResidentReferenceState | undefined,
  workspace: SemanticWorkspaceView,
  inputs: () => { readonly generation: number; readonly roots: readonly string[] },
  service: () => ts.LanguageService,
  query: (lookup: ts.LanguageService["getDefinitionAtPosition"]) => SemanticDefinitionCandidate[],
): SemanticDefinitionCandidate[] | undefined {
  const before = inputs()
  const program = state?.admit(workspace, before.generation, before.roots)
  if (!program) return undefined
  let rawDefinitions = 0
  const result = query((filePath, offset) => {
    const definitions = service().getDefinitionAtPosition(filePath, offset)
    rawDefinitions = definitions?.length ?? 0
    return definitions
  })
  if (rawDefinitions !== 1 || result.length !== 1 || service().getProgram() !== program) return undefined
  const after = inputs()
  return state?.admit(workspace, after.generation, after.roots) === program ? result : undefined
}

/** Complete resident answers retain both input admission and searched-scope fences. */
export function queryAdmittedReferences(
  state: TypeScriptResidentReferenceState | undefined,
  workspace: SemanticWorkspaceView,
  inputs: () => { readonly generation: number; readonly roots: readonly string[] },
  query: (program: ts.Program) => SemanticReferenceQueryResult,
  sourcePath: string,
  synchronizeOverlay?: () => void,
): SemanticReferenceQueryResult | undefined {
  const reuse = (process.env.ARKTS_RESIDENT_INPUT_HASH_REUSE ?? "1") === "1"
  const fingerprints = new Map<string, string>()
  let retainedCodeUnits = 0
  const fingerprint = (content: string): string => {
    const known = fingerprints.get(content)
    if (known !== undefined) return known
    const value = createHash("sha256").update(content).digest("hex")
    if (reuse && fingerprints.size < MAX_REUSED_FINGERPRINTS
      && retainedCodeUnits + content.length <= MAX_REUSED_TEXT_CODE_UNITS) {
      fingerprints.set(content, value)
      retainedCodeUnits += content.length
    }
    return value
  }
  try {
    // Only pure hashes of actual strings are reused, never admission or disk validity.
    let before = inputs()
    if (process.env.ARKTS_REFERENCES_OVERLAY_SYNC === "1" && synchronizeOverlay
      && state?.canSynchronizeOverlay(workspace, before.generation, before.roots, fingerprint)) {
      synchronizeOverlay()
      before = inputs()
    }
    const program = state?.admit(workspace, before.generation, before.roots, fingerprint)
    if (!program) return undefined
    const result = query(program)
    if (result.status !== "complete" || !result.searchedProjectPaths) return undefined
    const after = inputs()
    if (state?.admit(workspace, after.generation, after.roots, fingerprint) !== program) return undefined
    const searched = new Set(result.searchedProjectPaths.map(filePath => path.resolve(filePath)))
    return searched.has(path.resolve(sourcePath))
      && workspace.projectMembership!.paths.every(filePath => searched.has(path.resolve(filePath)))
      && workspace.documents.filter(document => document.overlay).every(document => searched.has(path.resolve(document.path)))
      ? result : undefined
  } finally {
    fingerprints.clear()
  }
}
