import fs from "node:fs"
import path from "node:path"

import { comparableLocations, normalizeReferences, validateLocations } from "./reference-location-oracle.mjs"
import { maxNullable } from "./reference-replay-evidence.mjs"

export function checkPreparedLocations(result, expected, workspace, overlays) {
  const invalid = []
  let normalized = []
  try {
    if (!Array.isArray(result)) throw new Error("terminal result is not a Location array")
    normalized = normalizeReferences(result)
  } catch (error) { invalid.push(error.message) }
  let actual = []
  try {
    actual = comparableLocations(normalized, workspace)
    invalid.push(...validateLocations(normalized, actual, expected, workspace, overlays).errors
      .filter(error => error !== "normalized Location set differs from oracle"))
  } catch (error) { invalid.push(error.message) }
  const key = location => JSON.stringify(location)
  const expectedKeys = new Set(expected.locations.map(key))
  const actualKeys = new Set(actual.map(key))
  const duplicates = actual.filter((location, index) => actual.findIndex(item => key(item) === key(location)) !== index)
  const missing = expected.locations.filter(location => !actualKeys.has(key(location)))
  const extra = actual.filter(location => !expectedKeys.has(key(location)))
  return { equal: invalid.length === 0 && missing.length === 0 && extra.length === 0 && duplicates.length === 0,
    missing, extra, duplicates, invalid, locations: actual }
}

export function summarizePreparedBuckets(suite, requests) {
  const groups = new Map()
  for (const scenario of suite.scenarios) {
    const kind = suite.targets.find(target => target.id === scenario.targetId).kind
    const key = `${kind}:${scenario.bucket}`
    const group = groups.get(key) ?? { kind, bucket: scenario.bucket, plannedSamples: 0 }
    group.plannedSamples++
    groups.set(key, group)
  }
  return [...groups.values()].map(group => {
    const samples = requests.filter(request => request.kind === group.kind && request.bucket === group.bucket)
    const latencies = samples.map(request => request.elapsedMs).sort((a, b) => a - b)
    const failures = samples.filter(request => request.status !== "COMPLETE" || !request.correctness.equal).length
    const above500Ms = samples.filter(request => request.elapsedMs > 500 || request.status !== "COMPLETE").length
    return { ...group, measurementState: "candidate-ready-control", samples: samples.length,
      unexecutedSamples: group.plannedSamples - samples.length, failures,
      timeoutCount: samples.filter(request => request.status === "TIMEOUT").length,
      above500Ms, above500Ratio: samples.length ? above500Ms / samples.length : null,
      latencyMs: { p50: percentile(latencies, .5), p95: percentile(latencies, .95),
        p99: percentile(latencies, .99), max: latencies.at(-1) ?? null },
      gateStatus: "BLOCKED", reason: "READINESS_UNSUPPORTED",
      controlStatus: failures || above500Ms ? "FAIL"
        : samples.length !== group.plannedSamples || samples.length < 10 ? "BLOCKED" : "PASS",
    }
  })
}

export function preparedMemory(samples, targetPid, sampleIntervalMs, samplerStderr) {
  const gaps = samples.slice(1).map((sample, index) => sample.timestamp - samples[index].timestamp).sort((a, b) => a - b)
  return { measurementKind: "external-process-tree-rss", platform: process.platform,
    requestedIntervalMs: sampleIntervalMs, actualIntervalMs: { p50: percentile(gaps, .5),
      p95: percentile(gaps, .95), max: gaps.at(-1) ?? null },
    sampleCount: samples.length, targetPid,
    peakNodeRssBytes: maxNullable(samples.flatMap(sample => sample.processes.filter(process => process.pid === targetPid)
      .map(process => process.rssBytes))),
    peakProductRssBytes: maxNullable(samples.map(sample => sample.totalRssBytes)),
    peakSamplerRssBytes: maxNullable(samples.map(sample => sample.samplerRssBytes)),
    samplerStderr, samples,
  }
}

export function writePreparedReport(file, report) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" })
}

function percentile(sorted, ratio) {
  return sorted.length ? sorted[Math.ceil(sorted.length * ratio) - 1] : null
}
