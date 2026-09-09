export const SPIKE_CATEGORIES = Object.freeze([
  "syntax",
  "completion",
  "definition",
  "references",
  "rename",
  "diagnostics",
  "incomplete",
  "unicode",
  "project-boundary",
])

const RESULT_STATUSES = new Set(["passed", "failed", "deferred"])

export function summarizeSpikeResults(results, minimumCases) {
  if (!Array.isArray(results)) throw new Error("Spike results must be an array")
  if (!Number.isSafeInteger(minimumCases) || minimumCases < 1) {
    throw new Error("minimumCases must be a positive integer")
  }

  const ids = new Set()
  const categories = Object.fromEntries(SPIKE_CATEGORIES.map((category) => [
    category,
    { passed: 0, failed: 0, deferred: 0 },
  ]))
  let positionMappingFailures = 0
  let targetVisibilityFailures = 0

  for (const result of results) {
    if (!result || typeof result !== "object") throw new Error("Spike result must be an object")
    if (typeof result.id !== "string" || !result.id) throw new Error("Spike result id is required")
    if (ids.has(result.id)) throw new Error("Duplicate spike result id: " + result.id)
    ids.add(result.id)
    if (!SPIKE_CATEGORIES.includes(result.category)) {
      throw new Error("Unknown spike category: " + result.category)
    }
    if (!RESULT_STATUSES.has(result.status)) {
      throw new Error("Unknown spike result status: " + result.status)
    }
    if (result.status !== "passed" && (typeof result.reason !== "string" || !result.reason)) {
      throw new Error("Non-passing spike result requires a reason: " + result.id)
    }
    categories[result.category][result.status] += 1
    if (result.status === "failed" && result.failureKind === "position-mapping") {
      positionMappingFailures += 1
    }
    if (result.status === "failed" && result.failureKind === "target-visibility") {
      targetVisibilityFailures += 1
    }
  }

  const totals = Object.values(categories).reduce(
    (sum, category) => ({
      total: sum.total + category.passed + category.failed + category.deferred,
      passed: sum.passed + category.passed,
      failed: sum.failed + category.failed,
      deferred: sum.deferred + category.deferred,
    }),
    { total: 0, passed: 0, failed: 0, deferred: 0 },
  )
  const hasEveryCategory = Object.values(categories)
    .every((category) => category.passed + category.failed + category.deferred > 0)
  const status = totals.failed > 0
    ? "FAIL"
    : totals.deferred > 0 || totals.total < minimumCases || !hasEveryCategory
      ? "INCOMPLETE"
      : "PASS"

  return {
    status,
    totals,
    categories,
    semanticContractFailures: totals.failed,
    positionMappingFailures,
    targetVisibilityFailures,
  }
}
