const PERCENTILES = [
  ["p50", 0.5],
  ["p95", 0.95],
  ["p99", 0.99],
]

export function evaluatePerformanceEvidence({ metric, candidate, baseline, gate }) {
  if (typeof metric !== "string" || metric.trim().length === 0 || metric.length > 128) {
    throw new TypeError("metric must be a non-empty string of at most 128 characters")
  }
  assertGate(gate)
  assertBoundedRuns(candidate, "candidate")
  assertBoundedRuns(baseline, "baseline")
  assertIdentity(candidate.identity, "candidate")
  assertIdentity(baseline.identity, "baseline")
  assertComparableIdentities(candidate.identity, baseline.identity)
  const candidateSummary = summarize(candidate)
  const baselineSummary = summarize(baseline)
  return deepFreeze({
    schema: "arkts-language-server.performance-evidence",
    schemaVersion: 1,
    metric,
    gate: {
      percentile: gate.percentile,
      absoluteMax: gate.absoluteMax,
      relativeMax: gate.relativeMax,
    },
    candidate: candidateSummary,
    baseline: baselineSummary,
    evaluation: insufficientRuns(candidate, "candidate")
      ?? insufficientRuns(baseline, "baseline")
      ?? evaluateGate(candidateSummary, baselineSummary, gate),
  })
}

function deepFreeze(value) {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object") deepFreeze(child)
  }
  return Object.freeze(value)
}

function assertIdentity(identity, label) {
  if (identity === null || typeof identity !== "object" || Array.isArray(identity)) {
    throw new TypeError(`${label} identity must be an object`)
  }
  for (const componentName of ["fixture", "artifact", "runner"]) {
    const component = identity[componentName]
    if (component === null || typeof component !== "object" || Array.isArray(component)) {
      throw new TypeError(`${label} identity.${componentName} must be an object`)
    }
    if (typeof component.id !== "string"
      || component.id.trim().length === 0
      || component.id.length > 128) {
      throw new TypeError(
        `${label} identity.${componentName}.id must be a non-empty string of at most 128 characters`,
      )
    }
    const digestName = componentName === "runner" ? "fingerprint" : "sha256"
    if (!/^[0-9a-f]{64}$/.test(component[digestName])) {
      throw new TypeError(
        `${label} identity.${componentName}.${digestName} must be a lowercase SHA-256 digest`,
      )
    }
  }
}

function assertComparableIdentities(candidate, baseline) {
  if (candidate.fixture.id !== baseline.fixture.id
    || candidate.fixture.sha256 !== baseline.fixture.sha256) {
    throw new TypeError("baseline fixture identity must match candidate fixture identity")
  }
  if (candidate.runner.id !== baseline.runner.id
    || candidate.runner.fingerprint !== baseline.runner.fingerprint) {
    throw new TypeError("baseline runner identity must match candidate runner identity")
  }
  if (candidate.artifact.sha256 === baseline.artifact.sha256) {
    throw new TypeError("baseline artifact digest must differ from candidate artifact digest")
  }
}

function assertGate(gate) {
  if (gate === null || typeof gate !== "object" || Array.isArray(gate)) {
    throw new TypeError("gate must be an object")
  }
  if (!PERCENTILES.some(([name]) => name === gate.percentile)) {
    throw new TypeError("gate percentile must be one of p50, p95, p99")
  }
  if (typeof gate.absoluteMax !== "number"
    || !Number.isFinite(gate.absoluteMax)
    || gate.absoluteMax < 0) {
    throw new TypeError("gate absoluteMax must be a finite non-negative number")
  }
  if (typeof gate.relativeMax !== "number"
    || !Number.isFinite(gate.relativeMax)
    || gate.relativeMax <= 0) {
    throw new TypeError("gate relativeMax must be a finite positive number")
  }
}

function evaluateGate(candidate, baseline, gate) {
  const candidateValue = candidate.percentiles[gate.percentile]
  const baselineValue = baseline.percentiles[gate.percentile]
  if (baselineValue === 0) {
    throw new TypeError(
      `baseline ${gate.percentile} must be greater than zero for a relative gate`,
    )
  }
  const actualRatio = candidateValue / baselineValue
  if (!Number.isFinite(actualRatio)) {
    throw new TypeError(`candidate-to-baseline ${gate.percentile} ratio must be finite`)
  }
  const absolutePassed = candidateValue <= gate.absoluteMax
  const relativePassed = actualRatio <= gate.relativeMax
  return {
    publishable: true,
    verdict: absolutePassed && relativePassed ? "pass" : "fail",
    absolute: {
      actual: candidateValue,
      max: gate.absoluteMax,
      passed: absolutePassed,
    },
    relative: {
      actualRatio,
      maxRatio: gate.relativeMax,
      passed: relativePassed,
    },
  }
}

function insufficientRuns(series, label) {
  return series.runs.length < 10
    ? {
        publishable: false,
        verdict: null,
        reason: `${label} requires at least 10 independent runs`,
      }
    : undefined
}

function assertBoundedRuns(series, label) {
  if (series === null
    || typeof series !== "object"
    || !Array.isArray(series.runs)
    || series.runs.length === 0) {
    throw new TypeError(`${label} runs must be an array containing raw independent runs`)
  }
  if (series.runs.length > 100) {
    throw new RangeError(`${label} runs must contain at most 100 entries`)
  }
  const runIds = new Set()
  for (const [index, run] of series.runs.entries()) {
    if (run === null || typeof run !== "object" || Array.isArray(run)) {
      throw new TypeError(`${label} run ${index + 1} must be an object`)
    }
    const { runId, value } = run
    if (typeof runId !== "string" || runId.trim().length === 0 || runId.length > 128) {
      throw new TypeError(
        `${label} run ${index + 1} runId must be a non-empty string of at most 128 characters`,
      )
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new TypeError(`${label} run ${index + 1} value must be a finite non-negative number`)
    }
    if (runIds.has(runId)) throw new TypeError(`${label} runId must be unique: ${runId}`)
    runIds.add(runId)
  }
}

function summarize(series) {
  const runs = series.runs.map(({ runId, value }) => ({ runId, value }))
  const values = runs.map(({ value }) => value).sort((left, right) => left - right)
  const percentiles = Object.fromEntries(PERCENTILES.map(([name, percentile]) => [
    name,
    values[Math.ceil(percentile * values.length) - 1],
  ]))
  return {
    identity: {
      fixture: {
        id: series.identity.fixture.id,
        sha256: series.identity.fixture.sha256,
      },
      artifact: {
        id: series.identity.artifact.id,
        sha256: series.identity.artifact.sha256,
      },
      runner: {
        id: series.identity.runner.id,
        fingerprint: series.identity.runner.fingerprint,
      },
    },
    runs,
    percentiles,
  }
}
