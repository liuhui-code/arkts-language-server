import { createHash } from "node:crypto"
import path from "node:path"

import type { SemanticDefinitionCandidate, SemanticDocumentPosition } from "../../core/protocol.js"
import type { SemanticReferenceQueryResult } from "../../core/types/type-engine.js"
import type { SemanticWorkspaceView } from "../../core/workspace/document-store.js"
import type { HarmonySemanticGraph } from "../../project/harmony-project-model.js"
import type { ReferenceDependencyProfile } from "./reference-runtime.js"
import {
  expandReferenceBatchAdmission,
  planConservativeReferenceBatches,
} from "./reference-search-planner.js"

export interface ReferenceProgramStats {
  readonly programSourceFiles: number
  readonly programProjectFiles: number
  readonly sdkSourceFiles: number
  readonly projectTextCodeUnits: number
  readonly sdkTextCodeUnits: number
  readonly otherSourceFiles: number
  readonly otherTextCodeUnits: number
}

export interface ReferenceBatchVerification {
  readonly anchorVerified?: boolean
  readonly result: SemanticReferenceQueryResult
  readonly unavailableProjectPaths?: readonly string[]
  readonly timings: {
    /** Parent-observed spawn-to-runtime-ready wall time; trace only. */
    readonly workerStartupMs?: number
    readonly prepareHostMs: number
    readonly programReadyMs: number
    readonly queryMs: number
    readonly getProgramMs?: number
    readonly createProgramMs?: number
    readonly getTypeCheckerMs?: number
  }
  readonly prepared: {
    readonly stats: ReferenceProgramStats
    readonly memory: {
      rss: number
      heapUsed: number
    }
  }
  readonly stats: ReferenceProgramStats
  readonly memory: {
    rss: number
    heapUsed: number
  }
}

type TraceField = string | number | boolean | null | undefined

export interface ReferenceSearchExecutorOptions {
  readonly batchRootLimit: number
  readonly dependencyProfile: ReferenceDependencyProfile
  readonly verifyBatch: (
    workspace: SemanticWorkspaceView,
    position: SemanticDocumentPosition,
    includeDeclaration: boolean,
    dependencyProfile: ReferenceDependencyProfile,
  ) => Promise<ReferenceBatchVerification>
  readonly disposeResidentContext: (rootPath: string) => void
  readonly validateConstructorExclusion?: (workspace: SemanticWorkspaceView,
    exclusion: { readonly path: string; readonly token: string }) => boolean
  readonly checkpoint?: () => void
  readonly trace?: (event: string, fields: Readonly<Record<string, TraceField>>) => void
}

export class ReferenceSearchExecutor {
  private nextSession = 1

  constructor(private readonly options: ReferenceSearchExecutorOptions) {}

