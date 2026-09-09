export function evaluateLifecycleEvidence(evidence) {
  const failures = []
  if (evidence?.exposedGc !== true) failures.push("exposed GC is required")

  const reuse = evidence?.stableReuse ?? {}
  if (!Number.isInteger(reuse.repeatedQueries) || reuse.repeatedQueries < 10) {
    failures.push("at least 10 stable queries are required")
  }
  if (reuse.additionalSnapshotMaterializations !== 0) {
    failures.push("stable queries must not rematerialize snapshots")
  }

  const edit = evidence?.commentEdit ?? {}
  if (!isNonNegativeInteger(edit.additionalSnapshotMaterializations)
      || !isNonNegativeInteger(edit.maximumSnapshotMaterializations)
      || edit.additionalSnapshotMaterializations > edit.maximumSnapshotMaterializations) {
    failures.push("comment edit snapshot materializations exceed the gate")
  }

  const lifecycle = evidence?.lifecycle ?? {}
  if (!Number.isInteger(lifecycle.trimCalls) || lifecycle.trimCalls < 1) {
    failures.push("trim must execute")
  }
  if (lifecycle.disposeCalls !== 21) failures.push("every context must dispose")
  if (lifecycle.sharedRegistry !== true) failures.push("churn must share one registry")

  const churn = evidence?.churn ?? {}
  if (churn.runs !== 20) failures.push("exactly 20 churn runs are required")
  if (!Array.isArray(churn.samples) || churn.samples.length !== 20) {
    failures.push("every churn run needs one memory sample")
  }

  const gates = evidence?.gates ?? {}
  if (!isPositiveInteger(gates.rssGrowthMaxBytes)
      || !isNonNegativeInteger(churn.rssGrowthBytes)
      || churn.rssGrowthBytes > gates.rssGrowthMaxBytes) {
    failures.push("RSS growth exceeds the gate")
  }
  if (!isPositiveInteger(gates.heapGrowthMaxBytes)
      || !isNonNegativeInteger(churn.heapGrowthBytes)
      || churn.heapGrowthBytes > gates.heapGrowthMaxBytes) {
    failures.push("heap growth exceeds the gate")
  }

  return { status: failures.length === 0 ? "PASS" : "FAIL", failures }
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}
