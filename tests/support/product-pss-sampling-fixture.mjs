import fs from "node:fs"
import { writeArtifact } from "./product-memory-fixture.mjs"
import { pssWorkflowFixture } from "./product-pss-workflow-fixture.mjs"

// Synthetic cadence/record fixture, not a native sampler or product measurement.
export function pssSamplingFixture(t) {
  const value = pssWorkflowFixture(t), { fixture, raw } = value
  const dense = [...raw.samples]
  for (const run of raw.workflow.runs) {
    const template = raw.samples.find(sample => sample.runId === run.id && sample.metric === "peakPssBytes")
    for (const offset of [41, 81]) {
      const sample = structuredClone(template), tick = run.startedMonotonicMs + offset
      Object.assign(sample, { timestamp: 100000 + tick, completedTimestamp: 100001 + tick,
        monotonicMs: tick, completedMonotonicMs: tick + 1 })
      dense.push(sample)
    }
  }
  raw.samples = dense.sort((left, right) => left.monotonicMs - right.monotonicMs)
  raw.sampling = { schemaVersion: 1, requestedIntervalMs: 50, error: null, perRun: [] }
  refreshSampling(fixture, raw)
  return value
}

export function refreshSampling(fixture, raw) {
  raw.sampling.perRun = raw.workflow.runs.map(run => {
    const samples = raw.samples.filter(sample => sample.runId === run.id)
    const gaps = samples.slice(1).map((sample, index) => sample.monotonicMs - samples[index].monotonicMs)
      .sort((left, right) => left - right)
    const percentile = fraction => gaps.length ? gaps[Math.ceil(gaps.length * fraction) - 1] : null
    return { runId: run.id, sampleCount: samples.length,
      firstMonotonicMs: samples[0]?.monotonicMs ?? null,
      lastCompletedMonotonicMs: samples.at(-1)?.completedMonotonicMs ?? null,
      headGapMs: samples.length ? samples[0].monotonicMs - run.startedMonotonicMs : null,
      tailGapMs: samples.length ? run.completedMonotonicMs - samples.at(-1).completedMonotonicMs : null,
      maximumReadDurationMs: samples.length
        ? Math.max(...samples.map(sample => sample.completedMonotonicMs - sample.monotonicMs)) : null,
      actualIntervalMs: { p50: percentile(.5), p95: percentile(.95), max: gaps.at(-1) ?? null },
    }
  })
  fixture.comparison.rawEvidence = writeArtifact(fixture.root, "native-pss.json", raw)
  fs.writeFileSync(fixture.comparisonPath, JSON.stringify(fixture.comparison))
  return fixture
}