  async execute(
    workspace: SemanticWorkspaceView,
    position: SemanticDocumentPosition,
    includeDeclaration: boolean,
    candidatePaths?: readonly string[],
    candidateIdentityComplete = false,
    candidateAnchorPath?: string,
    candidateSupportPaths?: readonly string[],
    semanticGraph?: HarmonySemanticGraph,
    allowConstructorExclusion = true,
    maxBatches?: number,
  ): Promise<SemanticReferenceQueryResult> {
    const sessionStarted = performance.now()
    const plan = planConservativeReferenceBatches(
      workspace,
      this.options.batchRootLimit,
      candidatePaths,
      semanticGraph,
    )
    if (!plan) return { status: "incomplete", reason: "project-membership-incomplete" }

    const rootPath = path.resolve(workspace.rootPath)
    const resolvedCandidatePaths = candidatePaths
      ? new Set(candidatePaths.map(filePath => path.resolve(filePath)))
      : undefined
    const identityAnchorPath = candidateIdentityComplete
      && resolvedCandidatePaths
      && candidateAnchorPath !== undefined
      && resolvedCandidatePaths.has(path.resolve(candidateAnchorPath))
      ? path.resolve(candidateAnchorPath)
      : undefined
    const identitySupportPaths = identityAnchorPath && candidateSupportPaths
      ? uniquePaths(candidateSupportPaths)
      : identityAnchorPath ? [identityAnchorPath] : undefined
    const validIdentitySupport = identitySupportPaths?.every(filePath => (
      resolvedCandidatePaths?.has(filePath)
    )) === true && identitySupportPaths?.includes(identityAnchorPath ?? "") === true
    const dependencyProfile = identityAnchorPath && validIdentitySupport
      ? this.options.dependencyProfile
      : "closure"
    const referenceSession = this.nextSession++
    const elapsedMs = () => Math.round((performance.now() - sessionStarted) * 100) / 100
    this.options.trace?.("references.plan.complete", {
      referenceSession,
      elapsedMs: elapsedMs(),
      batchCount: plan.batches.length,
      membershipFiles: plan.membershipFiles,
      candidateFiles: plan.candidateFiles,
      candidateMode: plan.candidateMode,
      semanticUnitMode: plan.semanticUnitMode,
    })
    if (maxBatches !== undefined && plan.batches.length > maxBatches) {
      this.options.trace?.("references.pressure.rejected", {
        referenceSession, reason: "resource-budget-exceeded",
        batchCount: plan.batches.length, maxBatches,
      })
      return { status: "incomplete", reason: "resource-budget-exceeded" }
    }
    this.options.disposeResidentContext(rootPath)
    const collected: SemanticDefinitionCandidate[] = []
    const consumedExclusions = new Map<string, { readonly path: string; readonly token: string }>()
    let batches = plan.batches
    let rootsReplanned = false
    for (let batchCursor = 0; batchCursor < batches.length; batchCursor += 1) {
      const batch = batches[batchCursor]!
      const started = performance.now()
      const rootPaths = dependencyProfile === "identity" && identitySupportPaths
        ? uniquePaths([...batch.rootPaths, ...identitySupportPaths])
        : batch.rootPaths
      let admittedProjectPaths = dependencyProfile === "identity"
        ? rootPaths
        : batch.admittedProjectPaths
      const batchMemory = this.options.trace ? process.memoryUsage() : undefined
      this.options.trace?.("references.batch.start", {
        referenceSession,
        elapsedMs: elapsedMs(),
        batchIndex: batch.index,
        batchCount: batches.length,
        batchRootFiles: rootPaths.length,
        admittedProjectFiles: admittedProjectPaths?.length ?? plan.membershipFiles,
        rssBytes: batchMemory?.rss,
        heapUsedBytes: batchMemory?.heapUsed,
      })
      let verification: ReferenceBatchVerification
      let expansionAttempts = 0
      for (;;) {
        this.options.checkpoint?.()
        verification = await this.options.verifyBatch(
          scopedWorkspace(
            workspace,
            rootPaths,
            batch.index === 0,
            admittedProjectPaths,
          ),
          position,
          includeDeclaration,
          dependencyProfile,
        )
        if (verification.anchorVerified === false) {
          this.options.trace?.("references.anchor.seed.rejected", {
            referenceSession, batchIndex: batch.index, elapsedMs: elapsedMs(),
            verifierIsolation: "transient-worker", reason: "compiler-anchor-mismatch",
            ...verificationTraceFields(verification),
            durationMs: Math.round((performance.now() - started) * 100) / 100,
          })
          this.options.checkpoint?.()
          this.options.trace?.("references.anchor.seed.fallback", {
            referenceSession, reason: "compiler-anchor-mismatch", strategy: "complete-scope",
          })
          // No discovery scope or prior Locations survive rejection. Reuse the
          // immutable request snapshot, not the failed Program or its symbols.
          const { expectedReferenceAnchor: _rejectedAnchor, ...originalPosition } = position
          return this.execute(workspace, originalPosition, includeDeclaration,
            undefined, false, undefined, undefined, semanticGraph, allowConstructorExclusion, maxBatches)
        }
        if (verification.result.status === "complete") break
        this.options.trace?.("references.batch.incomplete", {
          referenceSession,
          elapsedMs: elapsedMs(),
          reason: verification.result.reason,
          batchIndex: batch.index,
          batchCount: batches.length,
          candidateMode: plan.candidateMode,
          semanticUnitMode: plan.semanticUnitMode,
          dependencyProfile,
          expansionAttempts,
          ...verificationTraceFields(verification),
          durationMs: Math.round((performance.now() - started) * 100) / 100,
        })
        const expansion = dependencyProfile === "closure"
          && plan.semanticUnitMode === "project-graph"
          && verification.result.reason === "source-unavailable"
          && admittedProjectPaths
          && semanticGraph
          && expansionAttempts < semanticGraph.units.length
          ? expandReferenceBatchAdmission(
              admittedProjectPaths,
              verification.unavailableProjectPaths ?? [],
              workspace.projectMembership!.paths,
              semanticGraph,
            )
          : undefined
        if (expansion) {
          const unavailableProjectPaths = verification.unavailableProjectPaths ?? []
          expansionAttempts += 1
          admittedProjectPaths = expansion.admittedProjectPaths
          this.options.trace?.("references.semantic-unit.expanded", {
            referenceSession,
            reason: verification.result.reason,
            batchIndex: batch.index,
            expansionAttempt: expansionAttempts,
            addedSemanticUnits: expansion.addedSemanticUnits,
            addedProjectFiles: expansion.addedProjectFiles,
            admittedProjectFiles: admittedProjectPaths.length,
            unavailableProjectFiles: unavailableProjectPaths.length,
            unavailableProjectPathFingerprints: pathFingerprints(
              workspace.rootPath,
              unavailableProjectPaths,
            ),
          })
          continue
        }
        if (plan.semanticUnitMode === "project-graph") {
          this.options.trace?.("references.semantic-unit.fallback", {
            referenceSession,
            reason: verification.result.reason,
            failedBatchIndex: batch.index,
          })
          return this.execute(workspace, position, includeDeclaration, candidatePaths,
            false, undefined, undefined, undefined, allowConstructorExclusion, maxBatches)
        }
        return verification.result
      }
      const { result } = verification
      collected.push(...result.references)
      this.options.trace?.("references.batch.complete", {
        ...(verification.anchorVerified === undefined ? {} : { anchorVerified: verification.anchorVerified }),
        referenceSession,
        elapsedMs: elapsedMs(),
        verifierIsolation: "transient-worker",
        batchIndex: batch.index,
        batchCount: batches.length,
        batchRootFiles: rootPaths.length,
        batchCandidateRoots: batch.candidateRoots,
        batchSemanticUnits: batch.semanticUnits,
        admittedProjectFiles: admittedProjectPaths?.length ?? plan.membershipFiles,
        expansionAttempts,
        membershipFiles: plan.membershipFiles,
        candidateFiles: plan.candidateFiles,
        candidateMode: plan.candidateMode,
        semanticUnitMode: plan.semanticUnitMode,
        semanticUnits: plan.semanticUnits,
        dependencyProfile,
        identitySupportFiles: dependencyProfile === "identity"
          ? identitySupportPaths?.length ?? 0
          : 0,
        ...verificationTraceFields(verification),
        locations: result.references.length,
        durationMs: Math.round((performance.now() - started) * 100) / 100,
      })
      this.options.checkpoint?.()
      const exclusions = allowConstructorExclusion && result.constructorTarget
        ? result.constructorExcludedSources?.filter(exclusion => {
            this.options.checkpoint?.()
            return this.options.validateConstructorExclusion?.(workspace, exclusion) === true
          }) ?? [] : []
      const excludedPaths = new Set(exclusions.map(exclusion => path.resolve(exclusion.path)))
      if (dependencyProfile === "closure" && coversWholeSearchScope(
        result.searchedProjectPaths, workspace, position.path, excludedPaths,
      )) {
        for (const exclusion of exclusions) consumedExclusions.set(exclusion.path, exclusion)
        this.options.checkpoint?.()
        this.options.trace?.(exclusions.length ? "references.constructor-scope.complete" : "references.search-scope.complete", {
          referenceSession, batchIndex: batch.index, elapsedMs: elapsedMs(),
          completedBatches: batch.index + 1,
          skippedBatches: batches.length - batch.index - 1,
          membershipFiles: plan.membershipFiles,
          ...(exclusions.length ? { excludedFiles: exclusions.length } : {}),
        })
        break
      }
      const searched = new Set(result.searchedProjectPaths?.map(filePath => path.resolve(filePath)))
      if (!rootsReplanned && dependencyProfile === "closure" && plan.candidateMode === "conservative"
        && exclusions.length > 0 && batch.rootPaths.every(filePath => searched.has(path.resolve(filePath)))) {
        const pinned = new Set([path.resolve(workspace.state.path), ...workspace.documents
          .filter(document => document.overlay).map(document => path.resolve(document.path))])
        const remaining = uniquePaths(batches.slice(batchCursor + 1).flatMap(next => next.rootPaths))
          .filter(filePath => !pinned.has(filePath))
        const removed = exclusions.filter(exclusion => remaining.includes(path.resolve(exclusion.path)))
        if (removed.length > 0) {
          const remainingPlan = planConservativeReferenceBatches(workspace, this.options.batchRootLimit,
            remaining.filter(filePath => !excludedPaths.has(filePath)), semanticGraph)!
          const oldBatchCount = batches.length
          batches = [...batches.slice(0, batchCursor + 1), ...remainingPlan.batches
            .map((next, index) => ({ ...next, index: batchCursor + 1 + index }))]
          rootsReplanned = true
          for (const exclusion of removed) consumedExclusions.set(exclusion.path, exclusion)
          this.options.trace?.("references.constructor-roots.replanned", {
            referenceSession, batchIndex: batch.index, elapsedMs: elapsedMs(),
            excludedFiles: removed.length, originalBatches: oldBatchCount,
            batchCount: batches.length, membershipFiles: plan.membershipFiles,
          })
        }
      }
    }
    for (const exclusion of consumedExclusions.values()) {
      this.options.checkpoint?.()
      if (this.options.validateConstructorExclusion?.(workspace, exclusion) !== true) {
        this.options.trace?.("references.constructor-roots.fallback", {
          referenceSession, reason: "source-changed", strategy: "complete-scope",
        })
        return this.execute(workspace, position, includeDeclaration, candidatePaths,
          candidateIdentityComplete, candidateAnchorPath, candidateSupportPaths, semanticGraph, false, maxBatches)
      }
    }
    this.options.checkpoint?.()
    const mergeStarted = performance.now()
    const references = uniqueSortedReferences(collected)
    this.options.trace?.("references.merge.complete", {
      referenceSession,
      elapsedMs: elapsedMs(),
      durationMs: Math.round((performance.now() - mergeStarted) * 100) / 100,
      rawLocations: collected.length,
      locations: references.length,
    })
    return { status: "complete", references }
  }
}

