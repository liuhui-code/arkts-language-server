import path from "node:path"

import type { SemanticDefinitionCandidate, SemanticDocumentPosition } from "../../core/protocol.js"
import type { SemanticReferenceQueryResult } from "../../core/types/type-engine.js"
import type { SemanticWorkspaceView } from "../../core/workspace/document-store.js"
import type { HarmonySemanticGraph } from "../../project/harmony-project-model.js"
import { planConservativeReferenceBatches } from "./reference-search-planner.js"

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
  readonly verifyBatch: (
    workspace: SemanticWorkspaceView,
    position: SemanticDocumentPosition,
    includeDeclaration: boolean,
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
    const referenceSession = this.nextSession++
    this.options.disposeResidentContext(rootPath)
    const collected: SemanticDefinitionCandidate[] = []
    for (const batch of plan.batches) {
      this.options.checkpoint?.()
      const started = performance.now()
      const verification = await this.options.verifyBatch(
        scopedWorkspace(
          workspace,
          batch.rootPaths,
          batch.index === 0,
          batch.admittedProjectPaths,
        ),
        position,
        includeDeclaration,
      )
      const { result } = verification
      if (result.status !== "complete") {
        if (plan.semanticUnitMode === "project-graph") {
          this.options.trace?.("references.semantic-unit.fallback", {
            referenceSession,
            reason: result.reason,
            failedBatchIndex: batch.index,
          })
          return this.execute(
            workspace,
            position,
            includeDeclaration,
            candidatePaths,
          )
        }
        return result
      }
      collected.push(...result.references)
      this.options.trace?.("references.batch.complete", {
        referenceSession,
        verifierIsolation: "transient-worker",
        batchIndex: batch.index,
        batchCount: plan.batches.length,
        batchRootFiles: batch.rootPaths.length,
        batchCandidateRoots: batch.candidateRoots,
        batchSemanticUnits: batch.semanticUnits,
        admittedProjectFiles: batch.admittedProjectPaths?.length ?? plan.membershipFiles,
        membershipFiles: plan.membershipFiles,
        candidateFiles: plan.candidateFiles,
        candidateMode: plan.candidateMode,
        semanticUnitMode: plan.semanticUnitMode,
        semanticUnits: plan.semanticUnits,
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
