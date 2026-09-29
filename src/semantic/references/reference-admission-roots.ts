import path from "node:path"
import { pathToFileURL } from "node:url"

import type { LocalPackageResolver } from "../../core/sdk/local-package-resolver.js"
import type { StructuredLogger } from "../../observability/logger.js"
import { logReferenceCandidatePhase } from "./reference-index-telemetry.js"

/** ProjectGraph admission is unchanged; incomplete graphs never narrow roots. */
export function referenceAdmissionRoots(
  resolver: LocalPackageResolver, rootPath: string | undefined,
  logger?: StructuredLogger, traceId?: string,
): readonly string[] | undefined {
  const started = performance.now()
  let outcome: "complete" | "error" = "complete"
  try {
    if (!rootPath) return undefined
    const graph = resolver.projectFor(rootPath).semanticGraph()
    if (graph.status !== "ready" || !graph.complete || graph.units.length === 0) return undefined
    const admittedPaths = graph.units.flatMap(unit => {
      const entry = resolver.moduleEntryPath(rootPath, unit.moduleRoot)
      const roots = [...unit.sourceRoots, ...unit.packageRoots ?? []]
      return entry && !unit.sourceRoots.some(sourceRoot => (
        entry === sourceRoot || entry.startsWith(`${sourceRoot}${path.sep}`)
      )) ? [...roots, entry] : roots
    })
    return [...new Set(admittedPaths.map(sourceRoot => pathToFileURL(sourceRoot).href))].sort()
  } catch (error) {
    outcome = "error"
    throw error
  } finally {
    logReferenceCandidatePhase(logger, traceId, "admission", started, outcome)
  }
}
