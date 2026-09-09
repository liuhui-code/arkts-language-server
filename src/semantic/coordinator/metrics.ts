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
