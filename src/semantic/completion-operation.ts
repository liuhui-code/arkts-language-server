import type { DocumentSnapshot, TextPosition } from "../contracts/document.js"
import type { SemanticCompletion, SemanticCompletionList, SemanticCompletionResolveQuery, SemanticQuery, VersionedSemanticResult } from "../contracts/semantic-engine.js"
import type { SemanticCompletionItem, SemanticDocumentPosition } from "../core/protocol.js"
import type { SemanticTypeQueryContext } from "../core/types/type-engine-contract.js"
import type { InteractiveSemanticRuntimeConfig } from "./interactive-runtime.js"
import { completionQueryPlan, completionBatchTrace, completionItemIdentity, completionItemDiscoveryProjectRoots, completionResolvePreparation } from "./completion-batch-planning.js"
import { toPublicCompletion, toLegacyCompletion } from "./legacy-result-mappers.js"
import { reusablePreparedCompletion } from "./prepared-completion-inputs.js"
import { toFilePath } from "./semantic-worker-file-identity.js"
import type { LocalPackageResolver } from "../core/sdk/local-package-resolver.js"
import { completionPrefixContext } from "./completion-discovery.js"
import { SemanticInputUnavailableError } from "../core/types/typescript-query-inputs.js"
import { withSynchronousInputPreparation } from "../project/request-input-validation.js"
import { pathToFileURL } from "node:url"

export interface CompletionPorts {
  sync(): void
  checkpoint(): void
  operationScoped(): boolean
  hasGroups(): boolean
  membershipComplete(): boolean
  readonly runtime: Omit<InteractiveSemanticRuntimeConfig, "sdkAmbientProfile">
  prepare(document: DocumentSnapshot, position: TextPosition, includeWorkspaceFiles: boolean,
    profile: "closure" | "current", roots: readonly string[]): { engine: SemanticTypeQueryContext; position: SemanticDocumentPosition }
}

/** Synchronous compiler batches and publication retain their original ordering. */
export function runCompletionQuery(query: SemanticQuery, ports: CompletionPorts): VersionedSemanticResult<SemanticCompletionList> {
  return withSynchronousInputPreparation(() => complete(query, ports))
}

/** Cached namespace admission keeps its original early-return boundary. Only
 * the real compiler branch lends preparation facts to its leased final fence. */
export function runCompletionResolveQuery(query: SemanticCompletionResolveQuery,
  ports: CompletionPorts, resolver: LocalPackageResolver): VersionedSemanticResult<SemanticCompletion> {
  ports.checkpoint()
  ports.sync()
  const roots = completionItemDiscoveryProjectRoots(query.completion, query.document.workspaceId)
  const reusable = reusablePreparedCompletion(query, resolver, toFilePath(query.document.workspaceId),
    roots !== undefined, ports.checkpoint)
  if (reusable) return { documentVersion: query.document.version, value: reusable }
  return withSynchronousInputPreparation(() => {
    const scope = completionResolvePreparation(query, roots, {
      projectRootProfile: ports.runtime.projectRootProfile,
      memberCompletionProjectRootProfile: ports.runtime.memberCompletionProjectRootProfile,
      operationScoped: ports.operationScoped(),
    }, ports.hasGroups, ports.membershipComplete)
    const prepared = ports.prepare(query.document, query.position, scope.includeWorkspaceFiles, scope.projectRootProfile, scope.roots)
    const item = prepared.engine.resolveCompletion(
      { ...prepared.position, allowSnippets: query.completionOptions?.snippets === true }, toLegacyCompletion(query.completion))
    return { documentVersion: query.document.version, value: toPublicCompletion(item, query.document.version) }
  })
}

