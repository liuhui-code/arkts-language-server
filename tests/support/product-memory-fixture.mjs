import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { projectRoot } from "./lsp-process.mjs"
import { readyReport } from "./semantic-release-evidence-fixture.mjs"

const cli = path.join(projectRoot, "scripts/bench/assert-semantic-release.mjs")
const matrix = path.join(projectRoot, "config/semantic-release-matrix.json")
const sha = bytes => createHash("sha256").update(bytes).digest("hex")

// Synthetic fixtures qualify the consumer only, never actual product memory or a native platform.
export function memoryFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-product-memory-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const report = readyReport(0)
  report.environment.platform = "Linux 6.8.0 x64"
  const buildIdentity = {
    serverRevision: "1".repeat(40), serverInputSha256: report.inputIdentity.serverInputSha256,
    serverSha256: report.inputIdentity.serverSha256, sdkDeclarationDigest: report.inputIdentity.sdkDeclarationDigest,
    backendVersion: report.inputIdentity.backendVersion, backendSha256: report.inputIdentity.backendSha256,
    nodeVersion: process.version, sdkMetadata: { apiVersion: "24", version: "test" },
    ...Object.fromEntries(["sidecarSha256", "semanticWorkerSha256", "referenceVerifierWorkerSha256",
      "diagnosticVerifierWorkerSha256", "standardLibrarySha256", "lockfileSha256", "memoryGatesSha256"]
      .map(key => [key, "1".repeat(64)])),
  }
  for (const [key, value] of Object.entries(buildIdentity)) {
    report.inputIdentity[key] = value
    report.inputIdentity.postflightPins[key] = structuredClone(value)
  }
  const comparisonIdentity = { schemaVersion: 1, workflowVersion: 1,
    sdkDeclarationDigest: report.inputIdentity.sdkDeclarationDigest,
    workspaceManifestDigest: "e".repeat(64) }
  const server = { schemaVersion: 1, measurementStatus: "complete", comparisonIdentity,
    workflowRuns: { cold: 3, warm: 10, stress: 5 }, correctness: { contractFailures: 0 },
    memory: { steadyPssBytes: 600, peakPssBytes: 800, pss10kBytes: 500, pss100kBytes: 600,
      initialWarmPssBytes: 500, postEvictionPssBytes: 550 },
    latency: { warmP95Ms: 20, baselineWarmP95Ms: 18 } }
  const deveco = { schemaVersion: 1, measurementStatus: "complete", comparisonIdentity,
    workflowRuns: { cold: 3, warm: 10, stress: 5 },
    memory: { steadyPssBytes: 1000, peakPssBytes: 1000 } }
  const comparison = { schema: "arkts-language-server.product-memory-comparison", schemaVersion: 1,
    platform: "linux", buildIdentity, flags: {}, server: writeArtifact(root, "server.json", server),
    deveco: writeArtifact(root, "deveco.json", deveco) }
  const preparedPath = path.join(root, "prepared.json")
  const comparisonPath = path.join(root, "comparison.json")
  fs.writeFileSync(preparedPath, JSON.stringify(report))
  fs.writeFileSync(comparisonPath, JSON.stringify(comparison))
  return { root, preparedPath, comparisonPath, comparison, server, deveco }
}

export function writeArtifact(root, name, data) {
  const bytes = Buffer.from(JSON.stringify(data))
  fs.writeFileSync(path.join(root, name), bytes)
  return { file: name, sha256: sha(bytes), byteLength: bytes.length }
}

export function evaluate(fixture) {
  const out = path.join(fixture.root, "release.json")
  const result = spawnSync(process.execPath, [cli, "--matrix", matrix,
    "--prepared-report", fixture.preparedPath, "--memory-comparison", fixture.comparisonPath,
    "--out", out], { cwd: projectRoot, encoding: "utf8" })
  return { result, report: fs.existsSync(out) ? JSON.parse(fs.readFileSync(out)) : null }
}

export function nativePssFixture(t) {
  const fixture = memoryFixture(t)
  for (const data of [fixture.server, fixture.deveco]) {
    for (const key of Object.keys(data.memory)) data.memory[key] *= 1024
  }
  fixture.comparison.server = writeArtifact(fixture.root, "server.json", fixture.server)
  fixture.comparison.deveco = writeArtifact(fixture.root, "deveco.json", fixture.deveco)
  const samples = [
    ["server", "steadyPssBytes", 600], ["server", "peakPssBytes", 800],
    ["server", "pss10kBytes", 500], ["server", "pss100kBytes", 600],
    ["server", "initialWarmPssBytes", 500], ["server", "postEvictionPssBytes", 550],
    ["deveco", "steadyPssBytes", 1000], ["deveco", "peakPssBytes", 1000],
  ].map(([product, metric, totalKiB], index) => ({ product, metric,
    timestamp: 1000 + index * 10, completedTimestamp: 1003 + index * 10,
    monotonicMs: 100 + index * 10, completedMonotonicMs: 103 + index * 10,
    totalPssBytes: totalKiB * 1024,
    processes: (product === "server" ? ["zed", "arkts-language-server", "arkts-index-sidecar"]
      : ["deveco", "language-analysis"]).map((role, roleIndex, roles) => {
      const pssKiB = Math.floor(totalKiB / roles.length)
        + (roleIndex === roles.length - 1 ? totalKiB % roles.length : 0)
      return { pid: (product === "server" ? 100 : 1000) + roleIndex,
        startIdentity: `linux:${(product === "server" ? 123 : 1023) + roleIndex}`, role,
        rssBytes: 2048 * 1024, pssBytes: pssKiB * 1024,
        procStatus: "Name:\tnode\nVmRSS:\t2048 kB\n", smapsRollup: `Pss: ${pssKiB} kB\n` }
    }),
  }))
  const raw = { schema: "arkts-language-server.product-pss-observations", schemaVersion: 1,
    measurementKind: "linux-smaps-rollup", platform: "linux", samples }
  fixture.comparison.rawEvidence = writeArtifact(fixture.root, "native-pss.json", raw)
  fs.writeFileSync(fixture.comparisonPath, JSON.stringify(fixture.comparison))
  return { fixture, raw }
}
