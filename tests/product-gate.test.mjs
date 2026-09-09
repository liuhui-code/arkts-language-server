import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { projectRoot } from "./support/lsp-process.mjs"

const generator = path.join(projectRoot, "scripts", "bench", "generate-large-fixture.mjs")
const processMemory = path.join(projectRoot, "scripts", "bench", "process-memory.sh")
const releaseGate = path.join(projectRoot, "scripts", "bench", "assert-release-gates.mjs")
const releaseGateConfig = path.join(projectRoot, "config", "memory-release-gates.json")
const workflowConfig = path.join(projectRoot, "config", "product-benchmark-workflow.json")

test("generates deterministic workspace and dependency growth fixtures", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-product-gate-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const first = path.join(root, "first")
  const second = path.join(root, "second")
  generate(first, { workspaceFiles: 24, activeDependencyFiles: 7, seed: 20260909 })
  generate(second, { workspaceFiles: 24, activeDependencyFiles: 7, seed: 20260909 })

  const manifest = JSON.parse(fs.readFileSync(path.join(first, "fixture-manifest.json"), "utf8"))
  assert.deepEqual(manifest, {
    schemaVersion: 1,
    seed: 20260909,
    workspaceFiles: 24,
    activeDependencyFiles: 7,
    entryFile: "entry/src/main/ets/Main.ets",
    generatedSourceRoot: "entry/src/main/ets/generated",
  })
  assert.equal(findFiles(first, ".ets").length, 24)
  assert.equal(reachableDependencies(first, manifest.entryFile).size - 1, 7)
  assert.equal(treeDigest(first), treeDigest(second))
})

test("rejects an impossible or destructive fixture request", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-product-gate-invalid-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const occupied = path.join(root, "occupied")
  fs.mkdirSync(occupied)
  fs.writeFileSync(path.join(occupied, "keep.txt"), "keep\n")

  const impossible = runGenerator(path.join(root, "impossible"), {
    workspaceFiles: 7,
    activeDependencyFiles: 7,
    seed: 1,
  })
  assert.notEqual(impossible.status, 0)
  assert.match(impossible.stderr, /workspace-files must exceed active-dependency-files/u)

  const destructive = runGenerator(occupied, {
    workspaceFiles: 8,
    activeDependencyFiles: 2,
    seed: 1,
  })
  assert.notEqual(destructive.status, 0)
  assert.match(destructive.stderr, /output directory already exists/u)
  assert.equal(fs.readFileSync(path.join(occupied, "keep.txt"), "utf8"), "keep\n")
})

test("keeps generated benchmark workspaces outside version control", () => {
  const ignore = fs.readFileSync(path.join(projectRoot, ".gitignore"), "utf8")
  assert.match(ignore, /^\.bench\/$/mu)
})

test("locks both growth series, workflow actions, and process accounting", () => {
  const workflow = JSON.parse(fs.readFileSync(workflowConfig, "utf8"))
  assert.deepEqual(workflow.runs, { cold: 3, warm: 10, stress: 5 })
  assert.deepEqual(workflow.unrelatedWorkspaceFiles, [1_000, 10_000, 50_000, 100_000])
  assert.equal(workflow.unrelatedActiveDependencyFiles, 200)
  assert.equal(workflow.dependencyWorkspaceFiles, 100_000)
  assert.deepEqual(workflow.dependencyActiveDependencyFiles, [200, 1_000, 5_000, 10_000])
  assert.deepEqual(workflow.workflow, [
    "open-entry",
    "wait-initialize",
    "type-this-dot",
    "completion",
    "definition",
    "references",
    "edit-comment",
    "completion",
  ])
  assert.deepEqual(workflow.stress, {
    moduleVisits: 20,
    returnToFirstModule: true,
    applyLevel3Pressure: true,
    finalOperation: "completion",
  })
  assert.deepEqual(workflow.processAccounting, {
    nodeRssCount: "once-per-process",
    productPssRoles: ["zed", "arkts-language-server", "arkts-index-sidecar"],
    devecoPssRoles: ["deveco", "language-analysis"],
    excludedRoles: ["emulator", "device-manager", "build"],
  })
})

test("samples Linux RSS and PSS once without double-counting a process tree", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-product-proc-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const processRoot = path.join(root, "321")
  fs.mkdirSync(processRoot, { recursive: true })
  fs.writeFileSync(path.join(processRoot, "status"), "Name:\tnode\nVmRSS:\t2048 kB\n")
  fs.writeFileSync(
    path.join(processRoot, "smaps_rollup"),
    "00400000-7fff ---p 00000000 00:00 0 [rollup]\nPss: 1536 kB\n",
  )

  const sampled = spawnSync(processMemory, ["321"], {
    cwd: projectRoot,
    env: { ...process.env, ARKTS_PROC_ROOT: root },
    encoding: "utf8",
  })
  assert.equal(sampled.status, 0, sampled.stderr)
  assert.deepEqual(JSON.parse(sampled.stdout), {
    pid: 321,
    rssBytes: 2_097_152,
    pssBytes: 1_572_864,
  })

  fs.writeFileSync(path.join(processRoot, "smaps_rollup"), "Pss: unavailable\n")
  const malformed = spawnSync(processMemory, ["321"], {
    cwd: projectRoot,
    env: { ...process.env, ARKTS_PROC_ROOT: root },
    encoding: "utf8",
  })
  assert.notEqual(malformed.status, 0)
  assert.match(malformed.stderr, /smaps_rollup omitted one Pss value/u)
})

