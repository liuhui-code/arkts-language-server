import { createHash } from "node:crypto"
import path from "node:path"

import type { SemanticDefinitionCandidate, SemanticDocumentPosition } from "../../core/protocol.js"
import type { SemanticWorkspaceView } from "../../core/workspace/document-store.js"
import { resolveReferenceAnchorInWorker, type ReferenceBatchWorkerOptions } from "./reference-batch-worker.js"

export type ReferenceAnchorTrace = (
  event: string, fields: Readonly<Record<string, string | number | boolean | null | undefined>>,
) => void

/** One compiler-produced definition, owned and discarded with its resident context. */
export class ReferenceAnchorMemo {
  private entry: { key: string; definition: SemanticDefinitionCandidate;
    sources: readonly (readonly [string, string])[] } | undefined

  capture(workspace: SemanticWorkspaceView, position: SemanticDocumentPosition,
    definitions: readonly SemanticDefinitionCandidate[]): void {
    this.clear()
    if (!workspace.state.syntaxReady || definitions.length !== 1) return
    const definition = definitions[0]!
    const key = anchorSnapshotKey(workspace, position)
    if (key === undefined) return
    const sources = workspace.documents.map(document => (
      [path.resolve(document.path), sourceFingerprint(document.content)] as const
    ))
    if (JSON.stringify([key, definition, sources]).length > 16_384) return
    this.entry = { key, definition: structuredClone(definition), sources }
  }

  lookup(workspace: SemanticWorkspaceView, position: SemanticDocumentPosition,
    trace?: ReferenceAnchorTrace): readonly SemanticDefinitionCandidate[] | undefined {
    const key = anchorSnapshotKey(workspace, position)
    if (workspace.resetTypeEngine || workspace.changedPaths?.length
      || workspace.removedPaths?.length || workspace.projectMembership?.status !== "complete"
      || key === undefined || !this.entry || this.entry.key !== key) return undefined
    const documents = new Map(workspace.documents.map(document => [path.resolve(document.path), document]))
    if (this.entry.sources.some(([filePath, fingerprint]) => {
      const document = documents.get(filePath)
      return !document || sourceFingerprint(document.content) !== fingerprint
    })) return undefined
    const memory = process.memoryUsage()
    trace?.("references.anchor.complete", {
      verifierIsolation: "validated-definition", definitions: 1,
      anchorWorkerStarts: 0, anchorProgramBuilds: 0,
      rss: memory.rss, heapUsed: memory.heapUsed,
    })
    return [structuredClone(this.entry.definition)]
  }

  clear(): void { this.entry = undefined }
}

function sourceFingerprint(content: string): string {
  return createHash("sha256").update(content).digest("hex")
}

function anchorSnapshotKey(workspace: SemanticWorkspaceView,
  position: SemanticDocumentPosition): string | undefined {
  const overlays = workspace.documents.filter(document => document.overlay)
    .map(document => [path.resolve(document.path), document.documentVersion] as const)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
  if (overlays.some(([, version]) => version === undefined)) return undefined
  return JSON.stringify([workspace.canonicalRootId, workspace.typeEngineResetEpoch,
    workspace.contentRevision, workspace.state.path, workspace.state.contentGeneration,
    workspace.state.documentVersion, path.resolve(position.path), position.line, position.column,
    overlays])
}

export async function resolveIsolatedReferenceAnchor(
  workspace: SemanticWorkspaceView,
  position: SemanticDocumentPosition,
  options: ReferenceBatchWorkerOptions,
  trace?: ReferenceAnchorTrace,
): Promise<readonly SemanticDefinitionCandidate[]> {
  const rootPaths = new Set([path.resolve(workspace.state.path)])
  for (const document of workspace.documents) {
    if (document.overlay) rootPaths.add(path.resolve(document.path))
  }
  const admitted = new Set(rootPaths)
  const started = performance.now()
  const verification = await resolveReferenceAnchorInWorker({
    ...workspace,
    semanticRootPaths: [...rootPaths],
    documents: workspace.documents.filter(document => (
      document.overlay || admitted.has(path.resolve(document.path))
    )),
  }, position, options)
  trace?.("references.anchor.complete", {
    verifierIsolation: "transient-worker",
    definitions: verification.definitions.length,
    workerStartupMs: verification.timings.workerStartupMs,
    workerPrepareHostMs: verification.timings.prepareHostMs,
    workerProgramReadyMs: verification.timings.programReadyMs,
    workerGetProgramMs: verification.timings.getProgramMs,
    workerCreateProgramMs: verification.timings.createProgramMs,
    workerGetTypeCheckerMs: verification.timings.getTypeCheckerMs,
    workerQueryMs: verification.timings.queryMs,
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
    durationMs: Math.round((performance.now() - started) * 100) / 100,
    rss: verification.memory.rss,
    heapUsed: verification.memory.heapUsed,
  })
  return verification.definitions
}
