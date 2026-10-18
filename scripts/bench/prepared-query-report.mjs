import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"

import { comparableLocations, normalizeReferences, validateLocations } from "./reference-location-oracle.mjs"
import { maxNullable, semanticAttributionEnabled } from "./reference-replay-evidence.mjs"
import { editCallKinds, validateEditCallPayload } from "./prepared-edit-call.mjs"

const latencyContract = JSON.parse(fs.readFileSync(new URL("../../config/semantic-release-matrix.json", import.meta.url))).latency

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
    missing, extra, duplicates, invalid, locations: actual, expectedLocations: expected.locations }
}

export function checkPreparedPayload(result, expected, sourceItem, context) {
  const invalid = result === undefined ? ["terminal result is missing"] : []
  let payload = result
  try {
    if (expected.kind === "completion") {
      if (typeof result?.isIncomplete !== "boolean" || !Array.isArray(result.items)) {
        throw new Error("terminal result is not a complete CompletionList payload")
      }
      payload = { ...result, items: result.items.map(canonicalPreparedCompletion) }
    } else if (expected.kind === "completionResolve") {
      if (!isDeepStrictEqual(result?.data, sourceItem?.data)) {
        throw new Error("completion resolve changed the source session handle")
      }
      payload = canonicalPreparedCompletion(result)
    }
    if (editCallKinds.includes(expected.kind)) validateEditCallPayload(expected.kind, payload, { ...context, sourceItem })
  } catch (error) { invalid.push(error.message) }
  return { equal: invalid.length === 0 && isDeepStrictEqual(payload, expected.result),
    payload: payload ?? null, expectedPayload: expected.result, invalid }
}

export function canonicalPreparedCompletion(item) {
  const data = item?.data
  if (!data || Object.keys(data).length !== 1 || typeof data.arktsCompletionId !== "string"
    || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(data.arktsCompletionId)) {
    throw new Error("completion handle is not the validated opaque session UUID")
  }
  const { data: _sessionHandle, ...payload } = item
  return payload
}

export function summarizePreparedBuckets(suite, requests, readinessStatus = "READINESS_UNSUPPORTED") {
  const reason = { READY: "REQUEST_GENERATION_NOT_VERIFIED", DEGRADED: "SEMANTIC_INPUTS_UNAVAILABLE",
    UNPREPARED: "PROGRAM_NOT_PREPARED" }[readinessStatus] ?? readinessStatus
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
    const aboveAcceptanceMs = samples.filter(request => request.elapsedMs > latencyContract.p95MsMax
      || request.status !== "COMPLETE").length
    const p95 = percentile(latencies, .95)
    const ready = samples.length > 0 && samples.every(request => request.measurementState === "semantic-ready-snapshot"
      && request.readiness?.verified === true)
    const postReady = samples.some(request => request.readiness !== undefined)
    return { ...group, measurementState: ready ? "semantic-ready-snapshot"
      : postReady ? "post-semantic-ready-unverified" : "candidate-ready-control", samples: samples.length,
      readyStatus: postReady && failures ? "FAIL" : ready ? "PASS" : "BLOCKED",
      unexecutedSamples: group.plannedSamples - samples.length, failures,
      timeoutCount: samples.filter(request => request.status === "TIMEOUT").length,
      above500Ms, above500Ratio: samples.length ? above500Ms / samples.length : null,
      aboveAcceptanceMs, aboveAcceptanceRatio: samples.length ? aboveAcceptanceMs / samples.length : null,
      latencyTargetMs: latencyContract.targetMs, latencyCeilingMs: latencyContract.p95MsMax,
      latencyMs: { p50: percentile(latencies, .5), p95,
        p99: percentile(latencies, .99), max: latencies.at(-1) ?? null },
      gateStatus: "BLOCKED", reason: postReady && failures ? "EXACT_QUERY_FAILED" : ready ? semanticAttributionEnabled(suite.runtime.env)
        ? "ATTRIBUTION_ONLY" : samples.length < 100 ? "INSUFFICIENT_RELEASE_REQUESTS" : "INSUFFICIENT_RELEASE_SESSIONS" : reason,
      controlStatus: failures || p95 > latencyContract.p95MsMax ? "FAIL"
        : samples.length !== group.plannedSamples || samples.length < 10 ? "BLOCKED" : "PASS",
    }
  })
}

export function preparedMemory(samples, targetPid, sampleIntervalMs, samplerStderr) {
  const monotonic = samples.some(sample => Object.hasOwn(sample, "monotonicMs"))
  const clock = monotonic ? "monotonicMs" : "timestamp"
  const gaps = samples.slice(1).map((sample, index) => sample[clock] - samples[index][clock]).sort((a, b) => a - b)
  return { measurementKind: "external-process-tree-rss", platform: process.platform,
    ...(monotonic ? { intervalClock: "sampler-monotonic-ms" } : {}),
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

export function archivePreparedSamples(reportFile, samplesFile) {
  if (!fs.existsSync(samplesFile)) return undefined
  const bytes = fs.readFileSync(samplesFile)
  const file = `${reportFile}.rss.jsonl`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, bytes, { flag: "wx" })
  return { file: path.basename(file), sha256: createHash("sha256").update(bytes).digest("hex"),
    byteLength: bytes.byteLength }
}

function percentile(sorted, ratio) {
  return sorted.length ? sorted[Math.ceil(sorted.length * ratio) - 1] : null
}