function complete(query: SemanticQuery, ports: CompletionPorts): VersionedSemanticResult<SemanticCompletionList> {
  ports.checkpoint()
  ports.sync()
  const plan = completionQueryPlan(query, {
    projectRootProfile: ports.runtime.projectRootProfile, memberCompletionProjectRootProfile: ports.runtime.memberCompletionProjectRootProfile,
    autoImportProjectRootProfile: ports.runtime.autoImportProjectRootProfile, autoImportBatchRootLimit: ports.runtime.autoImportBatchRootLimit,
    operationScoped: ports.operationScoped(),
  }, ports.hasGroups,
    ports.membershipComplete)
  const prefix = completionPrefixContext(query.document.text, query.position).prefix
  const metadata = ports.operationScoped() && !plan.memberAccess && !plan.discovery && Array.from(prefix).length >= 2
    ? ports.prepare(query.document, query.position, false, "current", []).engine.completionRootSnapshot?.(prefix) : undefined
  const autoImportBatches = plan.discovery ?? (metadata ? rootBatches(metadata.roots, ports.runtime.autoImportBatchRootLimit) : undefined)
  const preparation = metadata ? { ...plan.scope, includeWorkspaceFiles: false, projectRootProfile: "current" as const } : plan.scope
  const augmentation = metadata ? undefined : plan.augmentation
  const batches = autoImportBatches ?? [{
    roots: [] as readonly string[],
    candidates: augmentation?.candidates ?? [],
  }]
  const mergedItems: SemanticCompletionItem[] = []
  const itemIndexes = new Map<string, number>()
  let isIncomplete = !plan.memberAccess && Array.from(prefix).length >= 2 && preparation.scopeIncomplete && !metadata
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    ports.checkpoint()
    if (metadata && !metadata.current()) throw new SemanticInputUnavailableError()
    const batch = batches[batchIndex]
    const prepared = ports.prepare(query.document, query.position,
      preparation.includeWorkspaceFiles, preparation.projectRootProfile, batch.roots)
    if (metadata && !metadata.current()) throw new SemanticInputUnavailableError()
    const traceContext = autoImportBatches
      ? completionBatchTrace(query.document.workspaceId, batch, batchIndex, batches.length) : undefined
    const completion = prepared.engine.complete(
      {
        ...prepared.position,
        allowSnippets: query.completionOptions?.snippets === true,
        completionDiscovery: augmentation
          ? {
              ...augmentation,
              candidates: batch.candidates,
              preResolve: autoImportBatches !== undefined,
            }
          : undefined,
      },
      traceContext,
    )
    isIncomplete ||= completion.isIncomplete
    const roots = metadata ? batch.roots.map(root => pathToFileURL(root).href) : undefined
    for (const original of completion.items) {
      const item = roots?.length && original.data?.provider === "typescript" && typeof original.data.entrySource === "string"
        ? { ...original, data: { ...original.data, discoveryCandidateUris: [...roots] } } : original
      const identity = completionItemIdentity(item)
      const existingIndex = itemIndexes.get(identity)
      if (existingIndex !== undefined) {
        if (!mergedItems[existingIndex].preResolved && item.preResolved) {
          mergedItems[existingIndex] = item
        }
        continue
      }
      itemIndexes.set(identity, mergedItems.length)
      mergedItems.push(item)
    }
    if (
      ports.runtime.autoImportTrimBetweenBatches
      && traceContext
      && batchIndex < batches.length - 1
    ) {
      prepared.engine.trimCompletion(traceContext)
    }
  }
  if (metadata && !metadata.current()) throw new SemanticInputUnavailableError()
  const items = mergedItems
    .map((item) => toPublicCompletion(item, query.document.version))
  return {
    documentVersion: query.document.version,
    value: { items, isIncomplete },
  }
}

function rootBatches(roots: readonly string[], limit: number) {
  const result: { roots: readonly string[]; candidates: [] }[] = []
  for (let index = 0; index < roots.length; index += limit) result.push({ roots: roots.slice(index, index + limit), candidates: [] })
  return result.length ? result : [{ roots: [], candidates: [] as [] }]
}
