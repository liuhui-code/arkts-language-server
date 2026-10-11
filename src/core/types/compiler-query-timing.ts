import ts from "typescript"

type EmitReferenceTrace = (
  event: string, fields: Readonly<Record<string, number | boolean | null>>,
) => void

let activeFindReferencesTrace: { emit: EmitReferenceTrace; callIndex: number } | undefined
let activeImplementationTrace: { emit: EmitReferenceTrace; queryIndex: number } | undefined
let implementationQuerySequence = 0
let observedProgramBuildClock = 0
// Inner traced callbacks clear the collector; retain only their positive grouped build evidence.
let observedProgramBuildCostMs = 0

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
      if (programEvents.length > 0) {
        observedProgramBuildClock += 1
        observedProgramBuildCostMs += createProgramMs
      }
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
  rebuildCostMs?: number
} {
  const before = observedProgramBuildClock
  const costBefore = observedProgramBuildCostMs
  const { result } = traceCompilerQuery(query, true)
  const rebuildCostMs = observedProgramBuildCostMs - costBefore
  return { result, buildObserved: observedProgramBuildClock > before,
    ...(Number.isFinite(rebuildCostMs) && rebuildCostMs > 0 ? { rebuildCostMs } : {}) }
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

/** Observe a complete implementation callback without preparing another Program. */
export function traceImplementationQuery<Result extends readonly unknown[]>(
  query: () => Result,
  programStats: () => Readonly<Record<string, number>>,
  emit?: EmitReferenceTrace,
): Result {
  if (!emit) return query()
  const previous = activeImplementationTrace
  const trace = { emit, queryIndex: ++implementationQuerySequence }
  const { result, timing } = traceCompilerQuery(() => {
    activeImplementationTrace = trace
    try { return query() }
    finally { activeImplementationTrace = previous }
  }, true)
  try {
    const memory = process.memoryUsage()
    emit("semantic.implementation.complete", {
      ...timing!, ...programStats(), queryIndex: trace.queryIndex, implementations: result.length,
      rss: memory.rss, heapUsed: memory.heapUsed,
    })
  } catch {
    // Optional attribution cannot turn a complete result into a failure.
  }
  return result
}

/** Observe successful edit/call callbacks only, never prepare a Program for a rejected query. */
export function traceSemanticQuery<Result extends { readonly status: string }>(
  kind: string,
  query: () => Result,
  programStats: () => Readonly<Record<string, number>>,
  emit?: EmitReferenceTrace,
): Result {
  if (!emit) return query()
  const { result, timing } = traceCompilerQuery(query, true)
  if (result.status !== "ready" && result.status !== "complete") return result
  try {
    const memory = process.memoryUsage()
    emit(`semantic.${kind}.complete`, { ...timing!, ...programStats(),
      rss: memory.rss, heapUsed: memory.heapUsed })
  } catch {
    // Optional attribution cannot alter an authoritative result.
  }
  return result
}

/** The synchronous compiler call only: mapping cancellation is a separate boundary. */
export function traceTypeScriptImplementation<Result>(query: () => Result): Result {
  const trace = activeImplementationTrace
  if (!trace) return query()
  const startedAt = performance.now()
  const emit = (event: string, fields: Readonly<Record<string, number | boolean>>) => {
    try { trace.emit(event, { ...fields, queryIndex: trace.queryIndex }) }
    catch { /* Optional observation must not alter the compiler call. */ }
  }
  emit("implementations.compiler-call.start", {})
  try {
    const result = query()
    emit("implementations.compiler-call.complete", { elapsedMs: performance.now() - startedAt })
    return result
  } catch (error) {
    emit("implementations.compiler-call.throw", { elapsedMs: performance.now() - startedAt,
      cancelled: error instanceof ts.OperationCanceledException })
    throw error
  }
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
