import { createHash } from "node:crypto"
import path from "node:path"
import type { SemanticCompletion, SemanticCompletionDiscovery, SemanticQuery } from "../contracts/semantic-engine.js"
import type { SemanticCompletionItem } from "../core/protocol.js"
import { isMemberAccessCompletion } from "../core/types/typescript-language-service.js"
import { toFilePath } from "./semantic-worker-file-identity.js"
import type { InteractiveSemanticRuntimeConfig } from "./interactive-runtime.js"

interface CompletionDiscoveryBatch {
  readonly roots: readonly string[]
  readonly candidates: readonly SemanticCompletionDiscovery["candidates"][number][]
}

/** Completion can use a valid local scope while full-project membership is unavailable. */
export function completionPreparation(scoped: boolean, memberGroup: boolean,
  profile: "closure" | "current", membershipComplete: () => boolean) {
  const includeWorkspaceFiles = !scoped && membershipComplete()
  return { includeWorkspaceFiles,
    projectRootProfile: memberGroup ? "closure" as const : scoped || !includeWorkspaceFiles ? "current" as const : profile,
    scopeIncomplete: !scoped && !includeWorkspaceFiles }
}

/** Keep local completion independent from optional whole-project auto-import enrichment. */
export function completionQueryPlan(query: SemanticQuery, runtime: Omit<InteractiveSemanticRuntimeConfig,
  "sdkAmbientProfile" | "autoImportTrimBetweenBatches">, hasGroups: () => boolean, membershipComplete: () => boolean) {
  const member = memberCompletionScope(query, runtime.projectRootProfile, runtime.memberCompletionProjectRootProfile, hasGroups)
  let discovery = !member.memberAccess && runtime.autoImportProjectRootProfile === "discovery"
    ? completionDiscoveryBatches(query.completionDiscovery, query.document.workspaceId, runtime.autoImportBatchRootLimit) : undefined
  const scope = completionPreparation(member.memberGroup || member.memberProjectRoots || discovery !== undefined,
    member.memberGroup, runtime.projectRootProfile, membershipComplete)
  if (scope.scopeIncomplete && !member.memberAccess) {
    discovery = completionDiscoveryBatches(query.completionDiscovery, query.document.workspaceId, runtime.autoImportBatchRootLimit)
  }
  return { memberAccess: member.memberAccess, discovery, scope }
}

/** Member list and details consume the same complete stable scope or explicit fallback. */
export function memberCompletionScope(query: Pick<SemanticQuery, "document" | "position">,
  interactiveProfile: "closure" | "current", memberProfile: "group" | "workspace" | "current",
  hasGroups: () => boolean, membershipComplete: () => boolean = () => true) {
  const memberAccess = isMemberAccessCompletion(query.document.text,
    query.position.line + 1, query.position.character + 1)
  const memberProjectRoots = memberAccess && (interactiveProfile === "current" || memberProfile === "current")
  const memberGroup = memberAccess && memberProfile === "group" && !memberProjectRoots && hasGroups()
  const scope = completionPreparation(memberProjectRoots || memberGroup, memberGroup, interactiveProfile, membershipComplete)
  return { memberAccess, memberProjectRoots, memberGroup,
    preparation: [scope.includeWorkspaceFiles, scope.projectRootProfile] as const }
}

export function completionDiscoveryBatches(
  discovery: SemanticCompletionDiscovery | undefined,
  workspaceId: string,
  rootLimit: number,
): readonly CompletionDiscoveryBatch[] | undefined {
  if (!discovery || discovery.incomplete || discovery.candidates.length === 0) return undefined
  const workspaceRoot = toFilePath(workspaceId)
  if (!workspaceRoot) return undefined
  const candidatesByRoot = new Map<string, SemanticCompletionDiscovery["candidates"][number][]>()
  for (const candidate of discovery.candidates) {
    const candidatePath = toFilePath(candidate.uri)
    if (!candidatePath || !isWithinPath(workspaceRoot, candidatePath)) return undefined
    const root = path.resolve(candidatePath)
    const candidates = candidatesByRoot.get(root)
    if (candidates) candidates.push(candidate)
    else candidatesByRoot.set(root, [candidate])
  }
  const entries = [...candidatesByRoot].sort(([left], [right]) => left.localeCompare(right))
  const batches: CompletionDiscoveryBatch[] = []
  for (let start = 0; start < entries.length; start += rootLimit) {
    const batch = entries.slice(start, start + rootLimit)
    batches.push({
      roots: batch.map(([root]) => root),
      candidates: batch.flatMap(([, candidates]) => candidates),
    })
  }
  return batches.length > 0 ? batches : undefined
}

export function semanticRootFingerprints(
  workspaceId: string,
  roots: readonly string[],
): string {
  const workspaceRoot = toFilePath(workspaceId)
  if (!workspaceRoot) return ""
  return roots.map((root) => {
    const relative = path.relative(workspaceRoot, path.resolve(root)).split(path.sep).join("/")
    return createHash("sha256").update(relative).digest("hex").slice(0, 16)
  }).join(",")
}

export function completionItemIdentity(item: SemanticCompletionItem): string {
  return JSON.stringify([
    item.data?.provider ?? null,
    item.data?.entryName ?? null,
    item.data?.entrySource ?? null,
    item.label,
    item.kind,
    item.insertText ?? null,
  ])
}

export function completionItemDiscoveryProjectRoots(
  completion: SemanticCompletion,
  workspaceId: string,
): readonly string[] | undefined {
  const candidateUris = completion.data?.discoveryCandidateUris
  if (!Array.isArray(candidateUris) || candidateUris.length === 0) return undefined
  const workspaceRoot = toFilePath(workspaceId)
  if (!workspaceRoot) return undefined
  const roots = new Set<string>()
  for (const candidateUri of candidateUris) {
    if (typeof candidateUri !== "string") return undefined
    const candidatePath = toFilePath(candidateUri)
    if (!candidatePath || !isWithinPath(workspaceRoot, candidatePath)) return undefined
    roots.add(path.resolve(candidatePath))
  }
  return roots.size > 0 ? [...roots].sort() : undefined
}

function isWithinPath(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}
