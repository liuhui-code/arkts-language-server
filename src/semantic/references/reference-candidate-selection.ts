import { fileURLToPath } from "node:url"
import type { TextPosition } from "../../contracts/document.js"
import type * as Contract from "../../contracts/semantic-engine.js"
import type {
  WorkspaceExportIndexPort,
  WorkspaceReferenceCandidateResult,
  WorkspaceReferenceIndexPort,
} from "../../contracts/workspace-index.js"
import type { LocalPackageResolver } from "../../core/sdk/local-package-resolver.js"
import type { StructuredLogger } from "../../observability/logger.js"
import { MAX_SEMANTIC_WORKER_REFERENCE_CANDIDATES } from "../worker-protocol.js"
import { referenceAdmissionRoots } from "./reference-admission-roots.js"
import { identityReferenceUris, identityReferenceSupportUris, referenceBindingResolutionSummary } from "./reference-candidate-proof.js"
import {
  isReferenceIndexCandidateEligible,
  prepareReferenceIndexSearch,
  type ReferenceIndexFreshness,
} from "./reference-index-freshness.js"
import { logReferenceCandidateFallback, logReferenceSeedProofRejection, traceReferenceCandidatePhase } from "./reference-index-telemetry.js"
import { waitForInitialReferenceCatalog } from "./reference-initial-catalog.js"
import { indexedReferenceAnchorSeed, localExportAnchorSeed } from "./reference-local-export-seed.js"
import { referenceSearchRuntimeConfig } from "./reference-runtime.js"
import { resolveReferenceCandidateSources } from "./reference-source-resolution.js"
import type { ReferenceSourceOverlaySnapshot } from "./reference-input-snapshot.js"

export interface ReferenceCandidateSelection {
  readonly uris: readonly string[]
  readonly identityComplete: boolean
  readonly anchorUri?: string
  readonly anchorPosition?: TextPosition
  readonly supportUris?: readonly string[]
}

export interface ReferenceCandidateSelectionContext {
  readonly environment: NodeJS.ProcessEnv
  readonly index?: WorkspaceReferenceIndexPort
  readonly exportIndex?: WorkspaceExportIndexPort
  readonly freshness: ReferenceIndexFreshness
  readonly packageResolver: LocalPackageResolver
  readonly projectConfiguration?: unknown
  readonly sdkConfiguration?: unknown
  readonly sourceOverlays?: ReferenceSourceOverlaySnapshot
  readonly logger?: StructuredLogger
  readonly assertCurrent: () => void
  readonly define: (
    query: Contract.SemanticReferencesQuery,
    traceId?: string,
  ) => Promise<Contract.VersionedSemanticResult<Contract.SemanticDefinition[]>>
}

