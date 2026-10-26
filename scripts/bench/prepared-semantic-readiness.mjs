import { performance } from "node:perf_hooks"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { projectRoot, sha256File } from "./reference-replay-input.mjs"

const capabilities = JSON.parse(fs.readFileSync(new URL("../../config/semantic-release-matrix.json", import.meta.url))).capabilities

/** Observe the public root contract, never target answers or a suite-owned timer. */
export async function observeSemanticReadiness(session, suite, prepare = true) {
  const timeoutMs = suite.runtime.timeoutMs
  const started = performance.now()
  const id = session.nextRequestId
  let semantic
  try {
    const response = await session.request("arkts/semanticReadiness",
      { rootUri: session.rootUri, prepare }, { timeoutMs })
    if (response.error?.code === -32601) {
      semantic = { status: "READINESS_UNSUPPORTED", reason: "NO_GENERATION_BOUND_PUBLIC_CONTRACT", observed: null }
    } else if (response.error) {
      semantic = { status: "READINESS_ERROR", reason: "PUBLIC_PREPARATION_FAILED", observed: null, error: response.error }
    } else if (response.result?.rootUri === session.rootUri
      && ["ready", "unprepared", "degraded", "partial"].includes(response.result.semanticState)
      && (response.result.semanticState !== "partial" || hasPartialInputs(response.result))
      && (response.result.semanticState !== "ready" || hasReadyProof(response.result, suite))) {
      semantic = { status: response.result.semanticState.toUpperCase(), reason: null, observed: response.result }
    } else {
      semantic = { status: "READINESS_INVALID", reason: "INVALID_PUBLIC_READINESS_REPORT", observed: response.result ?? null }
    }
  } catch (error) {
    const timeout = /Timed out waiting/u.test(error.message)
    if (timeout) session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
    semantic = { status: timeout ? "READINESS_TIMEOUT" : "READINESS_ERROR",
      reason: "PUBLIC_PREPARATION_FAILED", observed: null, error: { message: error.message } }
  }
  return { semantic, elapsedMs: performance.now() - started }
}

function hasPartialInputs(report) {
  const available = ["definition", "typeDefinition", "hover", "signatureHelp", "completion", "completionResolve"]
  const issues = report.inputIssues
  return report.semanticGeneration === null && report.inputIdentity === null && report.coverage === null
    && Array.isArray(report.readyCapabilities) && report.readyCapabilities.length === 0
    && isDeepStrictEqual(report.unavailableReasons, ["sdk-inputs-incomplete"])
    && Array.isArray(report.availableCapabilities) && report.availableCapabilities.length === available.length
    && available.every(capability => report.availableCapabilities.includes(capability))
    && Array.isArray(issues) && issues.length === 1 && issues[0]?.layer === "sdk"
    && (issues[0].reason === "module-not-found" && typeof issues[0].specifier === "string"
      || ["coverage-unproven", "declaration-not-found"].includes(issues[0].reason) && issues[0].specifier === undefined)
}

export function sameReadySnapshot(left, right) {
  return left?.semanticState === "ready" && right?.semanticState === "ready"
    && left.semanticGeneration === right.semanticGeneration
    && isDeepStrictEqual(left.inputIdentity, right.inputIdentity) && isDeepStrictEqual(left.coverage, right.coverage)
}

export function preparedOverlayDigest(overlays, versions) {
  const digest = text => createHash("sha256").update(text).digest("hex")
  const entries = [...overlays].map(([uri, text]) =>
    [path.resolve(fileURLToPath(uri)), versions.get(uri) ?? null, digest(text)])
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
  return digest(JSON.stringify(entries))
}

/** Bind only actual editor snapshots; a changed generation label alone is insufficient. */
export function queryReadySnapshotMatches(initial, validation, snapshot, overlays, versions) {
  if (validation.status !== "READY") return false
  const current = validation.observed
  if (snapshot === 0) return sameReadySnapshot(initial, current)
  return current.inputIdentity.overlaysSha256 === preparedOverlayDigest(overlays, versions)
    && (sameReadySnapshot(initial, current)
      || current.semanticGeneration !== initial.semanticGeneration && current.inputIdentity.sha256 !== initial.inputIdentity.sha256)
}

function hasReadyProof(report, suite) {
  const input = report.inputIdentity
  const coverage = report.coverage
  return input !== null && typeof input === "object" && coverage !== null && typeof coverage === "object"
    && ["sha256", "sourcesSha256", "overlaysSha256", "optionsSha256", "projectGraphSha256",
      "sdkSha256", "standardLibrarySha256"].every(key => typeof input[key] === "string" && /^[a-f0-9]{64}$/u.test(input[key]))
    && ["engineGeneration", "membershipRevision"].every(key => Number.isSafeInteger(input[key]) && input[key] >= 0)
    && input.canonicalRoot === fs.realpathSync(suite.workspace)
    && input.backend?.packageVersion === suite.pins.backendVersion
    && input.backend?.compilerSha256 === suite.pins.backendSha256
    && input.backend?.packageSha256 === sha256File(path.join(projectRoot, "node_modules/typescript/package.json"))
    && typeof report.semanticGeneration === "string"
    && /^[1-9][0-9]*:(?:0|[1-9][0-9]*):[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}:[a-f0-9]{64}$/u.test(report.semanticGeneration)
    && report.semanticGeneration.split(":").at(-1) === input.sha256
    && Array.isArray(report.readyCapabilities) && report.readyCapabilities.length === capabilities.length
    && capabilities.every(capability => report.readyCapabilities.includes(capability))
    && Array.isArray(report.unavailableReasons) && report.unavailableReasons.length === 0
    && report.unavailableInput === null && coverage.dependenciesComplete === true
    && ["projectSources", "sdkSources", "standardLibrarySources", "programSources"]
      .every(key => Number.isSafeInteger(coverage[key]) && coverage[key] > 0)
    && coverage.programSources >= Math.max(coverage.projectSources, coverage.sdkSources, coverage.standardLibrarySources)
}
