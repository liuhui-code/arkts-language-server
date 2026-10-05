import ts from "typescript"

export interface CompilerQueryTiming {
  readonly durationMs: number
  readonly createProgramMs: number
  /** Grouped records, not the number of Program constructions. */
  readonly createProgramEvents: number
  /** Residual within the query callback, not later result merging. */
  readonly otherDefinitionMs: number
}

export function traceCompilerQuery<Result>(
  query: () => Result,
  enabled: boolean,
): { result: Result; timing?: CompilerQueryTiming } {
  if (!enabled) return { result: query() }

  // The fork's event collector is process-wide. The semantic worker dispatches
  // one synchronous compiler query at a time; never force getProgram() here.
  ts.PerformanceDotting.clearEvent()
  ts.PerformanceDotting.setPerformanceSwitch(ts.PerformanceDotting.AnalyzeMode.TRACE)
  const startedAt = performance.now()
  try {
    const result = query()
    const durationMs = performance.now() - startedAt
    const programEvents = ts.PerformanceDotting.getEventData()
      .filter(event => event.name === "createProgram")
    const createProgramMs = programEvents.reduce((total, event) => total + event.duration / 1_000_000, 0)
    return { result, timing: {
      durationMs, createProgramMs, createProgramEvents: programEvents.length,
      otherDefinitionMs: Math.max(0, durationMs - createProgramMs),
    } }
  } finally {
    ts.PerformanceDotting.clearEvent()
  }
}
