import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { evaluate, writeArtifact } from "./support/product-memory-fixture.mjs"
import { pssWorkflowFixture } from "./support/product-pss-workflow-fixture.mjs"

test("L08 keeps each missing original topology unverified rather than narrowing the declared family", t => {
  for (let index = 0; index < 7; index += 1) {
    const { fixture, raw, topologies } = pssWorkflowFixture(t)
    const [missing] = raw.workflow.manifests.splice(index, 1)
    const ids = new Set(raw.workflow.runs.filter(run => run.manifestSha256 === missing.sha256).map(run => run.id))
    raw.workflow.runs = raw.workflow.runs.filter(run => !ids.has(run.id))
    // Preserve summary arithmetic; absent manifest proof must not silently reassign these declared observations.
    const { receipt, report } = consume(fixture, raw)
    assert.equal(receipt.rawObservation.summaryBinding, "PASS")
    assert.equal(receipt.rawObservation.workflowBinding.status, "NOT_VERIFIED")
    assert.deepEqual(receipt.rawObservation.workflowBinding.missingTopologies, [topologies[index].join(":")])
    assert.equal(receipt.status, "BLOCKED")
    assert.deepEqual(receipt.reasons, ["PRODUCT_MEMORY_WORKFLOW_BINDING_INCOMPLETE"])
    assert.equal(report.releaseEligible, false)
  }
})

test("L08 requires every product topology and cold warm stress run slot", t => {
  const template = pssWorkflowFixture(t)
  const targets = template.raw.workflow.runs.filter(run => run.index === template.workflow.runs[run.kind] - 1)
  assert.equal(targets.length, 42)
  for (const target of targets) {
    const { fixture, raw, topologies } = pssWorkflowFixture(t)
    const missing = raw.workflow.runs.find(run => run.id === target.id)
    raw.workflow.runs = raw.workflow.runs.filter(run => run.id !== missing.id)
    raw.samples = raw.samples.filter(sample => sample.runId !== missing.id)
    const { receipt, report } = consume(fixture, raw)
    assert.equal(receipt.rawObservation.summaryBinding, "PASS")
    const binding = receipt.rawObservation.workflowBinding
    assert.equal(binding.status, "NOT_VERIFIED")
    const topologyIndex = raw.workflow.manifests.findIndex(ref => ref.sha256 === missing.manifestSha256)
    assert.deepEqual(binding.missingRuns,
      [`${missing.product}:${topologies[topologyIndex].join(":")}:${missing.kind}:${missing.index}`])
    assert.equal(receipt.status, "BLOCKED")
    assert.equal(report.cells.find(cell => cell.requests).requests, 20)
    assert.equal(report.releaseEligible, false)
  }
})

test("L08 keeps declared but never observed process owners incomplete", t => {
  for (const dropAllSamples of [false, true]) {
    const { fixture, raw } = pssWorkflowFixture(t)
    const run = raw.workflow.runs.find(run => run.product === "deveco" && run.kind === "cold")
    if (dropAllSamples) raw.samples = raw.samples.filter(sample => sample.runId !== run.id)
    else run.processes.push({ pid: 900000, role: "language-analysis", startIdentity: "linux:900000" })
    const { receipt, report } = consume(fixture, raw)
    const binding = receipt.rawObservation.workflowBinding
    assert.equal(binding.status, "NOT_VERIFIED")
    assert.ok(binding.unobservedOwners.some(owner => owner.runId === run.id))
    assert.equal(receipt.status, "BLOCKED")
    assert.deepEqual(receipt.reasons, ["PRODUCT_MEMORY_WORKFLOW_BINDING_INCOMPLETE"])
    assert.equal(report.releaseEligible, false)
  }
})

