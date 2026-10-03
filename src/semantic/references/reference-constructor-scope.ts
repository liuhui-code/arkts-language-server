import path from "node:path"

import type { SemanticReferenceQueryResult } from "../../core/types/type-engine-contract.js"
import { isConstructorLiteralModule } from "../../core/types/typescript-constructor-literal-module.js"
import type { ProjectFileAccessPort, SemanticWorkspaceView } from "../../core/workspace/document-store.js"

type CompleteSearch = Extract<SemanticReferenceQueryResult, { status: "complete" }>
type Exclusion = NonNullable<CompleteSearch["constructorExcludedSources"]>[number]
const MAX_SCAN_CODE_UNITS = 4 * 1024 * 1024

/** Closed source-local grammars only, never class/name or partial-Program facts. */
export function constructorModuleExclusions(
  workspace: SemanticWorkspaceView,
  queryPath: string,
  result: CompleteSearch,
  access: ProjectFileAccessPort | undefined,
): readonly Exclusion[] | undefined {
  const membership = workspace.projectMembership
  if (!access || membership?.status !== "complete" || !result.constructorTarget
    || !result.searchedProjectPaths) return undefined
  const searched = new Set(result.searchedProjectPaths.map(filePath => path.resolve(filePath)))
  if (!searched.has(path.resolve(queryPath))
    || !searched.has(path.resolve(result.constructorTarget.path))
    || workspace.documents.some(document => document.overlay
      && !searched.has(path.resolve(document.path)))) return undefined
  const missing = [...new Set(membership.paths.map(filePath => path.resolve(filePath)))]
    .filter(filePath => !searched.has(filePath))
  const identities = new Map(workspace.projectFileIdentities)
  const exclusions: Exclusion[] = []
  let scanned = 0
  for (const filePath of missing) {
    const token = identities.get(filePath)
    if (!token) continue
    const content = access.read(workspace.canonicalRootId, membership.revision, filePath, token)
    if (content === null) continue
    scanned += content.length
    // A proof budget only leaves further roots unknown; it never limits results.
    if (scanned > MAX_SCAN_CODE_UNITS) break
    if (isClosedModule(filePath, content)) exclusions.push({ path: filePath, token })
  }
  return exclusions.length > 0 ? exclusions : undefined
}

/** Both the Worker and accepting owner read current authority under the old token. */
export function isConstructorModuleCurrent(
  workspace: SemanticWorkspaceView,
  exclusion: Exclusion,
  access: ProjectFileAccessPort | undefined,
): boolean {
  const membership = workspace.projectMembership
  const filePath = path.resolve(exclusion.path)
  if (!access || membership?.status !== "complete"
    || !membership.paths.some(entry => path.resolve(entry) === filePath)
    || workspace.documents.some(document => document.overlay && path.resolve(document.path) === filePath)
    || !workspace.projectFileIdentities?.some(([entry, token]) => (
      path.resolve(entry) === filePath && token === exclusion.token
    ))) return false
  const content = access.read(workspace.canonicalRootId, membership.revision, filePath, exclusion.token)
  return content !== null && isClosedModule(filePath, content)
}

function isClosedModule(filePath: string, content: string): boolean {
  return /^[ \t\r\n]*export[ \t\r\n]*\{[ \t\r\n]*\}[ \t\r\n]*(?:;[ \t\r\n]*)?$/u.test(content)
    || isConstructorLiteralModule(filePath, content)
}
