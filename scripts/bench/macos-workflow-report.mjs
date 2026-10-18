import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { projectRoot } from "./reference-replay-input.mjs"

/** Assemble the original development report without upgrading RSS to release evidence. */
export function createReport({ options, workflow, workflowSelection, manifest, manifestPath, sdkIdentity, oracle, runs, failure = null }) {
  const warm = runs.filter((run) => run.kind === "warm")
  const stress = runs.filter((run) => run.kind === "stress" && run.semantic.level3Observed === true)
  const peaks = runs.map(run => run.memory.peakProductRssBytes).filter(Number.isFinite)
  const planned = Object.entries(workflow.runs).flatMap(([kind, count]) =>
    Array.from({ length: count }, (_, index) => ({ kind, index })))
  const unexecutedRuns = planned.filter(item => !runs.some(run => run.kind === item.kind && run.index === item.index))
  return {
    schemaVersion: 1,
    measurementStatus: failure ? "incomplete" : unexecutedRuns.length ? "partial" : "complete",
    measurementKind: "macos-rss-development-gate",
    releasePssComparable: false,
    comparisonIdentity: {
      gitRevision: gitRevision(),
      ...sdkIdentity,
      workflowOracleSha256: oracle?.sha256 ?? null,
      workspaceManifestDigest: sha256(manifestPath),
      workspaceFiles: manifest.workspaceFiles,
      activeDependencyFiles: manifest.activeDependencyFiles,
      platform: `${os.type()} ${os.release()} ${os.arch()}`,
    },
    workflowRuns: workflow.runs,
    workflowSelection,
    workflowExecution: { plannedRuns: planned.length, attemptedRuns: runs.length,
      completedRuns: runs.filter(run => run.status === "COMPLETE").length, unexecutedRuns: unexecutedRuns.length },
    unexecutedRuns,
    failure,
    correctness: {
      failures: runs.filter(run => run.status === "FAIL").length,
      locationOracle: { status: oracle ? failure ? "FAIL" : "PASS" : "NOT_PROVIDED",
        capabilities: oracle ? ["definition", "references:includeDeclaration=true"] : [] },
      completionOracle: { status: oracle?.completion ? failure ? "FAIL" : "PASS" : "NOT_PROVIDED",
        capabilities: oracle?.completion ? ["completion:initial", "completion:edited", "completion:post-pressure"] : [] },
      operationsPerRun: ["completion", "definition", "references", "edit-comment", "completion"],
      stressModuleVisits: 20,
    },
    memory: {
      steadyWarmRssBytes: median(warm.map((run) => run.memory.finalProductRssBytes)),
      peakRssBytes: peaks.length ? Math.max(...peaks) : null,
      initialWarmRssBytes: warm[0]?.memory.finalProductRssBytes ?? null,
      postEvictionRssBytes: median(stress.map((run) => run.memory.finalProductRssBytes)),
    },
    latency: {
      warmCompletionP95Ms: percentile(warm.map((run) => run.latency.completionMs), 0.95),
      warmDefinitionP95Ms: percentile(warm.map((run) => run.latency.definitionMs), 0.95),
      warmReferencesP95Ms: percentile(warm.map((run) => run.latency.referencesMs), 0.95),
    },
    runs,
    note: "macOS RSS counts the server process tree only; it is not Linux PSS and cannot satisfy the release comparison gate.",
    output: path.resolve(options.out),
  }
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function percentile(values, ratio) {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * ratio) - 1]
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex")
}

function gitRevision() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: projectRoot,
    encoding: "utf8",
  }).trim()
}
