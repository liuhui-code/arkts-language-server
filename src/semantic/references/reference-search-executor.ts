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
  readonly result: SemanticReferenceQueryResult
  readonly unavailableProjectPaths?: readonly string[]
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
    semanticGraph?: HarmonySemanticGraph,
  ): Promise<SemanticReferenceQueryResult> {
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
    const dependencyProfile = identityAnchorPath
      ? this.options.dependencyProfile
      : "closure"
    const referenceSession = this.nextSession++
    this.options.disposeResidentContext(rootPath)
    const collected: SemanticDefinitionCandidate[] = []
    for (const batch of plan.batches) {
      const started = performance.now()
      const rootPaths = dependencyProfile === "identity" && identityAnchorPath
        ? uniquePaths([...batch.rootPaths, identityAnchorPath])
        : batch.rootPaths
      let admittedProjectPaths = dependencyProfile === "identity"
        ? rootPaths
        : batch.admittedProjectPaths
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
        if (verification.result.status === "complete") break
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
          return this.execute(workspace, position, includeDeclaration, candidatePaths)
        }
        return verification.result
      }
      const { result } = verification
      collected.push(...result.references)
      this.options.trace?.("references.batch.complete", {
        referenceSession,
        verifierIsolation: "transient-worker",
        batchIndex: batch.index,
        batchCount: plan.batches.length,
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
        ...verification.stats,
        locations: result.references.length,
        durationMs: Math.round((performance.now() - started) * 100) / 100,
        rss: verification.memory.rss,
        heapUsed: verification.memory.heapUsed,
      })
    }
    return { status: "complete", references: uniqueSortedReferences(collected) }
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
