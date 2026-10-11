#!/usr/bin/env node

import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { preparedRequestReady } from "./prepared-release-readiness.mjs"

try {
  const options = parseOptions(process.argv.slice(2))
  const matrixBytes = fs.readFileSync(options.matrix)
  const matrix = JSON.parse(matrixBytes)
  if (matrix.schemaVersion !== 1 || matrix.stage !== "L08"
    || ![matrix.platforms, matrix.capabilities, matrix.buckets, matrix.gates,
      matrix.independentEnvironmentGates].every(values => Array.isArray(values)
      && values.length > 0 && values.every(value => typeof value === "string" && value)
      && new Set(values).size === values.length)) {
    throw new Error("L08_MATRIX_INVALID")
  }
  requireOriginalContract(matrix)
  const gates = Object.fromEntries(matrix.gates.map(gate => [gate, "NOT_RUN"]))
  const cells = matrix.platforms.flatMap(platform => matrix.capabilities.flatMap(capability =>
    matrix.buckets.map(bucket => ({ platform, capability, bucket,
      requests: 0, sessions: 0, evidence: [], gates: { ...gates } }))))
  const evidence = options.preparedReports.map(file => readPreparedEvidence(file))
  if (new Set(evidence.map(item => item.sha256)).size !== evidence.length) {
    throw new Error("L08_DUPLICATE_EVIDENCE")
  }
  for (const cell of cells) summarizeCell(cell, evidence, matrix)
  const statuses = cells.flatMap(cell => Object.values(cell.gates))
  const status = statuses.includes("FAIL") ? "FAIL"
    : evidence.length ? "BLOCKED" : "NOT_RUN"
  const report = {
    schema: "arkts-language-server.semantic-release-report", schemaVersion: 1,
    capturedAt: new Date().toISOString(), stage: "L08", status,
    releaseEligible: false,
    matrix: { path: path.resolve(options.matrix),
      sha256: createHash("sha256").update(matrixBytes).digest("hex"), contract: matrix },
    independentEnvironmentGates: Object.fromEntries(
      matrix.independentEnvironmentGates.map(gate => [gate, "NOT_RUN"])),
    retainedCapabilityRegression: "NOT_RUN",
    evidence: evidence.map(({ file, sha256, identity }) => ({ file, sha256, identity })), cells,
  }
  fs.mkdirSync(path.dirname(options.out), { recursive: true })
  fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" })
  process.stdout.write(`SEMANTIC_RELEASE_GATE=${report.status}\nREPORT=${options.out}\n`)
  process.exitCode = 1
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}

function parseOptions(args) {
  const values = new Map()
  const preparedReports = []
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (flag === "--prepared-report" && value) {
      preparedReports.push(path.resolve(value))
      continue
    }
    if (!["--matrix", "--out"].includes(flag) || !value || values.has(flag)) {
      throw new Error("usage: assert-semantic-release.mjs --matrix FILE [--prepared-report FILE ...] --out FILE")
    }
    values.set(flag, value)
  }
  if (values.size !== 2) throw new Error("L08_RELEASE_OPTIONS_REQUIRED")
  return { matrix: values.get("--matrix"), out: values.get("--out"), preparedReports }
}

