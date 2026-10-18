import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { evaluateProductMemoryGates } from "./product-memory-gates.mjs"
import { productPssRecordObservation } from "./product-pss-records.mjs"
import { productPssSummaryBinding } from "./product-pss-statistics.mjs"
import { productPssWorkflowBinding } from "./product-pss-workflow-binding.mjs"
import { productPssSamplingBinding } from "./product-pss-sampling-binding.mjs"
import { semanticAttributionEnabled } from "./reference-replay-evidence.mjs"

const sha = bytes => createHash("sha256").update(bytes).digest("hex")
const gates = JSON.parse(fs.readFileSync(new URL("../../config/memory-release-gates.json", import.meta.url)))
const buildKeys = ["serverRevision", "serverInputSha256", "serverSha256", "sidecarSha256",
  "semanticWorkerSha256", "referenceVerifierWorkerSha256", "diagnosticVerifierWorkerSha256",
  "standardLibrarySha256", "backendVersion", "backendSha256", "nodeVersion",
  "lockfileSha256", "memoryGatesSha256", "sdkDeclarationDigest", "sdkMetadata"]
const selectedFlags = {
  ARKTS_REFERENCES_CONTEXT_RETENTION: "budget-aware", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
  ARKTS_L02_SAME_CONTENT_PROMOTION: "1", ARKTS_L01_PRESSURE_ADMISSION: "1",
  ARKTS_L03_COST_AWARE_EVICTION: "1", ARKTS_L01_TRANSIENT_DIAGNOSTICS: "1",
  ARKTS_MEMORY_BUDGET_MB: "1024", ARKTS_REFERENCES_STRATEGY: "indexed-batched",
  ARKTS_REFERENCES_SDK_AMBIENT_PROFILE: "full", ARKTS_REFERENCES_DEPENDENCY_PROFILE: "closure",
}

/** Original summary gates are necessary, never sufficient native PSS evidence. */
export function productMemoryComparisonEvidence(files, prepared) {
  const receipts = files.map(file => readComparison(file, prepared))
  if (new Set(receipts.map(receipt => receipt.sha256 ?? receipt.file)).size !== receipts.length) {
    throw new Error("L08_DUPLICATE_MEMORY_COMPARISON")
  }
  const status = !receipts.length ? "NOT_RUN" : receipts.some(receipt => receipt.status === "FAIL")
    ? "FAIL" : "BLOCKED"
  return { status, receipts }
}