test("accepts only complete comparable memory evidence that passes every release gate", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-product-release-gate-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const serverPath = path.join(root, "server.json")
  const devecoPath = path.join(root, "deveco.json")
  fs.writeFileSync(serverPath, JSON.stringify(serverEvidence()))
  fs.writeFileSync(devecoPath, JSON.stringify(devecoEvidence()))

  const result = runReleaseGate(serverPath, devecoPath)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    result.stdout,
    "MEMORY_RELEASE_GATE=PASS\nSEMANTIC_CORRECTNESS_GATE=PASS\n",
  )

  const config = JSON.parse(fs.readFileSync(releaseGateConfig, "utf8"))
  assert.deepEqual(config, {
    schemaVersion: 1,
    devecoComparison: { steadyPssRatioMax: 0.75, peakPssRatioMax: 0.85 },
    unrelatedWorkspaceScaling: { pss100kOver10kMax: 1.25 },
    postEviction: { pssOverInitialWarmMax: 1.20 },
    correctness: { allowedContractFailures: 0 },
    latencyRegression: { warmP95OverBaselineMax: 1.25 },
  })
})

test("fails closed for correctness, identity, and workflow evidence drift", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-product-release-fail-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const serverPath = path.join(root, "server.json")
  const devecoPath = path.join(root, "deveco.json")

  const incorrect = serverEvidence()
  incorrect.correctness.contractFailures = 1
  fs.writeFileSync(serverPath, JSON.stringify(incorrect))
  fs.writeFileSync(devecoPath, JSON.stringify(devecoEvidence()))
  const correctnessFailure = runReleaseGate(serverPath, devecoPath)
  assert.notEqual(correctnessFailure.status, 0)
  assert.match(correctnessFailure.stdout, /SEMANTIC_CORRECTNESS_GATE=FAIL/u)

  const mismatched = devecoEvidence()
  mismatched.comparisonIdentity.sdkDeclarationDigest = "b".repeat(64)
  fs.writeFileSync(serverPath, JSON.stringify(serverEvidence()))
  fs.writeFileSync(devecoPath, JSON.stringify(mismatched))
  const identityFailure = runReleaseGate(serverPath, devecoPath)
  assert.notEqual(identityFailure.status, 0)
  assert.match(identityFailure.stderr, /comparisonIdentity must match/u)

  const incomplete = serverEvidence()
  incomplete.workflowRuns.warm = 9
  fs.writeFileSync(serverPath, JSON.stringify(incomplete))
  fs.writeFileSync(devecoPath, JSON.stringify(devecoEvidence()))
  const workflowFailure = runReleaseGate(serverPath, devecoPath)
  assert.notEqual(workflowFailure.status, 0)
  assert.match(workflowFailure.stderr, /workflowRuns must equal cold=3, warm=10, stress=5/u)
})

function generate(output, options) {
  const result = runGenerator(output, options)
  assert.equal(result.status, 0, result.stderr)
}

function runGenerator(output, { workspaceFiles, activeDependencyFiles, seed }) {
  return spawnSync(process.execPath, [
    generator,
    "--out", output,
    "--workspace-files", String(workspaceFiles),
    "--active-dependency-files", String(activeDependencyFiles),
    "--seed", String(seed),
  ], { cwd: projectRoot, encoding: "utf8" })
}

function runReleaseGate(serverPath, devecoPath) {
  return spawnSync(process.execPath, [
    releaseGate,
    "--server", serverPath,
    "--deveco", devecoPath,
    "--gates", releaseGateConfig,
  ], { cwd: projectRoot, encoding: "utf8" })
}

function serverEvidence() {
  return {
    schemaVersion: 1,
    measurementStatus: "complete",
    comparisonIdentity: comparisonIdentity(),
    workflowRuns: { cold: 3, warm: 10, stress: 5 },
    correctness: { contractFailures: 0 },
    memory: {
      steadyPssBytes: 600,
      peakPssBytes: 800,
      pss10kBytes: 500,
      pss100kBytes: 600,
      initialWarmPssBytes: 500,
      postEvictionPssBytes: 550,
    },
    latency: { warmP95Ms: 20, baselineWarmP95Ms: 18 },
  }
}

function devecoEvidence() {
  return {
    schemaVersion: 1,
    measurementStatus: "complete",
    comparisonIdentity: comparisonIdentity(),
    workflowRuns: { cold: 3, warm: 10, stress: 5 },
    memory: { steadyPssBytes: 1_000, peakPssBytes: 1_000 },
  }
}

function comparisonIdentity() {
  return {
    schemaVersion: 1,
    workflowVersion: 1,
    sdkDeclarationDigest: "a".repeat(64),
    workspaceManifestDigest: "c".repeat(64),
  }
}

function findFiles(root, extension) {
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
}

function reachableDependencies(root, entryFile) {
  const visited = new Set()
  const visit = (relativePath) => {
    if (visited.has(relativePath)) return
    visited.add(relativePath)
    const source = fs.readFileSync(path.join(root, relativePath), "utf8")
    for (const match of source.matchAll(/from "(\.\/generated\/Active\d+|\.\/Active\d+)"/gu)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(relativePath), `${match[1]}.ets`))
      visit(target)
    }
  }
  visit(entryFile)
  return visited
}

function treeDigest(root) {
  const hash = createHash("sha256")
  for (const relativePath of fs.readdirSync(root, { recursive: true }).sort()) {
    const absolutePath = path.join(root, relativePath)
    if (!fs.statSync(absolutePath).isFile()) continue
    hash.update(relativePath)
    hash.update("\0")
    hash.update(fs.readFileSync(absolutePath))
    hash.update("\0")
  }
  return hash.digest("hex")
}