function requireOriginalContract(matrix) {
  const required = {
    platforms: ["darwin", "linux", "win32"],
    capabilities: ["references:includeDeclaration=false", "references:includeDeclaration=true",
      "implementation", "definition", "typeDefinition", "hover", "signatureHelp",
      "completion", "completionResolve", "prepareRename", "rename",
      "prepareCallHierarchy", "incomingCalls", "outgoingCalls"],
    buckets: ["first-unseen-symbol", "first-unopened-module", "repeated-snapshot",
      "edit-body", "edit-reference", "edit-public-api", "after-eviction", "restart-after-validated-ready"],
    gates: ["correctness", "ready", "latency", "memory", "lifecycle", "portability"],
    independentEnvironmentGates: ["deveco-pss-comparison"],
  }
  if (Object.entries(required).some(([key, values]) => values.some(value => !matrix[key].includes(value)))
    || matrix.latency?.targetMs !== 500 || matrix.latency?.p95MsMax !== 550 || matrix.latency?.minimumRequests !== 100
    || matrix.latency?.minimumSessions !== 5 || matrix.reuseSoak?.minimumAlternatingCycles !== 100
    || matrix.memoryGates !== "config/memory-release-gates.json"
    || matrix.historicalReferences?.reproducePeakBytesAbove !== 3000000000
    || matrix.historicalReferences?.peakReductionMin !== 0.5
    || matrix.retainedCapabilityRegression !== "pnpm check:fast") {
    throw new Error("L08_MATRIX_CONTRACT_DRIFT")
  }
}

function readPreparedEvidence(file) {
  const bytes = fs.readFileSync(file)
  const report = JSON.parse(bytes)
  if (report.schema !== "arkts-language-server.prepared-query-report" || report.schemaVersion !== 1
    || !Array.isArray(report.requests) || !Array.isArray(report.targetPool)
    || !report.inputIdentity || !report.environment || !Array.isArray(report.timeline)) {
    throw new Error(`L08_PREPARED_REPORT_INVALID=${file}`)
  }
  const platform = /^Darwin\b/u.test(report.environment.platform) ? "darwin"
    : /^Linux\b/u.test(report.environment.platform) ? "linux"
      : /^Windows_NT\b/u.test(report.environment.platform) ? "win32" : null
  if (!platform) throw new Error(`L08_PLATFORM_UNKNOWN=${file}`)
  const { suiteDigest: _suite, benchmarkId: _benchmark, postflightPins: _post,
    inputUnchanged: _unchanged, ...pins } = report.inputIdentity
  const flags = Object.fromEntries(Object.entries(report.environment.effectiveArktsFlags ?? {})
    .filter(([name]) => !["ARKTS_MEMORY_METRICS_FILE", "ARKTS_LSP_LOG_DIR", "ARKTS_INDEX_CACHE_DIR"].includes(name)))
  const identity = { pins, platform: report.environment.platform,
    cpu: report.environment.cpu, ramBytes: report.environment.ramBytes,
    traceMode: report.environment.traceMode, flags }
  const firstStart = report.timeline.find(event => event.phase === "server-process-started")?.timestamp
  const session = JSON.stringify([report.environment.hostname, report.memory?.targetPid, firstStart])
  if (!Number.isSafeInteger(report.memory?.targetPid) || !Number.isFinite(firstStart)) {
    throw new Error(`L08_SESSION_IDENTITY_MISSING=${file}`)
  }
  return { file, sha256: createHash("sha256").update(bytes).digest("hex"),
    report, identity, identityKey: JSON.stringify(identity), session, platform }
}