export async function selectReferenceCandidates(
  context: ReferenceCandidateSelectionContext,
  query: Contract.SemanticReferencesQuery,
  traceId?: string,
  allowLocalSeed = true,
): Promise<ReferenceCandidateSelection | undefined> {
  context.assertCurrent()
  if (referenceSearchRuntimeConfig(context.environment).strategy !== "indexed-batched"
    || !context.index) return undefined
  if (!context.freshness.isDirty(query.document.workspaceId)) {
    await waitForInitialReferenceCatalog(context.index, query.document.workspaceId,
      context.environment, query.signal, context.logger)
  }
  if (query.signal?.aborted) throw new Error("References changed during catalog wait")
  context.assertCurrent()
  if (!await prepareReferenceIndexSearch(
    context.freshness, query.document.workspaceId,
    context.index, context.logger,
  )) return undefined
  try {
    const admittedRootUris = referenceAdmissionRoots(context.packageResolver,
      toFilePath(query.document.workspaceId), context.logger, traceId)
    let direct = await traceReferenceCandidatePhase(context.logger, traceId,
      "direct-query", () => context.index!.searchReferenceCandidates(
        query.document.workspaceId,
        query.document.uri,
        query.position,
        MAX_SEMANTIC_WORKER_REFERENCE_CANDIDATES,
        undefined,
        admittedRootUris,
        query.signal,
      ))
    direct = await traceReferenceCandidatePhase(context.logger, traceId,
      "direct-sources", () => resolveCandidateSources(
        context,
        query.document.workspaceId,
        query.document.uri,
        query.position,
        direct,
        admittedRootUris,
        query.signal,
      ))
    const directAccepted = await context.freshness.accepts(
      query.document.workspaceId, direct, context.index,
    )
    context.assertCurrent()
    const directAnchor = directAccepted && allowLocalSeed
      ? await indexedReferenceAnchorSeed(context.exportIndex, query, direct) : undefined
    if (directAnchor) {
      if (!await context.freshness.accepts(
        query.document.workspaceId, direct, context.index,
      )) {
        context.logger?.info("references.index.fallback", { reason: "anchor-metadata-index-changed" })
        return undefined
      }
      const candidateUris = identityReferenceUris(direct)
      context.assertCurrent()
      const supportUris = identityReferenceSupportUris(direct, candidateUris)
      const identityComplete = direct.identityComplete && supportUris !== undefined
      context.logger?.info("references.index.accepted", {
        anchorMode: identityComplete
          ? "indexed-declaration-identity"
          : direct.narrowedUris?.length
            ? "indexed-declaration-conservative"
            : "indexed-declaration",
        candidateFiles: candidateUris.length,
        conservativeCandidateFiles: direct.uris.length,
        servedGeneration: direct.servedGeneration,
        ...(context.environment.ARKTS_REFERENCES_TRACE === "1"
          ? {
              bindingResolutions: referenceBindingResolutionSummary(direct),
            }
          : {}),
      })
      if (!identityComplete) return undefined
      return {
        uris: candidateUris,
        identityComplete,
        anchorPosition: directAnchor.range.start,
        ...(identityComplete && direct.declarationUri
          ? { anchorUri: direct.declarationUri }
          : {}),
        ...(identityComplete && supportUris ? { supportUris } : {}),
      }
    }
    if (direct.completeness !== "ready" || (!directAccepted && direct.supported)) {
      context.logger?.info("references.index.fallback", {
        reason: "direct-candidate-ineligible",
        supported: direct.supported,
        complete: direct.complete,
        completeness: direct.completeness,
        hasDeclarationIdentity: Boolean(direct.declarationIdentity),
        servedGeneration: direct.servedGeneration,
      })
      return undefined
    }
    const seed = allowLocalSeed && context.environment.ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR === "1"
      ? await localExportAnchorSeed(context.exportIndex, query) : undefined
    const definition = seed ? { value: [seed] } : await context.define(query, traceId)
    if (definition.value.length !== 1) {
      context.logger?.info("references.index.fallback", {
        reason: "definition-count",
        definitionCount: definition.value.length,
      })
      return undefined
    }
    const target = definition.value[0]
    context.assertCurrent()
    let result = await traceReferenceCandidatePhase(context.logger, traceId,
      "declaration-query", () => context.index!.searchReferenceCandidates(
        query.document.workspaceId,
        target.uri,
        target.range.start,
        MAX_SEMANTIC_WORKER_REFERENCE_CANDIDATES,
        undefined,
        admittedRootUris,
        query.signal,
      ))
    result = await traceReferenceCandidatePhase(context.logger, traceId,
      "declaration-sources", () => resolveCandidateSources(
        context,
        query.document.workspaceId,
        target.uri,
        target.range.start,
        result,
        admittedRootUris,
        query.signal,
      ))
    const status = await traceReferenceCandidatePhase(context.logger, traceId,
      "status", () => context.index!.status(query.document.workspaceId))
    context.assertCurrent()
    if (!isReferenceIndexCandidateEligible(result, status)) {
      if (seed) {
        logReferenceSeedProofRejection(context.logger, traceId, "candidate-ineligible", seed, result, status)
        return selectReferenceCandidates(context, query, traceId, false)
      }
      logReferenceCandidateFallback(context.logger, target, result, status)
      return undefined
    }
    context.freshness.accepted(query.document.workspaceId, result.servedGeneration)
    const candidateUris = identityReferenceUris(result)
    const supportUris = identityReferenceSupportUris(result, candidateUris)
    const identityComplete = result.identityComplete && supportUris !== undefined
    if (seed && (!identityComplete || result.declarationIdentity !== seed.declarationIdentity
      || result.declarationUri !== seed.uri || result.servedGeneration !== seed.servedGeneration)) {
      const reason = !result.identityComplete ? "identity-incomplete" : !identityComplete
        ? "support-incomplete" : result.declarationIdentity !== seed.declarationIdentity
          ? "identity-mismatch" : result.declarationUri !== seed.uri ? "uri-mismatch" : "generation-mismatch"
      logReferenceSeedProofRejection(context.logger, traceId, reason, seed, result, status,
        supportUris !== undefined)
      return selectReferenceCandidates(context, query, traceId, false)
    }
    if (seed) context.logger?.info("references.anchor.seed.accepted", { traceId,
      servedGeneration: result.servedGeneration, anchorWorkerStarts: 0,
      anchorProgramBuilds: 0, validation: "pending-final-compiler-batches" })
    context.logger?.info("references.index.accepted", {
      anchorMode: seed ? "indexed-local-export-seed" : identityComplete
        ? "compiler-definition-identity"
        : result.narrowedUris?.length
          ? "compiler-definition-conservative"
          : "compiler-definition",
      candidateFiles: candidateUris.length,
      conservativeCandidateFiles: result.uris.length,
      servedGeneration: result.servedGeneration,
      ...(context.environment.ARKTS_REFERENCES_TRACE === "1"
        ? {
            bindingResolutions: referenceBindingResolutionSummary(result),
          }
        : {}),
    })
    return {
      uris: candidateUris,
      identityComplete,
      ...(identityComplete && result.declarationUri
        ? { anchorUri: result.declarationUri }
        : {}),
      ...(seed ? { anchorPosition: seed.range.start } : {}),
      ...(identityComplete && supportUris ? { supportUris } : {}),
    }
  } catch (error) {
    context.assertCurrent()
    context.logger?.info("references.index.fallback", {
      reason: "index-error",
      message: error instanceof Error ? error.message : String(error),
    })
    return undefined
  }
}

async function resolveCandidateSources(
  context: ReferenceCandidateSelectionContext,
  workspaceId: string, declarationUri: string, declarationPosition: TextPosition,
  result: WorkspaceReferenceCandidateResult, admittedRootUris: readonly string[] | undefined,
  signal?: AbortSignal,
): Promise<WorkspaceReferenceCandidateResult> {
  return resolveReferenceCandidateSources({
    index: context.index, freshness: context.freshness,
    environment: context.environment, projectConfiguration: context.projectConfiguration,
    sdkConfiguration: context.sdkConfiguration, logger: context.logger,
    sourceOverlays: context.sourceOverlays,
  }, workspaceId, declarationUri, declarationPosition, result, admittedRootUris, signal)
}

function toFilePath(uri: string): string | undefined {
  try { return uri.startsWith("file:") ? fileURLToPath(uri) : undefined }
  catch { return undefined }
}