test("L08 rejects contradictory workflow identity run slots process owners and read intervals", t => {
  for (const [name, mutate] of [
    ["wrong-workflow", raw => { raw.workflow.workflowSha256 = "f".repeat(64) }],
    ["wrong-comparison", raw => { raw.workflow.comparisonIdentity.sdkDeclarationDigest = "f".repeat(64) }],
    ["duplicate-manifest", raw => { raw.workflow.manifests.push({ ...raw.workflow.manifests[0] }) }],
    ["duplicate-id", raw => { raw.workflow.runs.push(structuredClone(raw.workflow.runs[0])) }],
    ["duplicate-slot", raw => { raw.workflow.runs.push({ ...raw.workflow.runs[0], id: "another-id" }) }],
    ["unknown-kind", raw => { raw.workflow.runs[0].kind = "hot" }],
    ["out-of-range-index", raw => { raw.workflow.runs[0].index = 3 }],
    ["string-index", raw => { raw.workflow.runs[0].index = "0" }],
    ["empty-id", raw => { raw.workflow.runs[0].id = "" }],
    ["reversed-run", raw => { raw.workflow.runs[0].completedMonotonicMs = 0 }],
    ["unknown-sample-run", raw => { raw.samples[0].runId = "not-a-declared-run" }],
    ["other-product-run", raw => { raw.samples[0].runId = raw.workflow.runs.find(run => run.product === "deveco").id }],
    ["unknown-sample-pid", raw => { raw.samples[0].processes[0].pid += 500000 }],
    ["wrong-start-identity", raw => { raw.workflow.runs[0].processes[0].startIdentity = "linux:999999" }],
    ["excluded-role", raw => { raw.workflow.runs[0].processes[0].role = "build" }],
    ["duplicate-owner-pid", raw => { raw.workflow.runs[0].processes.push({ ...raw.workflow.runs[0].processes[0] }) }],
    ["missing-role", raw => { raw.workflow.runs[0].processes.shift() }],
    ["read-before-run", raw => { raw.workflow.runs[1].startedMonotonicMs = 102 }],
    ["read-finishes-after-run", raw => { raw.workflow.runs[1].completedMonotonicMs = 101 }],
  ]) {
    const { fixture, raw } = pssWorkflowFixture(t)
    mutate(raw)
    const { receipt, report } = consume(fixture, raw)
    assert.equal(receipt.rawObservation.status, "PASS", name)
    assert.equal(receipt.status, "FAIL", name)
    assert.deepEqual(receipt.reasons, ["PRODUCT_MEMORY_WORKFLOW_BINDING_INVALID"], name)
    assert.equal(report.cells.find(cell => cell.requests).requests, 20, name)
    assert.equal(report.releaseEligible, false, name)
  }
})

test("L08 binds process cohort changes when every actual observation has a declared owner", t => {
  const { fixture, raw } = pssWorkflowFixture(t)
  const run = raw.workflow.runs.find(run => run.product === "deveco" && run.kind === "warm"
    && raw.samples.filter(sample => sample.runId === run.id).length > 1)
  const samples = raw.samples.filter(sample => sample.runId === run.id)
  const replacement = { pid: 900000, role: "language-analysis", startIdentity: "linux:900000" }
  run.processes.push(replacement)
  Object.assign(samples.at(-1).processes.find(process => process.role === "language-analysis"), replacement)
  const { receipt, report } = consume(fixture, raw)
  assert.equal(receipt.rawObservation.workflowBinding.status, "PASS")
  assert.equal(receipt.rawObservation.workflowBinding.execution, "NOT_VERIFIED")
  assert.equal(receipt.rawObservation.workflowBinding.samplingCoverage, "NOT_VERIFIED")
  assert.equal(receipt.rawObservation.productCoverage, "NOT_VERIFIED")
  assert.equal(receipt.status, "BLOCKED")
  assert.equal(report.releaseEligible, false)
})

test("L08 rereads every manifest rather than trusting repeated metadata and supplied digests", t => {
  for (const changed of [false, true]) {
    const { fixture, raw } = pssWorkflowFixture(t)
    const ref = raw.workflow.manifests[0]
    const path = `${fixture.root}/${ref.file}`
    if (changed) fs.appendFileSync(path, "\n")
    else fs.unlinkSync(path)
    const { receipt, report } = consume(fixture, raw)
    assert.equal(receipt.rawObservation.status, "PASS")
    assert.equal(receipt.rawObservation.workflowBinding.status, "FAIL")
    assert.equal(receipt.status, "FAIL")
    assert.equal(report.releaseEligible, false)
  }
})

function consume(fixture, raw) {
  fixture.comparison.rawEvidence = writeArtifact(fixture.root, "native-pss.json", raw)
  fs.writeFileSync(fixture.comparisonPath, JSON.stringify(fixture.comparison))
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  return { report, receipt: report.productMemoryComparisonEvidence.receipts[0] }
}
