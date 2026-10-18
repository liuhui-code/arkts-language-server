import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { isDeepStrictEqual as equal } from "node:util"

import { validPreparedReadyProof } from "./prepared-release-readiness.mjs"

/** Read each canonical process report once; a root PASS label cannot bind another PID's proof. */
export function preparedProcessEvidence(report, reportFile, capabilities) {
  if (report.processSegments === undefined && report.memory?.measurementKind !== "external-process-tree-rss-segments") return null
  const fail = reason => ({ status: "FAIL", reasons: [reason], segments: [] })
  const entries = report.processSegments
  if (!Array.isArray(entries) || entries.length < 2 || !Array.isArray(report.memory?.segments)
    || entries.length !== report.memory.segments.length) return fail("PROCESS_SEGMENTS_INVALID")
  const segments = []
  const ids = new Set(), pids = new Set(), files = new Set(), generations = new Set()
  for (const entry of entries) {
    const artifact = entry?.reportArtifact
    if (typeof entry?.id !== "string" || !entry.id || ids.has(entry.id)
      || !Number.isSafeInteger(entry.pid) || entry.pid <= 0 || pids.has(entry.pid)
      || !artifact || typeof artifact.file !== "string" || !/^[^/\\:\x00]+\.json$/u.test(artifact.file)
      || files.has(artifact.file) || !/^[a-f0-9]{64}$/u.test(artifact.sha256 ?? "")
      || !Number.isSafeInteger(artifact.byteLength) || artifact.byteLength <= 0) return fail("PROCESS_SEGMENT_ARTIFACT_INVALID")
    ids.add(entry.id); pids.add(entry.pid); files.add(artifact.file)
    const file = path.resolve(path.dirname(reportFile), artifact.file)
    let bytes, canonical
    try { bytes = fs.readFileSync(file) }
    catch { return fail("PROCESS_SEGMENT_ARTIFACT_MISSING") }
    if (bytes.byteLength !== artifact.byteLength
      || createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) return fail("PROCESS_SEGMENT_ARTIFACT_DIGEST_MISMATCH")
    try {
      if (!Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes)) throw new Error("invalid UTF-8")
      canonical = JSON.parse(bytes)
    } catch { return fail("PROCESS_SEGMENT_ARTIFACT_CONTENT_INVALID") }
    if (canonical?.schema !== report.schema || canonical.schemaVersion !== report.schemaVersion
      || canonical.processSegments !== undefined || !Array.isArray(canonical.requests)
      || !Array.isArray(canonical.timeline) || canonical.memory?.measurementKind !== "external-process-tree-rss"
      || canonical.memory.targetPid !== entry.pid
      || !equal(canonical.inputIdentity, report.inputIdentity)
      || !equal(canonical.targetPool, report.targetPool) || !equal(canonical.environment, report.environment)) {
      return fail("PROCESS_SEGMENT_REPORT_IDENTITY_INVALID")
    }
    if (!equal(entry.readiness, canonical.readiness) || !equal(entry.preparation, canonical.preparation)
      || !equal(entry.closeResult, canonical.closeResult)
      || !equal(entry.requestIds, canonical.requests.map(request => request.scenarioId))) return fail("PROCESS_SEGMENT_BINDING_INVALID")
    if (canonical.closeResult?.exit?.code !== 0 || canonical.closeResult.exit.signal !== null
      || canonical.preparation?.targetQueries !== 0 || canonical.failure != null
      || !validInitialReadiness(canonical, capabilities)
      || canonical.readiness.initial.observed.rootUri !== canonical.readiness.semantic?.observed?.rootUri
      || !["semantic", "validation", "handoff"].every(key => canonical.readiness[key]?.status === "READY"
        && validPreparedReadyProof(canonical.readiness[key].observed, canonical, capabilities))) {
      return fail("PROCESS_SEGMENT_READINESS_INVALID")
    }
    const currentGenerations = new Set(["initial", "semantic", "validation", "handoff"]
      .filter(key => canonical.readiness[key]?.status === "READY")
      .map(key => canonical.readiness[key].observed.semanticGeneration.split(":")[2]))
    if ([...currentGenerations].some(generation => generations.has(generation))) return fail("PROCESS_SEGMENT_GENERATION_REUSED")
    for (const generation of currentGenerations) generations.add(generation)
    const start = canonical.timeline.find(event => event.phase === "server-process-started")
    if (start?.targetPid !== entry.pid || !Number.isFinite(start.timestamp)) return fail("PROCESS_SEGMENT_SESSION_INVALID")
    segments.push({ id: entry.id, pid: entry.pid, file, sha256: artifact.sha256, report: canonical,
      session: JSON.stringify([canonical.environment.hostname, entry.pid, start.timestamp]) })
  }
  const requests = segments.flatMap(segment => segment.report.requests.map(request => ({ ...request, processSegmentId: segment.id })))
  if (!equal(requests, report.requests) || new Set(requests.map(request => request.scenarioId)).size !== requests.length
    || !equal(report.readiness, segments.at(-1).report.readiness)
    || !equal(report.closeResult, segments.at(-1).report.closeResult)) return fail("PROCESS_SEGMENT_REQUEST_BINDING_INVALID")
  if (!equal(report.memory.segments, segments.map(segment => ({ ...segment.report.memory, processSegmentId: segment.id })))) {
    return fail("PROCESS_SEGMENT_MEMORY_BINDING_INVALID")
  }
  return { status: "PASS", reasons: [], segments }
}

function validInitialReadiness(report, capabilities) {
  const initial = report.readiness?.initial
  return initial?.status === "UNPREPARED" && initial.observed?.semanticState === "unprepared"
    || initial?.status === "READY" && validPreparedReadyProof(initial.observed, report, capabilities)
}

export function preparedRequestSession(item, request) {
  return item.processEvidence?.status === "PASS"
    ? item.processEvidence.segments.find(segment => segment.id === request.processSegmentId)?.session ?? item.session
    : item.session
}
