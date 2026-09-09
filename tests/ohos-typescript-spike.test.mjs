import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  SPIKE_CATEGORIES,
  summarizeSpikeResults,
} from "../scripts/semantic/ohos-typescript-spike/spike-report.mjs"
import {
  CORE_SEMANTIC_SCENARIO_IDS,
  DIRECT_SCENARIO_IDS,
  REFERENCE_RENAME_SCENARIO_IDS,
} from "../scripts/semantic/ohos-typescript-spike/direct-scenarios.mjs"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("an incomplete official-backend run cannot be reported as a pass", () => {
  const results = [
    ...Array.from({ length: 5 }, (_, index) => ({
      id: "syntax.direct-" + index,
      category: "syntax",
      status: "passed",
    })),
    ...Array.from({ length: 29 }, (_, index) => ({
      id: "references.deferred-" + index,
      category: "references",
      status: "deferred",
      reason: "No direct official-backend scenario yet",
    })),
  ]

  const summary = summarizeSpikeResults(results, 30)
  assert.equal(summary.status, "INCOMPLETE")
  assert.deepEqual(summary.totals, { total: 34, passed: 5, failed: 0, deferred: 29 })
  assert.equal(summary.semanticContractFailures, 0)
  assert.equal(summary.categories.references.deferred, 29)
})

test("any mandatory semantic failure makes the official-backend run fail", () => {
  const results = SPIKE_CATEGORIES.map((category) => ({
    id: category + ".case",
    category,
    status: category === "rename" ? "failed" : "passed",
    reason: category === "rename" ? "wrong declaration identity" : undefined,
  }))

  const summary = summarizeSpikeResults(results, SPIKE_CATEGORIES.length)
  assert.equal(summary.status, "FAIL")
  assert.equal(summary.semanticContractFailures, 1)
  assert.equal(summary.categories.rename.failed, 1)
})

test("PASS requires the minimum case count and every required category without deferrals", () => {
  const results = Array.from({ length: 36 }, (_, index) => ({
    id: SPIKE_CATEGORIES[index % SPIKE_CATEGORIES.length] + ".case-" + index,
    category: SPIKE_CATEGORIES[index % SPIKE_CATEGORIES.length],
    status: "passed",
  }))

  const summary = summarizeSpikeResults(results, 30)
  assert.equal(summary.status, "PASS")
  assert.deepEqual(summary.totals, { total: 36, passed: 36, failed: 0, deferred: 0 })
  assert.equal(summary.semanticContractFailures, 0)
})

test("the committed spike report remains explicitly incomplete until every contract executes", () => {
  const reportPath = path.join(projectRoot, "docs", "reports", "ohos-typescript-spike.json")
  const reportBytes = fs.readFileSync(reportPath)
  assert.ok(reportBytes.length <= 64 * 1024)
  assert.equal(reportBytes.includes(Buffer.from(projectRoot)), false)
  const report = JSON.parse(reportBytes.toString("utf8"))
  assert.equal(report.status, "INCOMPLETE")
  assert.equal(report.summary.totals.total, 34)
  assert.equal(report.summary.totals.passed, 21)
  assert.equal(report.summary.totals.failed, 0)
  assert.equal(report.summary.totals.deferred, 13)
  assert.equal(report.backendRevision, "9cc62fe98f47c0bf113676e3fb33fe932b493052")
  assert.equal(
    report.sdkDeclarationDigest,
    "8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4",
  )
  const executed = report.results.filter(({ status }) => status === "passed")
  assert.ok(executed.every(({ stats }) => stats.disposed === true))
  assert.ok(executed.every(({ observations }) => observations.completionNames === undefined))
  for (const id of DIRECT_SCENARIO_IDS) {
    assert.equal(report.results.find((result) => result.id === id)?.status, "passed")
  }
})

test("the core semantic contracts have direct official-backend scenarios", () => {
  assert.deepEqual(
    [...CORE_SEMANTIC_SCENARIO_IDS].sort(),
    [
      "completion.auto-import",
      "completion.imported-receiver",
      "completion.this-member",
      "definition.alias-reexport",
      "definition.struct-source-map",
      "definition.unopened-utf16",
      "diagnostics.exact-code-range",
      "unicode.identifier-completion",
    ],
  )
})

test("references and rename contracts have direct official-backend scenarios", () => {
  assert.deepEqual(
    [...REFERENCE_RENAME_SCENARIO_IDS].sort(),
    [
      "references.barrel-unopened",
      "references.changed-overlay",
      "references.large-unopened-struct",
      "references.new-target-root",
      "rename.cross-module",
      "rename.explicit-barrel-alias",
      "rename.non-bmp-prepare",
      "rename.same-scope-conflict",
    ],
  )
})