function coversWholeSearchScope(
  searchedPaths: readonly string[] | undefined,
  workspace: SemanticWorkspaceView,
  queryPath: string,
  excludedPaths?: ReadonlySet<string>,
): boolean {
  if (!searchedPaths || workspace.projectMembership?.status !== "complete") return false
  const searched = new Set(searchedPaths.map(filePath => path.resolve(filePath)))
  return searched.has(path.resolve(queryPath))
    && workspace.projectMembership.paths.every(filePath => searched.has(path.resolve(filePath))
      || excludedPaths?.has(path.resolve(filePath)))
    && workspace.documents.filter(document => document.overlay)
      .every(document => searched.has(path.resolve(document.path)))
}

/** Observations already captured by the verifier; never queries compiler state. */
function verificationTraceFields(verification: ReferenceBatchVerification): Record<string, TraceField> {
  return {
    preparedProgramSourceFiles: verification.prepared.stats.programSourceFiles,
    preparedProgramProjectFiles: verification.prepared.stats.programProjectFiles,
    preparedSdkSourceFiles: verification.prepared.stats.sdkSourceFiles,
    preparedProjectTextCodeUnits: verification.prepared.stats.projectTextCodeUnits,
    preparedSdkTextCodeUnits: verification.prepared.stats.sdkTextCodeUnits,
    preparedOtherSourceFiles: verification.prepared.stats.otherSourceFiles,
    preparedOtherTextCodeUnits: verification.prepared.stats.otherTextCodeUnits,
    preparedRss: verification.prepared.memory.rss,
    preparedHeapUsed: verification.prepared.memory.heapUsed,
    queryRssDelta: verification.memory.rss - verification.prepared.memory.rss,
    queryHeapUsedDelta: verification.memory.heapUsed - verification.prepared.memory.heapUsed,
    workerPrepareHostMs: verification.timings.prepareHostMs,
    workerStartupMs: verification.timings.workerStartupMs,
    workerProgramReadyMs: verification.timings.programReadyMs,
    workerGetProgramMs: verification.timings.getProgramMs,
    workerCreateProgramMs: verification.timings.createProgramMs,
    workerGetTypeCheckerMs: verification.timings.getTypeCheckerMs,
    workerQueryMs: verification.timings.queryMs,
    ...verification.stats,
    rss: verification.memory.rss,
    heapUsed: verification.memory.heapUsed,
  }
}

