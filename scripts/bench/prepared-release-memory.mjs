import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"

/** Verify archived RSS observations; RSS alone never satisfies the PSS release contract. */
export function preparedMemoryEvidence(report, platform, reportFile, processes) {
  const memory = report.memory
  const fail = reason => ({ status: "FAIL", reasons: [reason] })
  if (memory?.measurementKind === "external-process-tree-rss-segments") {
    if (processes?.status !== "PASS") return fail(processes?.reasons[0] ?? "MEMORY_PROCESS_SEGMENTS_UNVERIFIED")
    if (memory.platform !== platform || memory.targetPid !== processes.segments[0].pid
      || memory.targetPidScope !== "report-session-identity-only" || memory.continuousCoverageClaim !== false) {
      return fail("MEMORY_PROCESS_SEGMENTS_INVALID")
    }
    if (processes.segments.some(segment => !Object.hasOwn(segment.report.memory, "rawSamples"))) {
      return fail("MEMORY_PROCESS_SEGMENT_RAW_ARTIFACT_REQUIRED")
    }
    const segments = processes.segments.map(segment => ({ processSegmentId: segment.id, targetPid: segment.pid,
      ...preparedMemoryEvidence(segment.report, platform, segment.file) }))
    const reasons = [...new Set(segments.flatMap(segment => segment.reasons))]
    if (segments.some(segment => segment.status !== "PASS")) return { status: "FAIL", reasons, segments }
    const sampledMaxProductRssBytes = Math.max(...segments.map(segment => segment.peakProductRssBytes))
    if (memory.sampledMaxProductRssBytes !== sampledMaxProductRssBytes) return fail("MEMORY_SUMMARY_MISMATCH")
    return { status: "PASS", reasons, measurementKind: memory.measurementKind, segments,
      sampleCount: segments.reduce((total, segment) => total + segment.sampleCount, 0),
      sampledMaxProductRssBytes, continuousCoverageClaim: false }
  }
  if (typeof memory?.samplerStderr === "string" && memory.samplerStderr.trim()) {
    return fail("MEMORY_SAMPLER_FAILED")
  }
  if (memory?.measurementKind === undefined && memory?.samples === undefined) {
    return { status: "NOT_RUN", reasons: [] }
  }
  if (memory?.measurementKind !== "external-process-tree-rss" || memory.platform !== platform
    || !Array.isArray(memory.samples) || memory.samples.length === 0
    || memory.sampleCount !== memory.samples.length) return fail("MEMORY_RAW_SAMPLES_INVALID")
  let rawArtifact
  if (Object.hasOwn(memory, "rawSamples")) {
    const artifact = memory.rawSamples
    if (!artifact || typeof artifact.file !== "string" || !/^[^/\\:\x00]+\.jsonl$/u.test(artifact.file)
      || typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(artifact.sha256)
      || !Number.isSafeInteger(artifact.byteLength) || artifact.byteLength <= 0 || !reportFile) {
      return fail("MEMORY_RAW_ARTIFACT_INVALID")
    }
    const file = path.resolve(path.dirname(reportFile), artifact.file)
    let bytes
    try { bytes = fs.readFileSync(file) }
    catch { return fail("MEMORY_RAW_ARTIFACT_MISSING") }
    if (bytes.byteLength !== artifact.byteLength
      || createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) {
      return fail("MEMORY_RAW_ARTIFACT_DIGEST_MISMATCH")
    }
    let samples
    if (!Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes)) return fail("MEMORY_RAW_ARTIFACT_CONTENT_INVALID")
    try { samples = bytes.toString("utf8").split(/\r?\n/u).filter(Boolean).map(JSON.parse) }
    catch { return fail("MEMORY_RAW_ARTIFACT_CONTENT_INVALID") }
    if (!isDeepStrictEqual(samples, memory.samples)) return fail("MEMORY_RAW_ARTIFACT_CONTENT_MISMATCH")
    rawArtifact = { file, sha256: artifact.sha256, byteLength: artifact.byteLength }
  }
  const monotonic = memory.intervalClock === "sampler-monotonic-ms"
  if (memory.intervalClock !== undefined && !monotonic
    || !monotonic && memory.samples.some(sample => sample != null && Object.hasOwn(sample, "monotonicMs"))) {
    return fail("MEMORY_RAW_SAMPLES_INVALID")
  }
  const clock = monotonic ? "monotonicMs" : "timestamp"
  const completed = memory.samples.some(sample => sample != null
    && (Object.hasOwn(sample, "completedTimestamp") || Object.hasOwn(sample, "completedMonotonicMs")))
  const finiteBytes = value => Number.isSafeInteger(value) && value >= 0
  let peakNodeRssBytes = 0, peakProductRssBytes = 0, peakSamplerRssBytes = 0
  let previousTimestamp = -Infinity
  for (const sample of memory.samples) {
    const tick = sample?.[clock]
    if (!Number.isSafeInteger(sample?.timestamp) || sample.timestamp < 0
      || typeof tick !== "number" || !Number.isFinite(tick) || tick < 0 || tick > Number.MAX_SAFE_INTEGER
      || tick <= previousTimestamp || !Array.isArray(sample.processes)
      || !finiteBytes(sample.totalRssBytes) || !finiteBytes(sample.samplerRssBytes)) {
      return fail("MEMORY_RAW_SAMPLES_INVALID")
    }
    previousTimestamp = tick
    if (completed && (!monotonic || !Number.isSafeInteger(sample.completedTimestamp)
      || sample.completedTimestamp < 0 || typeof sample.completedMonotonicMs !== "number"
      || !Number.isFinite(sample.completedMonotonicMs) || sample.completedMonotonicMs < sample.monotonicMs
      || sample.completedMonotonicMs > Number.MAX_SAFE_INTEGER)) {
      return fail("MEMORY_COMPLETION_INTERVAL_INVALID")
    }
    const pids = new Set()
    let totalRssBytes = 0, nodeRssBytes
    for (const process of sample.processes) {
      if (!Number.isSafeInteger(process?.pid) || process.pid <= 0 || pids.has(process.pid)
        || !finiteBytes(process.rssBytes)) return fail("MEMORY_PROCESS_ACCOUNTING_INVALID")
      pids.add(process.pid)
      totalRssBytes += process.rssBytes
      if (process.pid === memory.targetPid) nodeRssBytes = process.rssBytes
    }
    if (nodeRssBytes === undefined || !finiteBytes(totalRssBytes)
      || totalRssBytes !== sample.totalRssBytes) return fail("MEMORY_PROCESS_ACCOUNTING_INVALID")
    peakNodeRssBytes = Math.max(peakNodeRssBytes, nodeRssBytes)
    peakProductRssBytes = Math.max(peakProductRssBytes, totalRssBytes)
    peakSamplerRssBytes = Math.max(peakSamplerRssBytes, sample.samplerRssBytes)
  }
  const peaks = { peakNodeRssBytes, peakProductRssBytes, peakSamplerRssBytes }
  if (Object.entries(peaks).some(([key, value]) => memory[key] !== value)) {
    return fail("MEMORY_SUMMARY_MISMATCH")
  }
  const gaps = memory.samples.slice(1).map((sample, index) => sample[clock] - memory.samples[index][clock])
    .sort((left, right) => left - right)
  const percentile = fraction => gaps.length ? gaps[Math.ceil(gaps.length * fraction) - 1] : null
  const actualIntervalMs = { p50: percentile(.5), p95: percentile(.95), max: gaps.at(-1) ?? null }
  if (!Number.isSafeInteger(memory.requestedIntervalMs) || memory.requestedIntervalMs <= 0
    || !isDeepStrictEqual(memory.actualIntervalMs, actualIntervalMs)) {
    return fail("MEMORY_INTERVAL_SUMMARY_MISMATCH")
  }
  return { status: "PASS", reasons: ["RSS_NOT_PSS_RELEASE_EVIDENCE",
    ...(rawArtifact ? [] : ["MEMORY_RAW_ARTIFACT_NOT_BOUND"])],
    ...(rawArtifact ? { rawArtifact } : {}),
    ...(monotonic ? { intervalClock: memory.intervalClock } : {}),
    measurementKind: memory.measurementKind, sampleCount: memory.samples.length, actualIntervalMs, ...peaks }
}
