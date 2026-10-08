import ts from "typescript"

type EmitReferenceTrace = (
  event: string, fields: Readonly<Record<string, number | boolean | null>>,
) => void

let activeFindReferencesTrace: { emit: EmitReferenceTrace; callIndex: number } | undefined
let observedProgramBuildClock = 0

export interface CompilerQueryTiming {
  readonly durationMs: number
  readonly collectorAvailable: boolean
  readonly createProgramMs: number | null
  /** Grouped records, not the number of Program constructions. */
  readonly createProgramEvents: number | null
  /** Residual within the query callback, not later result merging. */
  readonly otherDefinitionMs: number | null
}

export function traceCompilerQuery<Result>(
  query: () => Result,
  enabled: boolean,
): { result: Result; timing?: CompilerQueryTiming } {
  if (!enabled) return { result: query() }

  // The fork's event collector is process-wide. The semantic worker dispatches
  // one synchronous compiler query at a time; never force getProgram() here.
  let collectorReady = false
  try {
    ts.PerformanceDotting.clearEvent()
    ts.PerformanceDotting.setPerformanceSwitch(ts.PerformanceDotting.AnalyzeMode.TRACE)
    collectorReady = true
  } catch {
    // Optional attribution cannot prevent the authoritative query.
  }
  const startedAt = performance.now()
  try {
    const result = query()
    const durationMs = performance.now() - startedAt
    const unavailable: CompilerQueryTiming = {
      durationMs, collectorAvailable: false, createProgramMs: null,
      createProgramEvents: null, otherDefinitionMs: null,
    }
    if (!collectorReady) return { result, timing: unavailable }
    try {
      const programEvents = ts.PerformanceDotting.getEventData()
        .filter(event => event.name === "createProgram")
      const createProgramMs = programEvents.reduce((total, event) => total + event.duration / 1_000_000, 0)
      if (!Number.isFinite(createProgramMs)) return { result, timing: unavailable }
      if (programEvents.length > 0) observedProgramBuildClock += 1
      return { result, timing: {
        durationMs, collectorAvailable: true, createProgramMs,
        createProgramEvents: programEvents.length,
        otherDefinitionMs: Math.max(0, durationMs - createProgramMs),
      } }
    } catch {
      return { result, timing: unavailable }
    }
  } finally {
    try { ts.PerformanceDotting.clearEvent() } catch { /* Optional cleanup. */ }
  }
}

/** Positive evidence only: grouped compiler events do not establish Program identity. */
export function observeCompilerProgramBuild<Result>(query: () => Result): {
  result: Result
  buildObserved: boolean
} {
  const before = observedProgramBuildClock
  const { result } = traceCompilerQuery(query, true)
  return { result, buildObserved: observedProgramBuildClock > before }
}

export function traceReferenceQuery<Result>(
  query: () => Result,
  programStats: () => Readonly<Record<string, number>>,
  emit?: EmitReferenceTrace,
): Result {
  if (!emit) return query()
  const { result, timing } = traceCompilerQuery(() => {
    const startedAt = performance.now()
    try { emit("references.compiler-query.start", {}) }
    catch { /* Optional observation cannot prevent the authoritative query. */ }
    try {
      const value = withFindReferencesTrace(emit, query)
      try { emit("references.compiler-query.complete", { elapsedMs: performance.now() - startedAt }) }
      catch { /* Optional observation cannot change an exact result. */ }
      return value
    } catch (error) {
      if (error instanceof ts.OperationCanceledException) {
        try { emit("references.compiler-query.cancelled", { elapsedMs: performance.now() - startedAt }) }
        catch { /* Optional observation cannot change cancellation. */ }
      }
      throw error
    }
  }, true)
  try {
    // A failed optional observation must not turn an exact response into an error.
    const stats = programStats()
    const memory = process.memoryUsage()
    emit("semantic.references.complete", {
      durationMs: timing!.durationMs,
      createProgramMs: timing!.createProgramMs,
      createProgramEvents: timing!.createProgramEvents,
      otherReferenceMs: timing!.otherDefinitionMs,
      ...stats, rss: memory.rss, heapUsed: memory.heapUsed,
    })
  } catch {
    // The compiler query already completed; keep its authoritative result.
  }
  return result
}

/** Observe only the synchronous TypeScript call, before result mapping/checkpoints. */
export function traceTypeScriptFindReferences<Result>(query: () => Result): Result {
  const trace = activeFindReferencesTrace
  if (!trace) return query()
  const callIndex = ++trace.callIndex
  const startedAt = performance.now()
  try { trace.emit("references.find-references.start", { callIndex }) }
  catch { /* Optional observation cannot prevent the authoritative query. */ }
  try {
    const result = query()
    try { trace.emit("references.find-references.complete", {
      callIndex, elapsedMs: performance.now() - startedAt,
    }) } catch { /* Optional observation cannot change an exact result. */ }
    return result
  } catch (error) {
    try { trace.emit("references.find-references.throw", {
      callIndex, elapsedMs: performance.now() - startedAt,
      cancelled: error instanceof ts.OperationCanceledException,
    }) } catch { /* Optional observation cannot change the thrown error. */ }
    throw error
  }
}

function withFindReferencesTrace<Result>(emit: EmitReferenceTrace, query: () => Result): Result {
  const previous = activeFindReferencesTrace
  activeFindReferencesTrace = { emit, callIndex: 0 }
  try { return query() }
  finally { activeFindReferencesTrace = previous }
}
