import type { WorkspaceCatalogStorage, WorkspaceIndexProgress } from "../contracts/workspace-symbol-service.js"
import type { WorkspaceIndexStatus } from "../contracts/workspace-index.js"
import { SidecarProtocolError, asRecord, isIndexState, isCompleteness, isNonNegativeInteger, isNullableGeneration } from "./sidecar-protocol-validation.js"

export interface MappedCatalogStatus {
  progress: WorkspaceIndexProgress
  indexStatus: WorkspaceIndexStatus
  phase: CatalogPhase
  committedGeneration: number
  buildingGeneration: number | null
  mark: CatalogProgressMark
  terminal: boolean
}

export interface CatalogProgressMark {
  phase: CatalogPhase
  discovered: number
  indexed: number
  rejected: number
  policySkipped: number
  ignored: number
  totalFiles?: number
  storage?: WorkspaceCatalogStorage
}

export function mapCatalogStatus(value: unknown): MappedCatalogStatus {
  const status = asRecord(value)
  if (!isCatalogPhase(status.phase)
    || !isIndexState(status.state)
    || !isCompleteness(status.completeness)
    || !isNonNegativeInteger(status.committedGeneration)
    || !isNullableGeneration(status.buildingGeneration)
    || !isNonNegativeInteger(status.discovered)
    || !isNonNegativeInteger(status.indexed)
    || !isNonNegativeInteger(status.rejected)
    || !isNonNegativeInteger(status.policySkipped)
    || !isNonNegativeInteger(status.ignored)
    || (status.totalFiles !== undefined && !isNonNegativeInteger(status.totalFiles))) {
    throw new SidecarProtocolError("index sidecar returned an invalid catalog status")
  }
  const storage = mapStorage(status.storage)
  if (storage && storage.writtenDocuments > status.indexed) {
    throw new SidecarProtocolError("index sidecar persisted more files than it parsed")
  }
  const phase = mapCatalogPhase(status.phase, status.totalFiles !== undefined)
  return {
    progress: {
      phase,
      discoveredFiles: status.discovered,
      indexedFiles: status.indexed,
      skippedEntries: status.rejected + status.policySkipped + status.ignored,
      ...(storage ? { storage } : {}),
      ...(status.totalFiles === undefined ? {} : { totalFiles: status.totalFiles }),
    },
    indexStatus: {
      state: status.state, committedGeneration: status.committedGeneration,
      ...(typeof status.buildingGeneration === "number" ? { buildingGeneration: status.buildingGeneration } : {}),
      ...(typeof status.message === "string" ? { message: status.message } : {}),
    },
    phase: status.phase,
    committedGeneration: status.committedGeneration,
    buildingGeneration: status.buildingGeneration,
    mark: {
      phase: status.phase,
      discovered: status.discovered,
      indexed: status.indexed,
      rejected: status.rejected,
      policySkipped: status.policySkipped,
      ignored: status.ignored,
      ...(storage ? { storage } : {}),
      ...(status.totalFiles === undefined ? {} : { totalFiles: status.totalFiles }),
    },
    terminal: status.phase === "ready"
      || status.phase === "partial"
      || status.phase === "degraded"
      || status.phase === "cancelled",
  }
}

function mapStorage(value: unknown): WorkspaceCatalogStorage | undefined {
  if (value === undefined) return undefined
  const storage = asRecord(value)
  const stage = storage.stage
  if ((stage !== "writing" && stage !== "committing" && stage !== "checkpointing" && stage !== "validating"
      && stage !== "publishing" && stage !== "checking" && stage !== "reusing")
    || !isNonNegativeInteger(storage.writtenDocuments) || !isNonNegativeInteger(storage.writtenRows)
    || !isNonNegativeInteger(storage.stageElapsedMs) || !isNonNegativeInteger(storage.activitySequence)
    || !isNonNegativeInteger(storage.walFrames) || !isNonNegativeInteger(storage.checkpointedFrames)) {
    throw new SidecarProtocolError("index sidecar returned invalid storage progress")
  }
  return { stage, writtenDocuments: storage.writtenDocuments, writtenRows: storage.writtenRows,
    stageElapsedMs: storage.stageElapsedMs, activitySequence: storage.activitySequence,
    walFrames: storage.walFrames, checkpointedFrames: storage.checkpointedFrames }
}

type CatalogPhase = "idle" | "discovering" | "activating" | "cancelling" | "ready" | "partial" | "degraded" | "cancelled"

function isCatalogPhase(value: unknown): value is CatalogPhase {
  return value === "idle"
    || value === "discovering"
    || value === "activating"
    || value === "cancelling"
    || value === "ready"
    || value === "partial"
    || value === "degraded"
    || value === "cancelled"
}

function mapCatalogPhase(
  phase: CatalogPhase,
  totalKnown: boolean,
): WorkspaceIndexProgress["phase"] {
  if (phase === "ready" || phase === "partial") return "ready"
  if (phase === "degraded") return "degraded"
  if (phase === "cancelled") return "cancelled"
  if (phase === "activating" || phase === "cancelling" || totalKnown) return "indexing"
  return "discovering"
}

export function assertMonotonicCatalogProgress(
  previous: CatalogProgressMark,
  current: CatalogProgressMark,
): void {
  const a = previous.storage
  const b = current.storage
  const storageRegressed = a && b && (b.activitySequence < a.activitySequence
    || b.writtenDocuments < a.writtenDocuments || b.writtenRows < a.writtenRows
    || (b.activitySequence === a.activitySequence && (b.stage !== a.stage || b.stageElapsedMs < a.stageElapsedMs)))
  const regressed = storageRegressed || catalogPhaseRank(current.phase) < catalogPhaseRank(previous.phase)
    || current.discovered < previous.discovered
    || current.indexed < previous.indexed
    || current.rejected < previous.rejected
    || current.policySkipped < previous.policySkipped
    || current.ignored < previous.ignored
    || (previous.totalFiles !== undefined
      && (current.totalFiles === undefined || current.totalFiles < previous.totalFiles))
  if (regressed) {
    throw new SidecarProtocolError("index sidecar catalog progress regressed")
  }
}

function catalogPhaseRank(phase: CatalogPhase): number {
  switch (phase) {
    case "idle": return 0
    case "discovering": return 1
    case "activating": return 2
    case "cancelling": return 3
    case "ready":
    case "partial":
    case "degraded":
    case "cancelled": return 4
  }
}