function summarizeCell(cell, evidence, matrix) {
  const groups = new Map()
  for (const item of evidence.filter(item => item.platform === cell.platform)) {
    const samples = item.report.requests.filter(request => {
      const target = item.report.targetPool.find(target => target.id === request.targetId)
      const capability = request.kind === "references"
        ? `references:includeDeclaration=${target?.includeDeclaration}` : request.kind
      return capability === cell.capability && request.bucket === cell.bucket
    })
    if (!samples.length) continue
    const group = groups.get(item.identityKey) ?? { identity: item.identity,
      samples: [], sessions: new Set(), evidence: [], trustworthy: true, ready: true,
      attributionOnly: item.report.environment.traceMode !== "trace-off"
        || item.report.environment.effectiveArktsFlags?.ARKTS_REFERENCES_TRACE === "1" }
    group.samples.push(...samples)
    group.sessions.add(item.session)
    group.evidence.push(item.file)
    group.ready &&= samples.every(sample => preparedRequestReady(item.report, sample, matrix.capabilities))
    group.trustworthy &&= item.report.inputIdentity.inputUnchanged === true
      && item.report.closeResult?.exit?.code === 0 && item.report.correctness?.status === "PASS"
    groups.set(item.identityKey, group)
  }
  if (!groups.size) return
  cell.inputGroups = [...groups.values()].map(group => {
    const elapsed = group.samples.map(sample => sample.elapsedMs)
    if (elapsed.some(value => typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      throw new Error("L08_INVALID_REQUEST_LATENCY")
    }
    elapsed.sort((a, b) => a - b)
    const percentile = fraction => elapsed[Math.ceil(elapsed.length * fraction) - 1]
    const failures = group.samples.filter(sample => sample.status !== "COMPLETE"
      || sample.correctness?.equal !== true
      || ["missing", "extra", "duplicates", "invalid"].some(key =>
        sample.correctness[key] !== undefined && (!Array.isArray(sample.correctness[key])
          || sample.correctness[key].length > 0))).length
    return { identity: group.identity, requests: group.samples.length, sessions: group.sessions.size,
      evidence: group.evidence, failures, trustworthy: group.trustworthy, verifiedReady: group.ready,
      above500Ms: group.samples.filter(sample => sample.elapsedMs > matrix.latency.targetMs
        || sample.status !== "COMPLETE").length,
      aboveAcceptanceMs: group.samples.filter(sample => sample.elapsedMs > matrix.latency.p95MsMax
        || sample.status !== "COMPLETE").length,
      observedLatencyMs: { p50: percentile(.5), p95: percentile(.95),
        p99: percentile(.99), max: elapsed.at(-1) },
      measurementState: group.attributionOnly ? "attribution-only" : group.ready ? "semantic-ready-snapshot" : "candidate-ready-control",
      reasons: [...(group.ready ? [] : ["GENERATION_BOUND_READY_NOT_VERIFIED"]),
        ...(group.attributionOnly ? ["ATTRIBUTION_ONLY"] : []),
        ...(group.samples.length < matrix.latency.minimumRequests ? ["INSUFFICIENT_REQUESTS"] : []),
        ...(group.sessions.size < matrix.latency.minimumSessions ? ["INSUFFICIENT_SESSIONS"] : [])],
    }
  })
  cell.requests = cell.inputGroups.reduce((sum, group) => sum + group.requests, 0)
  cell.productRequests = cell.inputGroups.filter(group => group.measurementState !== "attribution-only")
    .reduce((sum, group) => sum + group.requests, 0)
  cell.attributionRequests = cell.requests - cell.productRequests
  cell.sessions = new Set([...groups.values()].flatMap(group => [...group.sessions])).size
  cell.evidence = cell.inputGroups.flatMap(group => group.evidence)
  const ready = cell.inputGroups.every(group => group.verifiedReady && group.trustworthy)
  const failed = cell.inputGroups.some(group => group.failures || !group.trustworthy)
  cell.measurementState = !cell.productRequests ? "attribution-only" : ready ? "semantic-ready-snapshot" : "candidate-ready-control"
  cell.gates.correctness = failed ? "FAIL" : ready ? "PASS" : "BLOCKED"
  cell.gates.ready = failed && ready ? "FAIL" : ready ? "PASS" : "BLOCKED"
  cell.gates.latency = !ready || cell.inputGroups.some(group => group.measurementState === "attribution-only"
    || group.requests < matrix.latency.minimumRequests || group.sessions < matrix.latency.minimumSessions)
    ? "BLOCKED" : failed || cell.inputGroups.some(group => group.observedLatencyMs.p95 > matrix.latency.p95MsMax) ? "FAIL" : "PASS"
  if (cell.inputGroups.length === 1 && cell.productRequests) {
    cell.observedLatencyMs = cell.inputGroups[0].observedLatencyMs
  }
}
