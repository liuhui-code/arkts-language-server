import type { SemanticCoordinator, SemanticManagedContext } from "../../semantic/coordinator/semantic-coordinator.js"
import { observeCompilerProgramBuild } from "./compiler-query-timing.js"

/** Keep the context leased until a synchronous query and optional build witness finish. */
export function runWithSemanticLease<Context extends SemanticManagedContext, Result>(
  coordinator: SemanticCoordinator<Context>,
  contextId: string,
  run: (context: Context) => Result,
  observeBuild: boolean,
  observeCost = false,
  promoteRecency = true,
): Result {
  const lease = coordinator.acquire(contextId, promoteRecency)
  try {
    if (!observeBuild && !observeCost) return run(lease.context)
    const { result, buildObserved, rebuildCostMs } = observeCompilerProgramBuild(() => run(lease.context))
    if (observeBuild && buildObserved) coordinator.markSemanticWork(contextId, lease.context)
    if (rebuildCostMs !== undefined) coordinator.recordRebuildCost(contextId, lease.context, rebuildCostMs)
    return result
  } finally {
    lease.release()
  }
}
