import fs from "node:fs"

// Synthetic receipts qualify the evidence consumer only, never product release.
const capabilities = JSON.parse(fs.readFileSync(
  new URL("../../config/semantic-release-matrix.json", import.meta.url))).capabilities

export function candidateReport() {
  const pins = { serverInputSha256: "a".repeat(64), serverSha256: "b".repeat(64),
    sdkDeclarationDigest: "c".repeat(64), workspaceFilesSha256: "d".repeat(64) }
  return {
    schema: "arkts-language-server.prepared-query-report", schemaVersion: 1,
    inputIdentity: { ...pins, postflightPins: pins, inputUnchanged: true },
    environment: { platform: "Darwin 25.6.0 x64", traceMode: "trace-off", effectiveArktsFlags: {} },
    readiness: { semantic: { status: "READINESS_UNSUPPORTED" } },
    targetPool: [{ id: "ref", kind: "references", includeDeclaration: true }],
    requests: [{ scenarioId: "new", targetId: "ref", kind: "references", bucket: "first-unseen-symbol",
      status: "COMPLETE", elapsedMs: 42, measurementState: "candidate-ready-control",
      correctness: { equal: true, missing: [], extra: [], duplicates: [], invalid: [] } }],
    correctness: { plannedRequests: 1, executedRequests: 1, status: "PASS" },
    memory: { targetPid: 321 }, timeline: [{ phase: "server-process-started", timestamp: 12345 }],
    closeResult: { exit: { code: 0, signal: null } },
  }
}

export function readyReport(session) {
  const input = candidateReport()
  input.environment = { ...input.environment, workspace: "/fixture", hostname: "fixture-host",
    cpu: "fixture-cpu", ramBytes: 8 * 1024 ** 3 }
  input.inputIdentity.backendVersion = "fixture"
  input.inputIdentity.backendSha256 = "a".repeat(64)
  input.inputIdentity.postflightPins = { ...input.inputIdentity.postflightPins,
    backendVersion: "fixture", backendSha256: "a".repeat(64) }
  const proof = { rootUri: "file:///fixture", semanticState: "ready",
    semanticGeneration: `1:0:12345678-1234-4123-8123-123456789abc:${"a".repeat(64)}`,
    readyCapabilities: capabilities, unavailableReasons: [], unavailableInput: null,
    inputIdentity: { canonicalRoot: "/fixture", engineGeneration: 1, membershipRevision: 0,
      ...Object.fromEntries(["sha256", "sourcesSha256", "overlaysSha256", "optionsSha256",
        "projectGraphSha256", "sdkSha256", "standardLibrarySha256"].map(key => [key, "a".repeat(64)])),
      backend: { packageVersion: "fixture", compilerSha256: "a".repeat(64), packageSha256: "b".repeat(64) } },
    coverage: { projectSources: 1, sdkSources: 1, standardLibrarySources: 1,
      programSources: 3, dependenciesComplete: true } }
  input.readiness = { semantic: { status: "READY", observed: proof },
    validation: { status: "READY", observed: proof } }
  input.gateStatus = { ready: "PASS", diagnostics: "PASS" }
  input.preparation = { targetQueries: 0 }
  input.memory.targetPid += session
  input.timeline[0].timestamp += session
  input.requests = Array.from({ length: 20 }, (_, index) => {
    const location = () => ({ file: `Query-${index}.ets`,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } })
    return { ...input.requests[0], scenarioId: `new-${index}`, targetId: `ref-${index}`,
      measurementState: "semantic-ready-snapshot", correctness: { ...input.requests[0].correctness,
        locations: [location()], expectedLocations: [location()] },
      readiness: { originGeneration: proof.semanticGeneration,
        originInputSha256: proof.inputIdentity.sha256, snapshot: 0, verified: true, observed: proof } }
  })
  input.targetPool = input.requests.map(request => ({ ...input.targetPool[0], id: request.targetId }))
  input.timeline.push(...input.requests.map(request => ({ scenarioId: request.scenarioId,
    phase: "semantic-readiness-query-validation-complete", status: "READY", current: true })))
  input.correctness = { plannedRequests: 20, executedRequests: 20, status: "PASS" }
  return input
}
