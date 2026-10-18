import { isDeepStrictEqual } from "node:util"

/** Recompute declared full-window cadence accounting; continuous peaks remain unverified. */
export function productPssSamplingBinding(sampling, workflow, samples) {
  if (sampling === undefined) return { status: "NOT_VERIFIED" }
  const fail = error => ({ status: "FAIL", reason: "PRODUCT_MEMORY_SAMPLING_BINDING_INVALID", error })
  if (sampling?.error != null) return { ...fail("original sampler failed"), samplingError: sampling.error }
  if (sampling?.schemaVersion !== 1 || !Number.isSafeInteger(sampling.requestedIntervalMs)
    || sampling.requestedIntervalMs <= 0 || sampling.error !== null || !Array.isArray(sampling.perRun)) {
    return fail("sampling header/error invalid")
  }
  const expected = new Map(workflow.runs.map(run => [run.id, run]))
  const declared = new Map(), grouped = new Map()
  for (const row of sampling.perRun) {
    if (!expected.has(row?.runId) || declared.has(row.runId)) return fail("unknown or duplicated cadence row")
    declared.set(row.runId, row)
  }
  for (const sample of samples) {
    const rows = grouped.get(sample.runId) ?? []
    rows.push(sample)
    grouped.set(sample.runId, rows)
  }
  const runs = [], incompleteRuns = [], missingRuns = [], gapsExceedRequest = []
  for (const [id, run] of expected) {
    if (!declared.has(id)) { missingRuns.push(id); continue }
    const rows = grouped.get(id) ?? []
    const gaps = rows.slice(1).map((sample, index) => sample.monotonicMs - rows[index].monotonicMs)
      .sort((left, right) => left - right)
    const percentile = fraction => gaps.length ? gaps[Math.ceil(gaps.length * fraction) - 1] : null
    let maximumReadDurationMs = null
    for (const row of rows) maximumReadDurationMs = Math.max(maximumReadDurationMs ?? 0,
      row.completedMonotonicMs - row.monotonicMs)
    const actual = { runId: id, sampleCount: rows.length,
      firstMonotonicMs: rows[0]?.monotonicMs ?? null,
      lastCompletedMonotonicMs: rows.at(-1)?.completedMonotonicMs ?? null,
      headGapMs: rows.length ? rows[0].monotonicMs - run.startedMonotonicMs : null,
      tailGapMs: rows.length ? run.completedMonotonicMs - rows.at(-1).completedMonotonicMs : null,
      maximumReadDurationMs,
      actualIntervalMs: { p50: percentile(.5), p95: percentile(.95), max: gaps.at(-1) ?? null } }
    if (!isDeepStrictEqual(actual, declared.get(id))) return fail(`cadence summary differs for ${id}`)
    runs.push(actual)
    if (rows.length < 2 || actual.headGapMs > sampling.requestedIntervalMs
      || actual.tailGapMs > sampling.requestedIntervalMs) incompleteRuns.push(id)
    if (actual.actualIntervalMs.max > sampling.requestedIntervalMs) gapsExceedRequest.push(id)
  }
  return { status: missingRuns.length || incompleteRuns.length ? "NOT_VERIFIED" : "PASS",
    qualification: "DECLARED_RUN_WINDOW_GAP_ACCOUNTING_ONLY", requestedIntervalMs: sampling.requestedIntervalMs,
    runs, missingRuns, incompleteRuns, gapsExceedRequest, continuousPeakCoverage: "NOT_VERIFIED" }
}
