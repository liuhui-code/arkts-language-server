import type { SemanticCoordinator, SemanticManagedContext } from "../../semantic/coordinator/semantic-coordinator.js"
import { observeCompilerProgramBuild } from "./compiler-query-timing.js"

/** Keep the context leased until a synchronous query and optional build witness finish. */
export function runWithSemanticLease<Context extends SemanticManagedContext, Result>(
  coordinator: SemanticCoordinator<Context>,
  contextId: string,
  run: (context: Context) => Result,
  observeBuild: boolean,
): Result {
  const lease = coordinator.acquire(contextId)
  try {
    if (!observeBuild) return run(lease.context)
    const { result, buildObserved } = observeCompilerProgramBuild(() => run(lease.context))
    if (buildObserved) coordinator.markSemanticWork(contextId, lease.context)
    return result
  } finally {
    lease.release()
  }
}
