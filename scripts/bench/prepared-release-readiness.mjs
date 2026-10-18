import path from "node:path"
import { pathToFileURL } from "node:url"
import { isDeepStrictEqual } from "node:util"

import { sameReadySnapshot } from "./prepared-semantic-readiness.mjs"

/** Recheck archived public proofs; never promote a standalone verified/PASS label. */
export function preparedRequestReady(report, request, capabilities, processes) {
  if (report.processSegments !== undefined || request.processSegmentId !== undefined) {
    if (processes?.status !== "PASS") return false
    const segment = processes.segments.find(segment => segment.id === request.processSegmentId)
    const canonical = segment?.report.requests.find(item => item.scenarioId === request.scenarioId)
    const { processSegmentId: _segment, ...measured } = request
    return canonical !== undefined && isDeepStrictEqual(measured, canonical)
      && preparedRequestReady(segment.report, canonical, capabilities)
  }
  const initial = report.readiness?.semantic
  const final = report.readiness?.validation
  const receipt = request.readiness
  const identity = report.inputIdentity
  if (initial?.status !== "READY" || final?.status !== "READY"
    || report.gateStatus?.ready !== "PASS" || report.gateStatus?.diagnostics !== "PASS"
    || report.preparation?.targetQueries !== 0 || report.failure != null
    || identity?.inputUnchanged !== true || !identity.postflightPins
    || !Object.entries(identity.postflightPins).every(([key, value]) => isDeepStrictEqual(identity[key], value))
    || request.measurementState !== "semantic-ready-snapshot" || receipt?.verified !== true
    || !Number.isSafeInteger(receipt.snapshot) || receipt.snapshot < 0
    || receipt.originGeneration !== initial.observed?.semanticGeneration
    || receipt.originInputSha256 !== initial.observed?.inputIdentity?.sha256
    || !validPreparedReadyProof(initial.observed, report, capabilities)
    || !validPreparedReadyProof(receipt.observed, report, capabilities)
    || !validPreparedReadyProof(final.observed, report, capabilities)
    || !currentFollowupSource(report, request, capabilities)
    || !matchesQuerySnapshot(initial.observed, receipt)
    || !sameReadySnapshot(report.requests.at(-1)?.readiness?.observed, final.observed)) return false
  const validations = report.timeline.filter(event => event.scenarioId === request.scenarioId
    && event.phase === "semantic-readiness-query-validation-complete")
  return validations.length === 1 && validations[0].status === "READY" && validations[0].current === true
}

function currentFollowupSource(report, request, capabilities) {
  const completion = request.kind === "completionResolve"
  if (!completion && !["incomingCalls", "outgoingCalls"].includes(request.kind)) return true
  const target = report.targetPool.find(target => target.id === request.targetId)
  const targetId = completion ? target?.completionTargetId : target?.callHierarchyTargetId
  const declared = completion ? request.completionSourceTargetId : request.callHierarchySourceTargetId
  const index = report.requests.findIndex(item => item.scenarioId === request.scenarioId)
  const candidates = report.requests.slice(0, Math.max(0, index))
    .filter(item => item.scenarioId === request.sourceScenarioId)
  const source = candidates.length === 1 ? candidates[0] : undefined
  return typeof targetId === "string" && declared === targetId && source?.targetId === targetId
    && source.kind === (completion ? "completion" : "prepareCallHierarchy")
    && source.status === "COMPLETE" && source.correctness?.equal === true
    && source.correctness.payload != null && source.correctness.expectedPayload != null
    && isDeepStrictEqual(source.correctness.payload, source.correctness.expectedPayload)
    && source.documentVersion === request.documentVersion && source.readiness?.snapshot === request.readiness?.snapshot
    && preparedRequestReady(report, source, capabilities)
}

function matchesQuerySnapshot(initial, receipt) {
  const current = receipt.observed
  if (receipt.snapshot === 0) return sameReadySnapshot(initial, current)
  return /^[a-f0-9]{64}$/u.test(receipt.expectedOverlaysSha256)
    && receipt.expectedOverlaysSha256 === current.inputIdentity.overlaysSha256
    && current.inputIdentity.canonicalRoot === initial.inputIdentity.canonicalRoot
    && (sameReadySnapshot(initial, current) || current.semanticGeneration !== initial.semanticGeneration
      && current.inputIdentity.sha256 !== initial.inputIdentity.sha256)
}

export function validPreparedReadyProof(proof, report, capabilities) {
  const input = proof?.inputIdentity
  const coverage = proof?.coverage
  const workspace = report.environment.workspace
  const windows = /^Windows_NT\b/u.test(report.environment.platform)
  const paths = windows ? path.win32 : path.posix
  const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value)
  return typeof workspace === "string" && paths.isAbsolute(workspace)
    && proof?.rootUri === pathToFileURL(workspace, { windows }).href && proof.semanticState === "ready"
    && typeof input?.canonicalRoot === "string" && paths.isAbsolute(input.canonicalRoot)
    && ["sha256", "sourcesSha256", "overlaysSha256", "optionsSha256", "projectGraphSha256",
      "sdkSha256", "standardLibrarySha256"].every(key => hash(input[key]))
    && ["engineGeneration", "membershipRevision"].every(key => Number.isSafeInteger(input[key]) && input[key] >= 0)
    && typeof input.backend?.packageVersion === "string" && input.backend.packageVersion.length > 0
    && hash(input.backend?.compilerSha256)
    && input.backend?.packageVersion === report.inputIdentity.backendVersion
    && input.backend?.compilerSha256 === report.inputIdentity.backendSha256
    && hash(input.backend?.packageSha256)
    && typeof proof.semanticGeneration === "string"
    && /^[1-9][0-9]*:(?:0|[1-9][0-9]*):[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}:[a-f0-9]{64}$/u.test(proof.semanticGeneration)
    && proof.semanticGeneration.split(":").at(-1) === input.sha256
    && Array.isArray(proof.readyCapabilities) && proof.readyCapabilities.length === capabilities.length
    && capabilities.every(capability => proof.readyCapabilities.includes(capability))
    && Array.isArray(proof.unavailableReasons) && proof.unavailableReasons.length === 0 && proof.unavailableInput === null
    && coverage?.dependenciesComplete === true
    && ["projectSources", "sdkSources", "standardLibrarySources", "programSources"]
      .every(key => Number.isSafeInteger(coverage[key]) && coverage[key] > 0)
    && coverage.programSources >= Math.max(coverage.projectSources, coverage.sdkSources, coverage.standardLibrarySources)
}
