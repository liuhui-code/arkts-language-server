import type {
  WorkspaceIndexStatus,
  WorkspaceReferenceCandidateResult,
  WorkspaceReferenceIndexPort,
} from "../../contracts/workspace-index.js"
import type { StructuredLogger } from "../../observability/logger.js"

interface DirtyIndexGeneration {
  baselineGeneration?: number
  capture?: Promise<void>
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

  changed(workspaceId: string, index?: WorkspaceReferenceIndexPort): void {
    const dirty: DirtyIndexGeneration = {
      baselineGeneration: this.#acceptedGenerations.get(workspaceId),
    }
    this.#dirtyGenerations.set(workspaceId, dirty)
    if (dirty.baselineGeneration !== undefined || !index) return
    dirty.capture = index.status(workspaceId).then((status) => {
      if (this.#dirtyGenerations.get(workspaceId) === dirty) {
        dirty.baselineGeneration = status.committedGeneration
      }
    }).catch(() => {})
  }

  isDirty(workspaceId: string): boolean {
    return this.#dirtyGenerations.has(workspaceId)
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
    const status = await safeStatus(index, workspaceId)
    if (this.#dirtyGenerations.get(workspaceId) !== dirty) {
      return { usable: true, recovered: false }
    }
    const baselineGeneration = dirty.baselineGeneration
    if (status?.state === "ready" && baselineGeneration !== undefined
      && status.committedGeneration > baselineGeneration) {
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
    if (result.servedGeneration !== status.committedGeneration) return false
    this.accepted(workspaceId, result.servedGeneration)
    return true
  }
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
