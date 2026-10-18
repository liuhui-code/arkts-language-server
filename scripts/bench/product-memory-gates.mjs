export function evaluateProductMemoryGates(server, deveco, gates) {
  validateComparableEvidence(server, deveco)
  return evaluate(server, deveco, gates)
}

function evaluate(server, deveco, gates) {
  exactKeys(gates, [
    "schemaVersion",
    "devecoComparison",
    "unrelatedWorkspaceScaling",
    "postEviction",
    "correctness",
    "latencyRegression",
  ], "release gates")
  if (gates.schemaVersion !== 1) throw new Error("release gates schemaVersion must be 1")
  const maximums = {
    steady: positive(gates.devecoComparison?.steadyPssRatioMax, "steadyPssRatioMax"),
    peak: positive(gates.devecoComparison?.peakPssRatioMax, "peakPssRatioMax"),
    scaling: positive(
      gates.unrelatedWorkspaceScaling?.pss100kOver10kMax,
      "pss100kOver10kMax",
    ),
    eviction: positive(gates.postEviction?.pssOverInitialWarmMax, "pssOverInitialWarmMax"),
    latency: positive(
      gates.latencyRegression?.warmP95OverBaselineMax,
      "warmP95OverBaselineMax",
    ),
  }
  const allowedFailures = nonNegativeInteger(
    gates.correctness?.allowedContractFailures,
    "allowedContractFailures",
  )
  const serverMemory = memory(server.memory, "server memory", [
    "steadyPssBytes",
    "peakPssBytes",
    "pss10kBytes",
    "pss100kBytes",
    "initialWarmPssBytes",
    "postEvictionPssBytes",
  ])
  const devecoMemory = memory(deveco.memory, "DevEco memory", [
    "steadyPssBytes",
    "peakPssBytes",
  ])
  exactKeys(server.latency, ["warmP95Ms", "baselineWarmP95Ms"], "server latency")
  const warmP95 = positive(server.latency.warmP95Ms, "warmP95Ms")
  const baselineWarmP95 = positive(server.latency.baselineWarmP95Ms, "baselineWarmP95Ms")
  exactKeys(server.correctness, ["contractFailures"], "server correctness")
  const contractFailures = nonNegativeInteger(
    server.correctness.contractFailures,
    "contractFailures",
  )
  return {
    memory: serverMemory.steadyPssBytes / devecoMemory.steadyPssBytes <= maximums.steady
      && serverMemory.peakPssBytes / devecoMemory.peakPssBytes <= maximums.peak
      && serverMemory.pss100kBytes / serverMemory.pss10kBytes <= maximums.scaling
      && serverMemory.postEvictionPssBytes / serverMemory.initialWarmPssBytes <= maximums.eviction
      && warmP95 / baselineWarmP95 <= maximums.latency,
    correctness: contractFailures <= allowedFailures,
  }
}

function validateComparableEvidence(server, deveco) {
  for (const [label, evidence, keys] of [
    ["server", server, [
      "schemaVersion",
      "measurementStatus",
      "comparisonIdentity",
      "workflowRuns",
      "correctness",
      "memory",
      "latency",
    ]],
    ["DevEco", deveco, [
      "schemaVersion",
      "measurementStatus",
      "comparisonIdentity",
      "workflowRuns",
      "memory",
    ]],
  ]) {
    exactKeys(evidence, keys, `${label} evidence`)
    if (evidence.schemaVersion !== 1) throw new Error(`${label} schemaVersion must be 1`)
    if (evidence.measurementStatus !== "complete") {
      throw new Error(`${label} measurementStatus must be complete`)
    }
    validateWorkflowRuns(evidence.workflowRuns, label)
  }
  if (stableJson(server.comparisonIdentity) !== stableJson(deveco.comparisonIdentity)) {
    throw new Error("server and DevEco comparisonIdentity must match")
  }
  exactKeys(server.comparisonIdentity, [
    "schemaVersion",
    "workflowVersion",
    "sdkDeclarationDigest",
    "workspaceManifestDigest",
  ], "comparisonIdentity")
  if (server.comparisonIdentity.schemaVersion !== 1
    || server.comparisonIdentity.workflowVersion !== 1
    || !/^[0-9a-f]{64}$/u.test(server.comparisonIdentity.sdkDeclarationDigest)
    || !/^[0-9a-f]{64}$/u.test(server.comparisonIdentity.workspaceManifestDigest)) {
    throw new Error("comparisonIdentity is invalid")
  }
}

function validateWorkflowRuns(runs, label) {
  exactKeys(runs, ["cold", "warm", "stress"], `${label} workflowRuns`)
  if (runs.cold !== 3 || runs.warm !== 10 || runs.stress !== 5) {
    throw new Error(`${label} workflowRuns must equal cold=3, warm=10, stress=5`)
  }
}

function memory(value, label, keys) {
  exactKeys(value, keys, label)
  return Object.fromEntries(keys.map((key) => [key, positive(value[key], `${label}.${key}`)]))
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} must contain exactly: ${expected.join(", ")}`)
  }
}

function positive(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number`)
  }
  return value
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`)
  }
  return value
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}
