import fs from "node:fs"
import type { TransientSemanticWorkerObserver } from "../transient-worker-lifecycle.js"

export interface SemanticRuntimeMetricsInput {
  readonly memoryUsage: {
    readonly rss: number
    readonly heapTotal: number
    readonly heapUsed: number
    readonly external: number
    readonly arrayBuffers: number
  }
  readonly semanticWorkerCount: number
  readonly residentContextCount: number
  readonly projectFiles: number
  readonly openDocuments: number
  readonly leaseCount: number
}

export interface SemanticRuntimeMetrics {
  readonly rss: number
  readonly heapTotal: number
  readonly heapUsed: number
  readonly external: number
  readonly arrayBuffers: number
  readonly semanticWorkerCount: number
  readonly residentContextCount: number
  readonly projectFiles: number
  readonly openDocuments: number
  readonly leaseCount: number
}

export function semanticRuntimeMetrics(input: SemanticRuntimeMetricsInput): SemanticRuntimeMetrics {
  return Object.freeze({
    rss: input.memoryUsage.rss,
    heapTotal: input.memoryUsage.heapTotal,
    heapUsed: input.memoryUsage.heapUsed,
    external: input.memoryUsage.external,
    arrayBuffers: input.memoryUsage.arrayBuffers,
    semanticWorkerCount: input.semanticWorkerCount,
    residentContextCount: input.residentContextCount,
    projectFiles: input.projectFiles,
    openDocuments: input.openDocuments,
    leaseCount: input.leaseCount,
  })
}

/** Records observations only; pressure decisions remain with the runtime policy. */
export function createSemanticRuntimeMetricsRecorder(
  metricsPath: string | undefined,
  getStats: () => Omit<SemanticRuntimeMetricsInput, "memoryUsage">,
) {
  const active = { reference: 0, anchor: 0, diagnostic: 0, "reference-cache": 0, "reference-job": 0, "anchor-job": 0 }
  const sample = (
    memoryUsage = process.memoryUsage(),
    stats = getStats(),
  ): void => {
    if (!metricsPath) return
    try {
      const transientVerifierCount = active.reference + active.anchor + active.diagnostic
      const metrics = {
        ...semanticRuntimeMetrics({ memoryUsage, ...stats }),
        epochMs: Date.now(), monotonicNs: process.hrtime.bigint().toString(),
        processId: process.pid, rssScope: "node-process", heapScope: "semantic-worker-isolate",
        activeReferenceVerifierCount: active.reference,
        activeAnchorVerifierCount: active.anchor,
        activeDiagnosticVerifierCount: active.diagnostic,
        transientVerifierCount,
        activeReferenceJobCount: active["reference-job"],
        activeAnchorJobCount: active["anchor-job"],
        activeVerifierJobCount: active["reference-job"] + active["anchor-job"],
        referenceSdkCacheWorkerCount: active["reference-cache"],
        totalSemanticWorkerCount: stats.semanticWorkerCount + transientVerifierCount + active["reference-cache"],
      }
      fs.appendFileSync(metricsPath, `${JSON.stringify(metrics)}\n`)
    } catch (error) {
      process.stderr.write(`semantic metrics write failed: ${error instanceof Error ? error.message : String(error)}\n`)
    }
  }
  const onTransientWorker: TransientSemanticWorkerObserver | undefined = metricsPath
    ? (kind, phase) => {
        active[kind] += phase === "started" ? 1 : -1
        sample()
      } : undefined
  return { sample, onTransientWorker }
}