function scopedWorkspace(
  workspace: SemanticWorkspaceView,
  rootPaths: readonly string[],
  firstBatch: boolean,
  admittedProjectPaths?: readonly string[],
): SemanticWorkspaceView {
  const admitted = new Set(rootPaths.map(filePath => path.resolve(filePath)))
  const admittedProject = admittedProjectPaths
    ? new Set(admittedProjectPaths.map(filePath => path.resolve(filePath)))
    : undefined
  return {
    ...workspace,
    semanticRootPaths: rootPaths,
    documents: workspace.documents.filter(document => (
      document.overlay || admitted.has(path.resolve(document.path))
    )),
    ...(admittedProject && workspace.projectFileIdentities
      ? { projectFileIdentities: workspace.projectFileIdentities.filter(([filePath]) => (
          admittedProject.has(path.resolve(filePath))
        )) }
      : {}),
    changedPaths: firstBatch ? workspace.changedPaths : undefined,
    removedPaths: firstBatch ? workspace.removedPaths : undefined,
  }
}

function uniqueSortedReferences(
  references: readonly SemanticDefinitionCandidate[],
): SemanticDefinitionCandidate[] {
  const unique = new Map<string, SemanticDefinitionCandidate>()
  for (const reference of references) {
    const key = [
      reference.path,
      reference.range.startLine,
      reference.range.startColumn,
      reference.range.endLine,
      reference.range.endColumn,
    ].join(":")
    unique.set(key, reference)
  }
  return [...unique.values()].sort((left, right) => (
    ordinalCompare(left.path, right.path)
    || left.range.startLine - right.range.startLine
    || left.range.startColumn - right.range.startColumn
    || left.range.endLine - right.range.endLine
    || left.range.endColumn - right.range.endColumn
  ))
}

function ordinalCompare(left: string, right: string): number {
  return left.localeCompare(right)
}

function uniquePaths(filePaths: readonly string[]): string[] {
  return [...new Set(filePaths.map(filePath => path.resolve(filePath)))]
}

function pathFingerprints(rootPath: string, filePaths: readonly string[]): string {
  return [...new Set(filePaths.map(filePath => path.resolve(filePath)))]
    .sort(ordinalCompare)
    .map((filePath) => {
      const relative = path.relative(rootPath, filePath).split(path.sep).join("/")
      return createHash("sha256").update(relative).digest("hex").slice(0, 16)
    })
    .join(",")
}
