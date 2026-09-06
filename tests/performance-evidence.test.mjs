import assert from "node:assert/strict"
import test from "node:test"

import { evaluatePerformanceEvidence } from "./support/performance-evidence.mjs"

test("retains bounded raw runs and computes nearest-rank percentiles", () => {
  const evidence = evaluatePerformanceEvidence({
    metric: "warm-definition-latency-ms",
    candidate: measuredSeries("candidate", [9, 1, 5, 3, 7, 2, 10, 6, 8, 4]),
    baseline: measuredSeries("baseline", [18, 11, 15, 13, 17, 12, 20, 16, 19, 14]),
    gate: { percentile: "p95", absoluteMax: 12, relativeMax: 1.1 },
  })

  assert.deepEqual(evidence.candidate.runs, [
    { runId: "candidate-01", value: 9 },
    { runId: "candidate-02", value: 1 },
    { runId: "candidate-03", value: 5 },
    { runId: "candidate-04", value: 3 },
    { runId: "candidate-05", value: 7 },
    { runId: "candidate-06", value: 2 },
    { runId: "candidate-07", value: 10 },
    { runId: "candidate-08", value: 6 },
    { runId: "candidate-09", value: 8 },
    { runId: "candidate-10", value: 4 },
  ])
  assert.deepEqual(evidence.candidate.percentiles, { p50: 5, p95: 10, p99: 10 })
  assert.deepEqual(evidence.baseline.percentiles, { p50: 15, p95: 20, p99: 20 })
  assert.doesNotThrow(() => JSON.stringify(evidence))
})

test("uses ceil percentile ranks rather than interpolation", () => {
  const evidence = evaluatePerformanceEvidence({
    metric: "warm-definition-latency-ms",
    candidate: measuredSeries(
      "candidate",
      [20, 1, 19, 2, 18, 3, 17, 4, 16, 5, 15, 6, 14, 7, 13, 8, 12, 9, 11, 10],
    ),
    baseline: measuredSeries(
      "baseline",
      [40, 21, 39, 22, 38, 23, 37, 24, 36, 25, 35, 26, 34, 27, 33, 28, 32, 29, 31, 30],
    ),
    gate: { percentile: "p95", absoluteMax: 20, relativeMax: 1.1 },
  })

  assert.deepEqual(evidence.candidate.percentiles, { p50: 10, p95: 19, p99: 20 })
  assert.deepEqual(evidence.baseline.percentiles, { p50: 30, p95: 39, p99: 40 })
})

test("rejects a series whose raw run set exceeds the evidence bound", () => {
  const candidate = measuredSeries(
    "candidate",
    Array.from({ length: 101 }, (_, index) => index + 1),
  )

  assert.throws(
    () => evaluatePerformanceEvidence({
      metric: "warm-definition-latency-ms",
      candidate,
      baseline: measuredSeries("baseline", Array.from({ length: 10 }, (_, index) => index + 1)),
      gate: { percentile: "p95", absoluteMax: 250, relativeMax: 1.1 },
    }),
    /candidate runs must contain at most 100 entries/,
  )
})

