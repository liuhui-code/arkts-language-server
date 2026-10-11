import path from "node:path"
import { readOwnDataRecord } from "./semantic-worker-record.js"
import { SEMANTIC_READY_CAPABILITIES } from "../contracts/semantic-readiness.js"

/** Validate the raw readiness boundary before generic JSON omission/cloning. */
export function assertSemanticReadinessResponse(value: unknown, invalid: () => Error,
  expectedRootUri: string | undefined, isCanonicalUri: (value: unknown) => boolean): void {
  const response = readOwnDataRecord(value,
    ["protocol", "epoch", "id", "appliedRevision", "documentVersion", "ok"], ["value", "error"], 8)
  if (!response || typeof response.ok !== "boolean" || response.documentVersion !== null) throw invalid()
  if (!response.ok) return
  const report = readOwnDataRecord(response.value,
    ["rootUri", "semanticState", "semanticGeneration", "readyCapabilities", "unavailableReasons",
      "unavailableInput", "inputIdentity", "coverage"], [], 8)
  if (!report) throw invalid()
  if (!expectedRootUri || !isCanonicalUri(expectedRootUri) || report.rootUri !== expectedRootUri) throw invalid()
  if (!["ready", "unprepared", "degraded"].includes(report.semanticState as string)) throw invalid()
  const capabilities = strings(report.readyCapabilities, SEMANTIC_READY_CAPABILITIES.length, invalid)
  const reasons = strings(report.unavailableReasons, 14, invalid)
  if (report.semanticState === "ready" && (!report.inputIdentity || typeof report.inputIdentity !== "object"
    || !report.coverage || typeof report.coverage !== "object"
    || typeof report.semanticGeneration !== "string" || report.semanticGeneration.length === 0
    || reasons.length !== 0 || report.unavailableInput !== null
    || capabilities.length !== SEMANTIC_READY_CAPABILITIES.length
    || SEMANTIC_READY_CAPABILITIES.some(capability => !capabilities.includes(capability)))) throw invalid()
  if (report.semanticState !== "ready" && (report.semanticGeneration !== null || report.inputIdentity !== null
    || report.coverage !== null || capabilities.length !== 0
    || (report.semanticState === "unprepared" && (reasons.length !== 0 || report.unavailableInput !== null))
    || (report.semanticState === "degraded" && reasons.length === 0))) throw invalid()
  if (report.semanticState === "ready") {
    const digest = assertIdentity(report.inputIdentity, invalid)
    assertCoverage(report.coverage, invalid)
    const generation = report.semanticGeneration as string
    if (generation.length > 135) throw invalid()
    const parts = generation.split(":")
    if (parts.length !== 4 || parts[0] !== String(response.epoch) || parts[1] !== String(response.appliedRevision)
      || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(parts[2]) || parts[3] !== digest) throw invalid()
  }
  if (report.unavailableInput !== null) assertDiagnostic(report.unavailableInput, invalid, isCanonicalUri)
}

function assertDiagnostic(value: unknown, invalid: () => Error, isCanonicalUri: (value: unknown) => boolean): void {
  const diagnostic = readOwnDataRecord(value, ["uri", "code", "message", "position"], [], 4)
  if (!diagnostic || (diagnostic.uri !== null && !isCanonicalUri(diagnostic.uri))
    || !counter(diagnostic.code) || diagnostic.code === 0
    || typeof diagnostic.message !== "string" || diagnostic.message.length === 0) throw invalid()
  if (diagnostic.position === null) return
  const position = readOwnDataRecord(diagnostic.position, ["line", "character"], [], 2)
  if (diagnostic.uri === null || !position || !counter(position.line) || !counter(position.character)) throw invalid()
}

function assertIdentity(value: unknown, invalid: () => Error): string {
  const hashes = ["sha256", "sourcesSha256", "overlaysSha256", "optionsSha256",
    "projectGraphSha256", "sdkSha256", "standardLibrarySha256"]
  const identity = readOwnDataRecord(value,
    [...hashes, "engineGeneration", "canonicalRoot", "membershipRevision", "backend"], [], 11)
  if (!identity || hashes.some(key => !hash(identity[key])) || !counter(identity.engineGeneration)
    || !counter(identity.membershipRevision) || typeof identity.canonicalRoot !== "string"
    || !path.isAbsolute(identity.canonicalRoot) || identity.canonicalRoot.includes("\0")) throw invalid()
  const backend = readOwnDataRecord(identity.backend, ["packageVersion", "compilerSha256", "packageSha256"], [], 3)
  if (!backend || typeof backend.packageVersion !== "string" || backend.packageVersion.length === 0
    || !hash(backend.compilerSha256) || !hash(backend.packageSha256)) throw invalid()
  return identity.sha256 as string
}

function assertCoverage(value: unknown, invalid: () => Error): void {
  const counts = ["projectSources", "sdkSources", "standardLibrarySources", "programSources"]
  const coverage = readOwnDataRecord(value, [...counts, "dependenciesComplete"], [], 5)
  if (!coverage || coverage.dependenciesComplete !== true
    || counts.some(key => !counter(coverage[key]) || (coverage[key] as number) === 0)) throw invalid()
  // Categories may overlap (e.g. an SDK inside the root), so do not sum them.
  if ((coverage.programSources as number) < Math.max(coverage.projectSources as number,
    coverage.sdkSources as number, coverage.standardLibrarySources as number)) throw invalid()
}

function hash(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value) }
function counter(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 }

function strings(value: unknown, max: number, invalid: () => Error): readonly string[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw invalid()
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value as unknown
    if (!Number.isSafeInteger(length) || (length as number) < 0 || (length as number) > max) throw invalid()
    const keys = Reflect.ownKeys(value)
    if (keys.length !== (length as number) + 1 || keys.some((key, index) =>
      index < (length as number) ? key !== String(index) : key !== "length")) throw invalid()
    return Array.from({ length: length as number }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (!descriptor?.enumerable || !("value" in descriptor)
        || typeof descriptor.value !== "string" || descriptor.value.length === 0) throw invalid()
      return descriptor.value as string
    })
  } catch { throw invalid() }
}
