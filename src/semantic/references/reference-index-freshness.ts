import type {
  WorkspaceIndexStatus,
  WorkspaceReferenceCandidateResult,
  WorkspaceReferenceIndexPort,
} from "../../contracts/workspace-index.js"
import type { SemanticWorkspaceFileChangeBatch } from "../../contracts/semantic-engine.js"
import type { StructuredLogger } from "../../observability/logger.js"
import { toFilePath } from "../semantic-worker-file-identity.js"

interface DirtyIndexGeneration {
  baselineGeneration?: number
  capture?: Promise<void>
  postEditCatalogGeneration?: number
  postEditCatalogCapture?: Promise<void>
}

export interface ReferenceIndexFreshnessResult {
  usable: boolean
  recovered: boolean
  baselineGeneration?: number
  committedGeneration?: number
}

export class ReferenceIndexFreshness {
  readonly #acceptedGenerations = new Map<string, number>()
  readonly #dirtyGenerations = new Map<string, DirtyIndexGeneration>()
  readonly #catalogDirtyGenerations = new Map<string, {
    dirty: DirtyIndexGeneration
    baselineGeneration: number
  }>()

  workspaceFilesChanged(
    batch: SemanticWorkspaceFileChangeBatch,
    index?: WorkspaceReferenceIndexPort,
  ): void {
    if (batch.rootDirty || batch.changes.some(change => {
      const changedPath = toFilePath(change.uri)
      return changedPath?.endsWith(".ets") || changedPath?.endsWith(".ts")
    })) this.changed(batch.rootUri, index)
  }

  catalog(
    workspaceId: string,
    phase: "starting" | "ready",
    index: WorkspaceReferenceIndexPort,
  ): Promise<void> | void {
    if (phase === "starting") return this.catalogStarted(workspaceId, index)
    this.catalogReady(workspaceId, index)
  }

  changed(workspaceId: string, index?: WorkspaceReferenceIndexPort): void {
    const dirty: DirtyIndexGeneration = {
      baselineGeneration: this.#acceptedGenerations.get(workspaceId),
    }
    this.#dirtyGenerations.set(workspaceId, dirty)
    if (!index) return
    dirty.capture = index.status(workspaceId).then((status) => {
      if (this.#dirtyGenerations.get(workspaceId) === dirty) {
        // A catalog already building can contain bytes from before this edit.
        // The watched change queues another catalog; only a later generation
        // can certify that the edit was included.
        dirty.baselineGeneration = Math.max(
          dirty.baselineGeneration ?? 0,
          status.committedGeneration,
          status.buildingGeneration ?? 0,
        )
      }
    }).catch(() => {
      if (this.#dirtyGenerations.get(workspaceId) === dirty) {
        dirty.baselineGeneration = undefined
      }
    })
  }

  isDirty(workspaceId: string): boolean {
    return this.#dirtyGenerations.has(workspaceId)
  }

  async catalogStarted(workspaceId: string, index: WorkspaceReferenceIndexPort): Promise<void> {
    if (!this.#dirtyGenerations.has(workspaceId)) return
    const status = await safeStatus(index, workspaceId)
    // The caller awaits this before catalog/start; bind the latest edit token.
    const dirty = this.#dirtyGenerations.get(workspaceId)
    if (!status || !dirty) return
    this.#catalogDirtyGenerations.set(workspaceId, {
      dirty,
      baselineGeneration: Math.max(status.committedGeneration, status.buildingGeneration ?? 0),
    })
  }

  catalogReady(workspaceId: string, index: WorkspaceReferenceIndexPort): void {
    const pending = this.#catalogDirtyGenerations.get(workspaceId)
    this.#catalogDirtyGenerations.delete(workspaceId)
    if (!pending || this.#dirtyGenerations.get(workspaceId) !== pending.dirty) return
    pending.dirty.postEditCatalogCapture = safeStatus(index, workspaceId).then((status) => {
      if (this.#dirtyGenerations.get(workspaceId) === pending.dirty
        && status?.state === "ready"
        && status.committedGeneration > pending.baselineGeneration) {
        pending.dirty.postEditCatalogGeneration = status.committedGeneration
      }
    })
  }

  accepted(workspaceId: string, generation: number): void {
    this.#acceptedGenerations.set(workspaceId, generation)
  }

  async beforeSearch(
    workspaceId: string,
    index: WorkspaceReferenceIndexPort,
  ): Promise<ReferenceIndexFreshnessResult> {
    const dirty = this.#dirtyGenerations.get(workspaceId)
    if (!dirty) return { usable: true, recovered: false }
    await dirty.capture
    await dirty.postEditCatalogCapture
    const status = await safeStatus(index, workspaceId)
    if (this.#dirtyGenerations.get(workspaceId) !== dirty) {
      return { usable: true, recovered: false }
    }
    const baselineGeneration = dirty.baselineGeneration
    if (status?.state === "ready" && (
      (baselineGeneration !== undefined && status.committedGeneration > baselineGeneration)
      || (dirty.postEditCatalogGeneration !== undefined
        && status.committedGeneration >= dirty.postEditCatalogGeneration)
    )) {
      this.#dirtyGenerations.delete(workspaceId)
      return {
        usable: true,
        recovered: true,
        baselineGeneration,
        committedGeneration: status.committedGeneration,
      }
    }
    return {
      usable: false,
      recovered: false,
      ...(baselineGeneration === undefined ? {} : { baselineGeneration }),
      ...(status ? { committedGeneration: status.committedGeneration } : {}),
    }
  }

  async accepts(
    workspaceId: string,
    result: WorkspaceReferenceCandidateResult,
    index: WorkspaceReferenceIndexPort,
  ): Promise<boolean> {
    if (!result.supported || !result.complete || result.completeness !== "ready"
      || !result.declarationIdentity) return false
    const status = await index.status(workspaceId)
    if (!isReferenceIndexCandidateEligible(result, status)) return false
    this.accepted(workspaceId, result.servedGeneration)
    return true
  }
}

export function isReferenceIndexCandidateEligible(
  result: WorkspaceReferenceCandidateResult,
  status: WorkspaceIndexStatus,
): boolean {
  return result.supported && result.complete && result.completeness === "ready"
    && Boolean(result.declarationIdentity) && status.state === "ready"
    && result.servedGeneration === status.committedGeneration
}

export async function prepareReferenceIndexSearch(
  freshness: ReferenceIndexFreshness,
  workspaceId: string,
  index: WorkspaceReferenceIndexPort,
  logger?: StructuredLogger,
): Promise<boolean> {
  const result = await freshness.beforeSearch(workspaceId, index)
  if (!result.usable) {
    logger?.info("references.index.fallback", {
      reason: "workspace-changed",
      baselineGeneration: result.baselineGeneration,
      committedGeneration: result.committedGeneration,
    })
    return false
  }
  if (result.recovered) logger?.info("references.index.recovered", {
    baselineGeneration: result.baselineGeneration,
    committedGeneration: result.committedGeneration,
  })
  return true
}

async function safeStatus(
  index: WorkspaceReferenceIndexPort,
  workspaceId: string,
): Promise<WorkspaceIndexStatus | undefined> {
  try {
    return await index.status(workspaceId)
  } catch {
    return undefined
  }
}
