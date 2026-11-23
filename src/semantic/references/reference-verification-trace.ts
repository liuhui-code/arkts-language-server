import type { ReferenceBatchVerification } from "./reference-search-executor.js"
type TraceField = string | number | boolean | null | undefined

export function verificationTraceFields(verification: ReferenceBatchVerification): Record<string, TraceField> {
  return {
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
    workerPrepareHostMs: verification.timings.prepareHostMs,
    workerStartupMs: verification.timings.workerStartupMs,
    workerReused: verification.timings.workerReused,
    workerProgramReadyMs: verification.timings.programReadyMs,
    workerGetProgramMs: verification.timings.getProgramMs,
    workerCreateProgramMs: verification.timings.createProgramMs,
    workerGetTypeCheckerMs: verification.timings.getTypeCheckerMs,
    workerQueryMs: verification.timings.queryMs,
    ...verification.stats,
    rss: verification.memory.rss,
    heapUsed: verification.memory.heapUsed,
  }
}