test("records immutable fixture, artifact, and runner identities for both series", () => {
  const candidate = measuredSeries("candidate", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  const baseline = measuredSeries("baseline", [2, 3, 4, 5, 6, 7, 8, 9, 10, 11])

  const evidence = evaluatePerformanceEvidence({
    metric: "warm-definition-latency-ms",
    candidate,
    baseline,
    gate: { percentile: "p95", absoluteMax: 250, relativeMax: 1.1 },
  })

  assert.deepEqual(evidence.candidate.identity, candidate.identity)
  assert.deepEqual(evidence.baseline.identity, baseline.identity)
  assert.notStrictEqual(evidence.candidate.identity, candidate.identity)
  assert.notStrictEqual(evidence.baseline.identity, baseline.identity)
})

test("withholds a publishable verdict until ten independent candidate runs exist", () => {
  const evidence = evaluatePerformanceEvidence({
    metric: "warm-definition-latency-ms",
    candidate: measuredSeries("candidate", [1, 2, 3, 4, 5, 6, 7, 8, 9]),
    baseline: measuredSeries("baseline", [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
    gate: { percentile: "p95", absoluteMax: 250, relativeMax: 1.1 },
  })

  assert.deepEqual(evidence.evaluation, {
    publishable: false,
    verdict: null,
    reason: "candidate requires at least 10 independent runs",
  })
})

test("withholds a publishable verdict until ten independent baseline runs exist", () => {
  const evidence = evaluatePerformanceEvidence({
    metric: "warm-definition-latency-ms",
    candidate: measuredSeries("candidate", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    baseline: measuredSeries("baseline", [2, 3, 4, 5, 6, 7, 8, 9, 10]),
    gate: { percentile: "p95", absoluteMax: 250, relativeMax: 1.1 },
  })

  assert.deepEqual(evidence.evaluation, {
    publishable: false,
    verdict: null,
    reason: "baseline requires at least 10 independent runs",
  })
})

test("publishes a pass when both absolute and relative gates pass", () => {
  const evidence = evaluatePerformanceEvidence({
    metric: "warm-definition-latency-ms",
    candidate: measuredSeries("candidate", [9, 1, 5, 3, 7, 2, 10, 6, 8, 4]),
    baseline: measuredSeries("baseline", [18, 11, 15, 13, 17, 12, 20, 16, 19, 14]),
    gate: { percentile: "p95", absoluteMax: 12, relativeMax: 1.1 },
  })

  assert.deepEqual(evidence.evaluation, {
    publishable: true,
    verdict: "pass",
    absolute: { actual: 10, max: 12, passed: true },
    relative: { actualRatio: 0.5, maxRatio: 1.1, passed: true },
  })
})

test("publishes a failure when either the absolute or relative gate fails", () => {
  const candidate = measuredSeries("candidate", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  const absoluteFailure = evaluatePerformanceEvidence({
    metric: "warm-definition-latency-ms",
    candidate,
    baseline: measuredSeries("baseline", [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]),
    gate: { percentile: "p95", absoluteMax: 9, relativeMax: 1.1 },
  })
  const relativeFailure = evaluatePerformanceEvidence({
    metric: "warm-definition-latency-ms",
    candidate,
    baseline: measuredSeries("baseline", [1, 2, 3, 4, 5, 6, 7, 8, 9, 9]),
    gate: { percentile: "p95", absoluteMax: 12, relativeMax: 1.1 },
  })

  assert.equal(absoluteFailure.evaluation.verdict, "fail")
  assert.equal(absoluteFailure.evaluation.absolute.passed, false)
  assert.equal(absoluteFailure.evaluation.relative.passed, true)
  assert.equal(relativeFailure.evaluation.verdict, "fail")
  assert.equal(relativeFailure.evaluation.absolute.passed, true)
  assert.equal(relativeFailure.evaluation.relative.passed, false)
})

test("rejects duplicate run identities instead of publishing a verdict", () => {
  const candidate = measuredSeries("candidate", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  candidate.runs[9].runId = candidate.runs[0].runId

  assert.throws(
    () => evaluatePerformanceEvidence({
      metric: "warm-definition-latency-ms",
      candidate,
      baseline: measuredSeries("baseline", [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
      gate: { percentile: "p95", absoluteMax: 250, relativeMax: 1.1 },
    }),
    /candidate runId must be unique: candidate-01/,
  )
})

test("rejects malformed raw runs instead of emitting non-JSON performance evidence", () => {
  const cases = [
    {
      mutate: (series) => { series.runs[0] = null },
      error: /candidate run 1 must be an object/,
    },
    {
      mutate: (series) => { series.runs[0].runId = "" },
      error: /candidate run 1 runId must be a non-empty string of at most 128 characters/,
    },
    {
      mutate: (series) => { series.runs[0].runId = " " },
      error: /candidate run 1 runId must be a non-empty string of at most 128 characters/,
    },
    {
      mutate: (series) => { series.runs[0].runId = "x".repeat(129) },
      error: /candidate run 1 runId must be a non-empty string of at most 128 characters/,
    },
    {
      mutate: (series) => { series.runs[0].value = Number.NaN },
      error: /candidate run 1 value must be a finite non-negative number/,
    },
    {
      mutate: (series) => { series.runs[0].value = Number.POSITIVE_INFINITY },
      error: /candidate run 1 value must be a finite non-negative number/,
    },
    {
      mutate: (series) => { series.runs[0].value = -1 },
      error: /candidate run 1 value must be a finite non-negative number/,
    },
  ]

  for (const invalid of cases) {
    const candidate = measuredSeries("candidate", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    invalid.mutate(candidate)
    assert.throws(
      () => evaluatePerformanceEvidence({
        metric: "warm-definition-latency-ms",
        candidate,
        baseline: measuredSeries("baseline", [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
        gate: { percentile: "p95", absoluteMax: 250, relativeMax: 1.1 },
      }),
      invalid.error,
    )
  }
})

test("rejects an invalid metric identity instead of producing ambiguous evidence", () => {
  for (const metric of [undefined, "", " ", "x".repeat(129), { name: "latency" }]) {
    assert.throws(
      () => evaluatePerformanceEvidence({
        metric,
        candidate: measuredSeries("candidate", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
        baseline: measuredSeries("baseline", [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
        gate: { percentile: "p95", absoluteMax: 250, relativeMax: 1.1 },
      }),
      /metric must be a non-empty string of at most 128 characters/,
    )
  }

  const evidence = evaluatePerformanceEvidence({
    metric: "warm-definition-latency-ms",
    candidate: measuredSeries("candidate", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    baseline: measuredSeries("baseline", [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
    gate: { percentile: "p95", absoluteMax: 250, relativeMax: 1.1 },
  })
  assert.equal(evidence.metric, "warm-definition-latency-ms")
})

test("rejects malformed absolute and relative gates", () => {
  const invalidGates = [
    { gate: null, error: /gate must be an object/ },
    {
      gate: { percentile: "p90", absoluteMax: 250, relativeMax: 1.1 },
      error: /gate percentile must be one of p50, p95, p99/,
    },
    {
      gate: { percentile: "p95", absoluteMax: Number.NaN, relativeMax: 1.1 },
      error: /gate absoluteMax must be a finite non-negative number/,
    },
    {
      gate: { percentile: "p95", absoluteMax: -1, relativeMax: 1.1 },
      error: /gate absoluteMax must be a finite non-negative number/,
    },
    {
      gate: { percentile: "p95", absoluteMax: 250, relativeMax: Number.POSITIVE_INFINITY },
      error: /gate relativeMax must be a finite positive number/,
    },
    {
      gate: { percentile: "p95", absoluteMax: 250, relativeMax: 0 },
      error: /gate relativeMax must be a finite positive number/,
    },
  ]

  for (const { gate, error } of invalidGates) {
    assert.throws(
      () => evaluatePerformanceEvidence({
        metric: "warm-definition-latency-ms",
        candidate: measuredSeries("candidate", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
        baseline: measuredSeries("baseline", [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
        gate,
      }),
      error,
    )
  }

  const gate = { percentile: "p95", absoluteMax: 250, relativeMax: 1.1 }
  const evidence = evaluatePerformanceEvidence({
    metric: "warm-definition-latency-ms",
    candidate: measuredSeries("candidate", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    baseline: measuredSeries("baseline", [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
    gate,
  })
  assert.deepEqual(evidence.gate, gate)
  assert.notStrictEqual(evidence.gate, gate)
})

test("rejects relative comparisons across different fixture or runner identities", () => {
  const mismatches = [
    {
      mutate: (baseline) => { baseline.identity.fixture.sha256 = "e".repeat(64) },
      error: /baseline fixture identity must match candidate fixture identity/,
    },
    {
      mutate: (baseline) => { baseline.identity.runner.fingerprint = "e".repeat(64) },
      error: /baseline runner identity must match candidate runner identity/,
    },
  ]

  for (const mismatch of mismatches) {
    const candidate = measuredSeries("candidate", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const baseline = measuredSeries("baseline", [2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    mismatch.mutate(baseline)
    assert.throws(
      () => evaluatePerformanceEvidence({
        metric: "warm-definition-latency-ms",
        candidate,
        baseline,
        gate: { percentile: "p95", absoluteMax: 250, relativeMax: 1.1 },
      }),
      mismatch.error,
    )
  }
})

test("rejects a same-artifact baseline instead of manufacturing a comparison", () => {
  const candidate = measuredSeries("candidate", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  const baseline = measuredSeries("baseline", [2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  baseline.identity.artifact.sha256 = candidate.identity.artifact.sha256

  assert.throws(
    () => evaluatePerformanceEvidence({
      metric: "warm-definition-latency-ms",
      candidate,
      baseline,
      gate: { percentile: "p95", absoluteMax: 250, relativeMax: 1.1 },
    }),
    /baseline artifact digest must differ from candidate artifact digest/,
  )
})

test("rejects a summary-only fake baseline and recomputes statistics from raw runs", () => {
  const baseline = measuredSeries("baseline", [2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  delete baseline.runs
  baseline.percentiles = { p50: 1, p95: 1, p99: 1 }

  assert.throws(
    () => evaluatePerformanceEvidence({
      metric: "warm-definition-latency-ms",
      candidate: measuredSeries("candidate", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
      baseline,
      gate: { percentile: "p95", absoluteMax: 250, relativeMax: 1.1 },
    }),
    /baseline runs must be an array containing raw independent runs/,
  )
})

test("rejects missing or forgeable series identities", () => {
  const invalidIdentities = [
    {
      mutate: (identity) => { identity.fixture.id = "" },
      error: /candidate identity.fixture.id must be a non-empty string of at most 128 characters/,
    },
    {
      mutate: (identity) => { identity.fixture.sha256 = "not-a-digest" },
      error: /candidate identity.fixture.sha256 must be a lowercase SHA-256 digest/,
    },
    {
      mutate: (identity) => { identity.artifact.id = "x".repeat(129) },
      error: /candidate identity.artifact.id must be a non-empty string of at most 128 characters/,
    },
    {
      mutate: (identity) => { identity.artifact.sha256 = undefined },
      error: /candidate identity.artifact.sha256 must be a lowercase SHA-256 digest/,
    },
    {
      mutate: (identity) => { identity.runner.id = " " },
      error: /candidate identity.runner.id must be a non-empty string of at most 128 characters/,
    },
    {
      mutate: (identity) => { identity.runner.fingerprint = "D".repeat(64) },
      error: /candidate identity.runner.fingerprint must be a lowercase SHA-256 digest/,
    },
  ]

  for (const invalid of invalidIdentities) {
    const candidate = measuredSeries("candidate", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    invalid.mutate(candidate.identity)
    assert.throws(
      () => evaluatePerformanceEvidence({
        metric: "warm-definition-latency-ms",
        candidate,
        baseline: measuredSeries("baseline", [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
        gate: { percentile: "p95", absoluteMax: 250, relativeMax: 1.1 },
      }),
      invalid.error,
    )
  }
})

test("rejects a zero baseline percentile instead of serializing an infinite ratio", () => {
  assert.throws(
    () => evaluatePerformanceEvidence({
      metric: "warm-definition-latency-ms",
      candidate: measuredSeries("candidate", [0, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
      baseline: measuredSeries("baseline", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      gate: { percentile: "p95", absoluteMax: 250, relativeMax: 1.1 },
    }),
    /baseline p95 must be greater than zero for a relative gate/,
  )
})

test("rejects a relative ratio that overflows despite finite raw samples", () => {
  assert.throws(
    () => evaluatePerformanceEvidence({
      metric: "warm-definition-latency-ms",
      candidate: measuredSeries("candidate", Array(10).fill(Number.MAX_VALUE)),
      baseline: measuredSeries("baseline", Array(10).fill(Number.MIN_VALUE)),
      gate: {
        percentile: "p95",
        absoluteMax: Number.MAX_VALUE,
        relativeMax: Number.MAX_VALUE,
      },
    }),
    /candidate-to-baseline p95 ratio must be finite/,
  )
})

test("returns deeply immutable evidence detached from mutable inputs", () => {
  const candidate = measuredSeries("candidate", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  const evidence = evaluatePerformanceEvidence({
    metric: "warm-definition-latency-ms",
    candidate,
    baseline: measuredSeries("baseline", [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
    gate: { percentile: "p95", absoluteMax: 250, relativeMax: 1.1 },
  })

  assertDeeplyFrozen(evidence)
  assert.throws(() => { evidence.candidate.runs[0].value = 999 }, TypeError)
  candidate.runs[0].value = 999
  candidate.identity.fixture.id = "mutated"
  assert.equal(evidence.candidate.runs[0].value, 1)
  assert.equal(evidence.candidate.identity.fixture.id, "large-workspace-v1")
})

test("identifies the machine-readable performance evidence schema", () => {
  const evidence = evaluatePerformanceEvidence({
    metric: "warm-definition-latency-ms",
    candidate: measuredSeries("candidate", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    baseline: measuredSeries("baseline", [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
    gate: { percentile: "p95", absoluteMax: 250, relativeMax: 1.1 },
  })

  assert.equal(evidence.schema, "arkts-language-server.performance-evidence")
  assert.equal(evidence.schemaVersion, 1)
})

test("retains only bounded allowlisted evidence fields", () => {
  const candidate = measuredSeries("candidate", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  candidate.identity.runner.environment = { SECRET_TOKEN: "must-not-be-recorded" }
  candidate.runs[0].source = `PRIVATE_SOURCE-${"x".repeat(1_000)}`
  const evidence = evaluatePerformanceEvidence({
    metric: "warm-definition-latency-ms",
    candidate,
    baseline: measuredSeries("baseline", [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
    gate: {
      percentile: "p95",
      absoluteMax: 250,
      relativeMax: 1.1,
      environment: { SECRET_TOKEN: "must-not-be-recorded" },
    },
  })

  assert.deepEqual(evidence.gate, { percentile: "p95", absoluteMax: 250, relativeMax: 1.1 })
  assert.doesNotMatch(JSON.stringify(evidence), /SECRET_TOKEN|must-not-be-recorded|PRIVATE_SOURCE/)
})

function assertDeeplyFrozen(value) {
  if (value === null || typeof value !== "object") return
  assert.equal(Object.isFrozen(value), true)
  for (const child of Object.values(value)) assertDeeplyFrozen(child)
}

function measuredSeries(artifactId, values) {
  return {
    identity: {
      fixture: { id: "large-workspace-v1", sha256: "a".repeat(64) },
      artifact: { id: artifactId, sha256: artifactId === "candidate" ? "b".repeat(64) : "c".repeat(64) },
      runner: { id: "darwin-arm64-node20", fingerprint: "d".repeat(64) },
    },
    runs: values.map((value, index) => ({
      runId: `${artifactId}-${String(index + 1).padStart(2, "0")}`,
      value,
    })),
  }
}
