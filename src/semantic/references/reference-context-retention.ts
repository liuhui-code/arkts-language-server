import type {
  SemanticCoordinator,
  SemanticManagedContext,
} from "../coordinator/semantic-coordinator.js"
import type { ReferenceContextRetentionProfile } from "./reference-runtime.js"

type Trace = (
  event: string,
  fields: Readonly<Record<string, string | number | boolean | null | undefined>>,
) => void

interface ReferenceCancellationToken {
  isCancellationRequested(): boolean
}

export function applyReferenceContextRetention<Context extends SemanticManagedContext>(
  profile: ReferenceContextRetentionProfile,
  coordinator: SemanticCoordinator<Context>,
  rootPath: string,
  trace?: Trace,
): void {
  const residentBefore = coordinator.stats().residentContextCount
  const removed = profile === "budget-aware" ? false : coordinator.remove(rootPath)
  trace?.("references.context.retention", {
    profile,
    residentBefore,
    residentAfter: coordinator.stats().residentContextCount,
    removed,
  })
}

export function referenceCheckpoint(
  token: ReferenceCancellationToken | undefined,
): (() => void) | undefined {
  if (!token) return undefined
  return () => {
    if (token.isCancellationRequested()) throw new Error("Semantic request cancelled")
  }
}
