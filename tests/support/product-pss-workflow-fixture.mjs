import { createHash } from "node:crypto"
import fs from "node:fs"
import { projectRoot } from "./lsp-process.mjs"
import { nativePssFixture, writeArtifact } from "./product-memory-fixture.mjs"

// Declared manifests/runs/kernel texts are synthetic: this qualifies binding, not native execution.
export function pssWorkflowFixture(t) {
  const { fixture, raw } = nativePssFixture(t)
  const workflowBytes = fs.readFileSync(`${projectRoot}/config/product-benchmark-workflow.json`)
  const workflow = JSON.parse(workflowBytes)
  const topologies = [...new Set([
    ...workflow.unrelatedWorkspaceFiles.map(count => `${count}:${workflow.unrelatedActiveDependencyFiles}`),
    ...workflow.dependencyActiveDependencyFiles.map(count => `${workflow.dependencyWorkspaceFiles}:${count}`),
  ])].map(key => key.split(":").map(Number))
  const manifests = topologies.map(([workspaceFiles, activeDependencyFiles]) =>
    writeArtifact(fixture.root, `topology-${workspaceFiles}-${activeDependencyFiles}.json`, {
      schemaVersion: 1, seed: workflow.seed, workspaceFiles, activeDependencyFiles,
      entryFile: "entry/src/main/ets/Main.ets", generatedSourceRoot: "entry/src/main/ets/generated",
    }))
  const primary = manifests[topologies.findIndex(([files, active]) => files === 100000 && active === 200)]
  for (const summary of [fixture.server, fixture.deveco]) {
    summary.comparisonIdentity.workspaceManifestDigest = primary.sha256
  }
  fixture.comparison.server = writeArtifact(fixture.root, "server.json", fixture.server)
  fixture.comparison.deveco = writeArtifact(fixture.root, "deveco.json", fixture.deveco)
  const templates = raw.samples, runs = []
  raw.samples = []
  for (const product of ["server", "deveco"]) {
    for (const [topologyIndex, manifest] of manifests.entries()) {
      for (const [kind, count] of Object.entries(workflow.runs)) {
        for (let index = 0; index < count; index += 1) {
          const sequence = runs.length, start = sequence * 100
          const template = templates.find(sample => sample.product === product && sample.metric === "peakPssBytes")
          const processes = template.processes.map((process, roleIndex) => ({
            pid: 10000 + sequence * 10 + roleIndex, role: process.role,
            startIdentity: `linux:${1000 + sequence * 10 + roleIndex}`,
          }))
          const run = { id: `${product}-${topologyIndex}-${kind}-${index}`, product,
            manifestSha256: manifest.sha256, kind, index,
            startedMonotonicMs: start, completedMonotonicMs: start + 90, processes }
          runs.push(run)
          const selected = [template]
          if (manifest.sha256 === primary.sha256 && kind === "warm" && index === 0) {
            selected.push(...templates.filter(sample => sample.product === product
              && ["steadyPssBytes", "pss100kBytes", "initialWarmPssBytes"].includes(sample.metric)))
          }
          if (topologies[topologyIndex][0] === 10000 && kind === "warm" && index === 0 && product === "server") {
            selected.push(templates.find(sample => sample.metric === "pss10kBytes"))
          }
          if (manifest.sha256 === primary.sha256 && kind === "stress" && index === 0 && product === "server") {
            selected.push(templates.find(sample => sample.metric === "postEvictionPssBytes"))
          }
          for (const [sampleIndex, observation] of selected.entries()) {
            const sample = structuredClone(observation), tick = start + sampleIndex * 10 + 1
            Object.assign(sample, { runId: run.id, timestamp: 100000 + tick, completedTimestamp: 100001 + tick,
              monotonicMs: tick, completedMonotonicMs: tick + 1 })
            sample.processes.forEach((process, roleIndex) => Object.assign(process, processes[roleIndex]))
            raw.samples.push(sample)
          }
        }
      }
    }
  }
  raw.statistics = { schemaVersion: 1, recipe: "product-pss-summary-v1" }
  raw.workflow = { schemaVersion: 1,
    workflowSha256: createHash("sha256").update(workflowBytes).digest("hex"),
    comparisonIdentity: structuredClone(fixture.server.comparisonIdentity), manifests, runs }
  fixture.comparison.rawEvidence = writeArtifact(fixture.root, "native-pss.json", raw)
  fs.writeFileSync(fixture.comparisonPath, JSON.stringify(fixture.comparison))
  return { fixture, raw, workflow, topologies }
}
