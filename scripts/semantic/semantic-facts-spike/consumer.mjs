import { digest, locationKey, normalizeLocations, queryOffset } from "./input.mjs"

// This process deliberately imports no compiler or LanguageService and no answer cache.
export function queryFacts(facts, queries) {
  if (facts.schemaVersion !== 1 || facts.hypothesis !== "public-checker-binding-projection-v1"
    || facts.productionApproved !== false || !facts.files || !Array.isArray(facts.selections)
    || !Array.isArray(facts.occurrences)) throw new Error("invalid experimental facts")
  const started = process.hrtime.bigint()
  const answers = queries.map((query) => {
    const offset = queryOffset(facts.files[query.file], query)
    const selection = facts.selections.find((item) => item.file === query.file
      && item.start <= offset && offset < item.start + item.length)
    if (!selection) return { id: query.id, status: "UNSUPPORTED", locations: [] }
    const locations = facts.occurrences.filter((item) => item.key === selection.key
      && (query.includeDeclaration || !item.isCanonicalDeclaration)).map((item) => item.location)
    return { id: query.id, status: "HYPOTHESIS", locations: normalizeLocations(locations) }
  })
  return { answers, queriesSha256: digest(JSON.stringify(queries)),
    factsSha256: digest(JSON.stringify(facts)),
    metrics: { pid: process.pid, compilerLoaded: false, answerCacheEntries: 0,
    elapsedMs: Number(process.hrtime.bigint() - started) / 1e6 } }
}

export function compareAnswers(actual, expected, plannedIds = expected.map(({ id }) => id)) {
  const differences = []
  const planned = new Set(plannedIds)
  for (const [side, answers] of [["consumer", actual], ["oracle", expected]]) {
    const counts = new Map()
    for (const { id } of answers) counts.set(id, (counts.get(id) ?? 0) + 1)
    for (const [id, count] of counts) {
      if (!planned.has(id) || count !== 1) {
        differences.push({ id, status: "INVALID_DENOMINATOR", side, count, missing: [], extra: [] })
      }
    }
    for (const id of planned) {
      if (!counts.has(id)) differences.push({ id, status: "MISSING_QUERY", side, missing: [], extra: [] })
    }
  }
  for (const reference of expected) {
    const answer = actual.find(({ id }) => id === reference.id)
    const actualLocations = new Set((answer?.locations ?? []).map(locationKey))
    const expectedLocations = new Set(reference.locations.map(locationKey))
    const missing = reference.locations.filter((location) => !actualLocations.has(locationKey(location)))
    const extra = (answer?.locations ?? []).filter((location) => !expectedLocations.has(locationKey(location)))
    if (!answer || answer.status !== "HYPOTHESIS" || missing.length || extra.length) {
      differences.push({ id: reference.id, status: answer?.status ?? "MISSING", missing, extra })
    }
  }
  return differences
}
