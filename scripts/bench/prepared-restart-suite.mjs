import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { performance } from "node:perf_hooks"

import { createRestartControl } from "./prepared-restart-control.mjs"
import { summarizePreparedBuckets, writePreparedReport } from "./prepared-query-report.mjs"
import { beginsPreparedRestart } from "./prepared-suite-input.mjs"

const restart = "restart-after-validated-ready"
const sha = bytes => createHash("sha256").update(bytes).digest("hex")

/** Consecutive restart measurements share one new process, including declared source-item queries. */
export async function captureRestartSuite(options, suite, temporary, capture) {
  const groups = []
  let start = 0
  for (let index = 0; index < suite.scenarios.length; index++) {
    if (beginsPreparedRestart(suite.scenarios, index)) {
      groups.push(suite.scenarios.slice(start, index))
      start = index
    }
  }
  groups.push(suite.scenarios.slice(start))
  const state = { documents: [], queryOracles: [] }
  const segments = []
  const started = performance.now()
  let failure = null
  for (const [index, scenarios] of groups.entries()) {
    const previous = segments.at(-1)
    if (previous && (previous.report.readiness.handoff?.status !== "READY"
      || previous.report.closeResult?.exit?.code !== 0 || previous.report.closeResult.exit.signal !== null
      || !pidAbsent(previous.pid))) {
      failure = { message: "RESTART_PREDECESSOR_NOT_VERIFIED", processSegmentId: previous.id }
      break
    }
    const id = `process-${index}`
    const directory = path.join(temporary, id)
    fs.mkdirSync(directory)
    const reportFile = `${options.out}.${id}.json`
    const control = createRestartControl(state, scenarios.filter(item => item.bucket === restart).map(item => item.id))
    const offsetMs = performance.now() - started
    let report
    try { report = await capture({ ...options, out: reportFile }, { ...suite, scenarios }, directory, control) }
    catch (error) { failure = { message: error.message, processSegmentId: id }; break }
    const bytes = fs.readFileSync(reportFile)
    const pid = report.memory.targetPid
    segments.push({ id, pid, offsetMs, report, reportArtifact: {
      file: path.basename(reportFile), sha256: sha(bytes), byteLength: bytes.byteLength } })
    if (previous && (pid === previous.pid || !["UNPREPARED", "READY"].includes(report.readiness.initial?.status)
      || report.readiness.semantic.observed?.semanticGeneration?.split(":")[2]
        === previous.report.readiness.handoff.observed?.semanticGeneration?.split(":")[2])) {
      failure = { message: "RESTART_FRESH_PROCESS_NOT_VERIFIED", processSegmentId: id }
      break
    }
    if (report.failure) { failure = report.failure; break }
    if (report.closeResult?.exit?.code !== 0 || report.closeResult.exit.signal !== null || !pidAbsent(pid)) {
      failure = { message: "RESTART_PROCESS_EXIT_NOT_VERIFIED", processSegmentId: id }
      break
    }
  }
  if (!segments.length) throw new Error(failure?.message ?? "RESTART_NO_PROCESS_EVIDENCE")
  const last = segments.at(-1).report
  const requests = segments.flatMap(segment => segment.report.requests.map(request => ({
    ...request, processSegmentId: segment.id })))
  const unexecuted = suite.scenarios.filter(scenario => !requests.some(request => request.scenarioId === scenario.id))
  const blockedScenarios = [...segments.flatMap(segment => segment.report.blockedScenarios),
    ...unexecuted.filter(scenario => !segments.some(segment => segment.report.blockedScenarios
      .some(blocked => blocked.id === scenario.id))).map(scenario => ({ id: scenario.id,
      reason: failure?.message ?? "RESTART_SCENARIO_NOT_EXECUTED" }))]
  const stable = segments.every(segment => segment.report.inputIdentity.inputUnchanged)
  const complete = !failure && !blockedScenarios.length && requests.length === suite.scenarios.length
  const measured = segments.filter(segment => segment.report.requests.length > 0)
  const exact = complete && stable && measured.every(segment => segment.report.correctness.status === "PASS")
  const ready = exact && measured.every(segment => segment.report.gateStatus.ready === "PASS")
  const memorySegments = segments.map(segment => ({ ...segment.report.memory, processSegmentId: segment.id }))
  const report = {
    ...last, status: "FAIL", failure,
    inputIdentity: { ...last.inputIdentity, inputUnchanged: stable },
    requests, blockedScenarios,
    preparation: { measurementState: "sequential-process-preparation", targetQueries: 0,
      segments: segments.map(segment => ({ processSegmentId: segment.id, ...segment.report.preparation })) },
    processSegments: segments.map(segment => ({ id: segment.id, pid: segment.pid,
      reportArtifact: segment.reportArtifact, readiness: segment.report.readiness,
      preparation: segment.report.preparation, closeResult: segment.report.closeResult,
      requestIds: segment.report.requests.map(request => request.scenarioId) })),
    memory: { measurementKind: "external-process-tree-rss-segments", platform: process.platform,
      targetPid: segments[0].pid, targetPidScope: "report-session-identity-only",
      segments: memorySegments, sampledMaxProductRssBytes: Math.max(...memorySegments
        .map(memory => memory.peakProductRssBytes ?? 0)), continuousCoverageClaim: false },
    correctness: { plannedRequests: suite.scenarios.length, executedRequests: requests.length,
      status: exact ? "PASS" : requests.length || failure ? "FAIL" : "NOT_RUN" },
    gateStatus: { ...last.gateStatus, ready: ready ? "PASS" : exact ? "BLOCKED" : "FAIL",
      lifecycle: "NOT_RUN", memory: "BLOCKED", latency: "BLOCKED" },
    bucketSummaries: summarizePreparedBuckets(suite, requests, ready ? "READY" : last.readiness.semantic.status),
    timeline: segments.flatMap(segment => segment.report.timeline.map(event => ({ ...event,
      processSegmentId: segment.id, segmentMonotonicMs: event.monotonicMs,
      monotonicMs: segment.offsetMs + event.monotonicMs }))),
    diagnostics: segments.flatMap(segment => segment.report.diagnostics.map(event => ({
      ...event, processSegmentId: segment.id }))),
  }
  writePreparedReport(options.out, report)
  return report
}

function pidAbsent(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return false }
  catch (error) { return error.code === "ESRCH" }
}