function readComparison(file, prepared) {
  const result = { file, sha256: null, status: "FAIL", reasons: [] }
  try {
    const bytes = fs.readFileSync(file)
    result.sha256 = sha(bytes)
    const comparison = JSON.parse(bytes)
    if (comparison.schema !== "arkts-language-server.product-memory-comparison"
      || comparison.schemaVersion !== 1) throw new Error("PRODUCT_MEMORY_COMPARISON_SCHEMA_INVALID")
    const server = readArtifact(file, comparison.server)
    const deveco = readArtifact(file, comparison.deveco)
    const evaluated = evaluateProductMemoryGates(server.data, deveco.data, gates)
    result.summary = { status: evaluated.memory && evaluated.correctness ? "PASS" : "FAIL",
      memory: evaluated.memory ? "PASS" : "FAIL", correctness: evaluated.correctness ? "PASS" : "FAIL",
      server: server.artifact, deveco: deveco.artifact }
    if (result.summary.status === "FAIL") {
      return { ...result, reasons: ["PRODUCT_MEMORY_SUMMARY_GATE_FAILED"] }
    }
    if (comparison.platform !== "linux") {
      return { ...result, status: "BLOCKED", reasons: ["PRODUCT_MEMORY_PLATFORM_UNSUPPORTED"] }
    }
    const inputs = prepared.filter(item => item.platform === "linux")
    if (!inputs.length) {
      return { ...result, status: "BLOCKED", reasons: ["PRODUCT_MEMORY_QUERY_BUILD_MISSING"] }
    }
    if (inputs.some(item => item.identity.traceMode !== "trace-off"
      || semanticAttributionEnabled(item.identity.flags))) {
      return { ...result, status: "BLOCKED", reasons: ["PRODUCT_MEMORY_ATTRIBUTION_ONLY"] }
    }
    if (inputs.some(item => item.identity.pins.sdkDeclarationDigest
      !== server.data.comparisonIdentity.sdkDeclarationDigest)) {
      return { ...result, reasons: ["PRODUCT_MEMORY_SDK_MISMATCH"] }
    }
    const build = comparison.buildIdentity
    if (!build || buildKeys.some(key => build[key] === undefined)
      || buildKeys.filter(key => key.endsWith("Sha256") || key.endsWith("Digest"))
        .some(key => typeof build[key] !== "string" || !/^[a-f0-9]{64}$/u.test(build[key]))) {
      return { ...result, status: "BLOCKED", reasons: ["PRODUCT_MEMORY_BUILD_NOT_BOUND"] }
    }
    if (inputs.some(item => buildKeys.some(key => !isDeepStrictEqual(build[key], item.identity.pins[key])))) {
      return { ...result, status: "BLOCKED", reasons: ["PRODUCT_MEMORY_BUILD_MISMATCH"] }
    }
    if (inputs.some(item => !isDeepStrictEqual(comparison.flags, item.identity.flags))) {
      return { ...result, status: "BLOCKED", reasons: ["PRODUCT_MEMORY_CONFIGURATION_MISMATCH"] }
    }
    if (Object.entries(selectedFlags).some(([name, value]) => comparison.flags[name] !== undefined
      && comparison.flags[name] !== value)) {
      return { ...result, status: "BLOCKED", reasons: ["PRODUCT_MEMORY_POLICY_NOT_SELECTED"] }
    }
    result.reportedBuildMatch = inputs.length > 0
    if (comparison.rawEvidence !== undefined) {
      let statistics, workflowProof, samplingProof
      try {
        const raw = readArtifact(file, comparison.rawEvidence, 64 * 1024 ** 2)
        result.rawObservation = productPssRecordObservation(raw.data, raw.artifact)
        statistics = raw.data.statistics
        workflowProof = raw.data.workflow
        samplingProof = raw.data.sampling
      } catch (error) {
        return { ...result, reasons: ["PRODUCT_MEMORY_RAW_INVALID"],
          error: error instanceof Error ? error.message : String(error) }
      }
      for (const [product, summary] of [["server", server.data], ["deveco", deveco.data]]) {
        if (result.rawObservation.metricSamples[`${product}.peakPssBytes`]
          ?.some(bytes => bytes > summary.memory.peakPssBytes)) {
          return { ...result, reasons: ["PRODUCT_MEMORY_RAW_PEAK_EXCEEDS_SUMMARY"] }
        }
      }
      const binding = productPssSummaryBinding(statistics, result.rawObservation.metricSamples,
        { server: server.data.memory, deveco: deveco.data.memory })
      Object.assign(result.rawObservation, binding)
      if (binding.summaryBinding === "FAIL") return { ...result, reasons: [binding.summaryError] }
      if (binding.missingSummaryMetrics?.length) return { ...result, status: "BLOCKED",
        reasons: ["PRODUCT_MEMORY_STATISTICS_SAMPLES_INCOMPLETE"] }
      const workflowBinding = productPssWorkflowBinding(workflowProof, result.rawObservation.samples,
        server.data.comparisonIdentity, ref => readArtifact(file, ref))
      result.rawObservation.workflowBinding = workflowBinding
      if (workflowBinding.status === "FAIL") return { ...result, reasons: [workflowBinding.reason] }
      if (workflowProof !== undefined && workflowBinding.status !== "PASS") return { ...result,
        status: "BLOCKED", reasons: ["PRODUCT_MEMORY_WORKFLOW_BINDING_INCOMPLETE"] }
      if (samplingProof !== undefined && workflowBinding.status !== "PASS") return { ...result,
        status: "BLOCKED", reasons: ["PRODUCT_MEMORY_SAMPLING_WORKFLOW_NOT_BOUND"] }
      const samplingBinding = productPssSamplingBinding(samplingProof, workflowProof, result.rawObservation.samples)
      result.rawObservation.samplingBinding = samplingBinding
      if (samplingBinding.status === "FAIL") return { ...result, reasons: [samplingBinding.reason] }
      if (samplingProof !== undefined && samplingBinding.status !== "PASS") return { ...result,
        status: "BLOCKED", reasons: ["PRODUCT_MEMORY_SAMPLING_BINDING_INCOMPLETE"] }
      return { ...result, status: "BLOCKED", reasons: ["PRODUCT_MEMORY_RAW_SCOPE_NOT_VERIFIED"] }
    }
    return { ...result, status: "BLOCKED", reasons: ["PRODUCT_MEMORY_RAW_NOT_PROVIDED"] }
  } catch (error) {
    return { ...result, reasons: ["PRODUCT_MEMORY_COMPARISON_INVALID"],
      error: error instanceof Error ? error.message : String(error) }
  }
}

function readArtifact(comparisonFile, ref, maximumBytes = 1024 ** 2) {
  if (!ref || typeof ref.file !== "string" || !/^[^/\\:\x00]+\.json$/u.test(ref.file)
    || typeof ref.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(ref.sha256)
    || !Number.isSafeInteger(ref.byteLength) || ref.byteLength <= 0 || ref.byteLength > maximumBytes) {
    throw new Error("PRODUCT_MEMORY_ARTIFACT_INVALID")
  }
  const file = path.resolve(path.dirname(comparisonFile), ref.file)
  if (fs.statSync(file).size > maximumBytes) throw new Error("PRODUCT_MEMORY_ARTIFACT_TOO_LARGE")
  const bytes = fs.readFileSync(file)
  if (bytes.length !== ref.byteLength || sha(bytes) !== ref.sha256) {
    throw new Error("PRODUCT_MEMORY_ARTIFACT_DIGEST_MISMATCH")
  }
  if (!Buffer.from(bytes.toString("utf8")).equals(bytes)) throw new Error("PRODUCT_MEMORY_ARTIFACT_UTF8_INVALID")
  return { data: JSON.parse(bytes), artifact: { file, sha256: sha(bytes), byteLength: bytes.length } }
}
