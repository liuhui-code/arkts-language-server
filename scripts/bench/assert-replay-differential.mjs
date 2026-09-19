#!/usr/bin/env node

import fs from "node:fs"

try {
  const [baselinePath, candidatePath] = parseArguments(process.argv.slice(2))
  const baseline = readReport(baselinePath)
  const candidate = readReport(candidatePath)
  assertComparable(baseline, candidate)

  const referencesExact = same(
    baseline.normalizedReferences,
    candidate.normalizedReferences,
  )
  const diagnosticsExact = same(
    baseline.diagnostic.diagnostics,
    candidate.diagnostic.diagnostics,
  )
  process.stdout.write([
    `REFERENCES_LOCATION_GATE=${referencesExact ? "PASS" : "FAIL"}`,
    `DIAGNOSTIC_CORRECTNESS_GATE=${diagnosticsExact ? "PASS" : "FAIL"}`,
    `BASELINE_DIAGNOSTICS=${baseline.diagnostic.diagnostics.length}`,
    `CANDIDATE_DIAGNOSTICS=${candidate.diagnostic.diagnostics.length}`,
    "",
  ].join("\n"))
  if (!referencesExact || !diagnosticsExact) process.exitCode = 1
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}

function parseArguments(args) {
  if (args.length !== 4 || args[0] !== "--baseline" || args[2] !== "--candidate") {
    throw new Error("usage: assert-replay-differential.mjs --baseline <report.json> --candidate <report.json>")
  }
  return [args[1], args[3]]
}

function readReport(fileName) {
  const report = JSON.parse(fs.readFileSync(fileName, "utf8"))
  if (report?.schemaVersion !== 1
    || report.status !== "PASS"
    || report.failure != null
    || report.requestEvidence?.explicitMethod !== "textDocument/references"
    || !Array.isArray(report.normalizedReferences)
    || report.diagnostic?.timeout
    || !Number.isSafeInteger(report.diagnostic?.version)
    || !Array.isArray(report.diagnostic?.diagnostics)) {
    throw new Error(`incomplete or unsuccessful references replay: ${fileName}`)
  }
  return report
}

function assertComparable(baseline, candidate) {
  for (const [label, left, right] of [
    ["workspace", baseline.environment?.workspace, candidate.environment?.workspace],
    ["workspace revision", baseline.environment?.workspaceRevision, candidate.environment?.workspaceRevision],
    ["SDK", baseline.environment?.sdk, candidate.environment?.sdk],
    ["SDK metadata", baseline.environment?.sdkMetadata, candidate.environment?.sdkMetadata],
    ["target", baseline.target, candidate.target],
    ["diagnostic document version", baseline.diagnostic.version, candidate.diagnostic.version],
  ]) {
    if (left == null || right == null || !same(left, right)) {
      throw new Error(`replay ${label} differs or is unavailable`)
    }
  }
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}
