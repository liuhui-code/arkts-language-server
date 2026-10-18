import { createHash } from "node:crypto"
import fs from "node:fs"
import { isDeepStrictEqual } from "node:util"

const workflowBytes = fs.readFileSync(new URL("../../config/product-benchmark-workflow.json", import.meta.url))
const workflow = JSON.parse(workflowBytes)
const workflowSha256 = createHash("sha256").update(workflowBytes).digest("hex")
const expectedTopologies = [...new Set([
  ...workflow.unrelatedWorkspaceFiles.map(files => `${files}:${workflow.unrelatedActiveDependencyFiles}`),
  ...workflow.dependencyActiveDependencyFiles.map(active => `${workflow.dependencyWorkspaceFiles}:${active}`),
])]
const finiteClock = value => typeof value === "number" && Number.isFinite(value)
  && value >= 0 && value <= Number.MAX_SAFE_INTEGER
const owner = process => `${process.pid}:${process.role}:${process.startIdentity}`

/** Bind declared manifests, run inventory and record ownership, never native execution/coverage. */
export function productPssWorkflowBinding(proof, samples, comparisonIdentity, readArtifact) {
  if (proof === undefined) return { status: "NOT_VERIFIED" }
  try {
    if (proof?.schemaVersion !== 1 || proof.workflowSha256 !== workflowSha256
      || !isDeepStrictEqual(proof.comparisonIdentity, comparisonIdentity)
      || !Array.isArray(proof.manifests) || !Array.isArray(proof.runs)) throw Error("workflow header differs")
    const manifests = new Map(), topologies = new Set(), artifacts = []
    for (const ref of proof.manifests) {
      const { data, artifact } = readArtifact(ref)
      const key = `${data.workspaceFiles}:${data.activeDependencyFiles}`
      if (data.schemaVersion !== 1 || data.seed !== workflow.seed || !expectedTopologies.includes(key)
        || !Number.isSafeInteger(data.workspaceFiles) || !Number.isSafeInteger(data.activeDependencyFiles)
        || data.entryFile !== "entry/src/main/ets/Main.ets"
        || data.generatedSourceRoot !== "entry/src/main/ets/generated"
        || topologies.has(key) || manifests.has(artifact.sha256)) throw Error("invalid or duplicated topology")
      manifests.set(artifact.sha256, key)
      topologies.add(key)
      artifacts.push(artifact)
    }
    const missingTopologies = expectedTopologies.filter(key => !topologies.has(key))
    if (missingTopologies.length) return { status: "NOT_VERIFIED", missingTopologies, artifacts }
    if (!manifests.has(comparisonIdentity.workspaceManifestDigest)) throw Error("selected manifest differs")
    const expected = new Set()
    for (const product of ["server", "deveco"]) for (const topology of expectedTopologies) {
      for (const [kind, count] of Object.entries(workflow.runs)) {
        for (let index = 0; index < count; index += 1) expected.add(`${product}:${topology}:${kind}:${index}`)
      }
    }
    const runs = new Map(), slots = new Set(), observations = new Map()
    for (const run of proof.runs) {
      const topology = manifests.get(run?.manifestSha256)
      const slot = `${run?.product}:${topology}:${run?.kind}:${run?.index}`
      if (typeof run?.id !== "string" || !run.id || run.id.length > 256 || run.id.includes("\0")
        || runs.has(run.id) || slots.has(slot) || !expected.has(slot)
        || !Number.isSafeInteger(run.index) || run.index < 0
        || !finiteClock(run.startedMonotonicMs) || !finiteClock(run.completedMonotonicMs)
        || run.completedMonotonicMs <= run.startedMonotonicMs) throw Error("invalid or duplicated run")
      const owners = declaredOwners(run.processes, run.product)
      runs.set(run.id, { run, owners })
      slots.add(slot)
      observations.set(run.id, new Set())
    }
    for (const sample of samples) {
      const record = runs.get(sample.runId)
      if (!record || sample.product !== record.run.product
        || sample.monotonicMs < record.run.startedMonotonicMs
        || sample.completedMonotonicMs > record.run.completedMonotonicMs) throw Error("sample outside its run")
      for (const process of sample.processes) {
        const key = owner(process)
        if (!record.owners.has(key)) throw Error("sample process differs from its declared run")
        observations.get(sample.runId).add(key)
      }
    }
    const missingRuns = [...expected].filter(slot => !slots.has(slot))
    const unobservedOwners = [...runs].flatMap(([id, record]) => [...record.owners]
      .filter(key => !observations.get(id).has(key)).map(key => ({ runId: id, owner: key })))
    if (missingRuns.length || unobservedOwners.length) return {
      status: "NOT_VERIFIED", missingRuns, unobservedOwners, artifacts }
    return { status: "PASS", qualification: "DECLARED_MANIFEST_RUN_WINDOW_OWNER_BINDING_ONLY",
      topologies: topologies.size, runs: runs.size, boundSamples: samples.length, artifacts,
      execution: "NOT_VERIFIED", samplingCoverage: "NOT_VERIFIED" }
  } catch (error) {
    return { status: "FAIL", reason: "PRODUCT_MEMORY_WORKFLOW_BINDING_INVALID",
      error: error instanceof Error ? error.message : String(error) }
  }
}

function declaredOwners(processes, product) {
  const required = product === "server" ? workflow.processAccounting.productPssRoles
    : workflow.processAccounting.devecoPssRoles
  if (!Array.isArray(processes)) throw Error("run process map missing")
  const pids = new Set(), roles = new Set(), owners = new Set()
  for (const process of processes) {
    if (!Number.isSafeInteger(process?.pid) || process.pid <= 0 || pids.has(process.pid)
      || !required.includes(process.role) || typeof process.startIdentity !== "string"
      || !/^linux:\d+$/u.test(process.startIdentity)) throw Error("run process map invalid")
    pids.add(process.pid)
    roles.add(process.role)
    owners.add(owner(process))
  }
  if (required.some(role => !roles.has(role))) throw Error("run process role missing")
  return owners
}
