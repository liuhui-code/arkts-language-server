import { digest, locationKey, normalizeLocations, queryOffset } from "./input.mjs"

// This process deliberately imports no compiler or LanguageService and no answer cache.
export function queryFacts(facts, queries) {
  if (facts.schemaVersion !== 1 || !["public-checker-binding-projection-v1",
    "resolved-signature-explicit-constructor-v2", "compiler-bulk-reference-groups-v3",
    "compiler-bulk-reference-groups-v4", "compiler-origin-reference-groups-v5",
    "compiler-origin-reference-groups-v6"]
    .includes(facts.hypothesis)
    || facts.productionApproved !== false || !facts.files || !Array.isArray(facts.selections)
    || !Array.isArray(facts.occurrences)
    || (["compiler-origin-reference-groups-v5", "compiler-origin-reference-groups-v6"]
      .includes(facts.hypothesis)
      && !Array.isArray(facts.symbols))
    || (facts.hypothesis === "resolved-signature-explicit-constructor-v2"
      && (!Array.isArray(facts.unsupportedSelections)
        || !Array.isArray(facts.unsupportedConstructorKeys)))) throw new Error("invalid experimental facts")
  const started = process.hrtime.bigint()
  const isV2 = facts.hypothesis === "resolved-signature-explicit-constructor-v2"
  const isBulk = facts.hypothesis === "compiler-bulk-reference-groups-v3"
    || facts.hypothesis === "compiler-bulk-reference-groups-v4"
  const isOrigin = facts.hypothesis === "compiler-origin-reference-groups-v5"
    || facts.hypothesis === "compiler-origin-reference-groups-v6"
  const unsupportedConstructorKeys = new Set(isV2 ? facts.unsupportedConstructorKeys : [])
  const answers = queries.map((query) => {
    const offset = queryOffset(facts.files[query.file], query)
    if (isV2 && facts.unsupportedSelections.some((item) => item.file === query.file
      && item.start <= offset && offset < item.start + item.length)) {
      return { id: query.id, status: "UNSUPPORTED", locations: [] }
    }
    const candidates = facts.selections.filter((item) => item.file === query.file
      && item.start <= offset && offset < item.start + item.length)
    const selection = candidates[0]
    if (isOrigin && (candidates.length !== 1 || !selection?.keys?.length
      || facts.hypothesis === "compiler-origin-reference-groups-v5" && selection.keys.length !== 1
      || selection.keys.some((key) => !facts.symbols.some((symbol) => symbol.key === key)))) {
      return { id: query.id, status: "UNSUPPORTED", locations: [] }
    }
    if (isBulk && new Set(candidates.map(({ key }) => key)).size !== 1) {
      return { id: query.id, status: "UNSUPPORTED", locations: [] }
    }
    if (!selection || unsupportedConstructorKeys.has(selection.key)) {
      return { id: query.id, status: "UNSUPPORTED", locations: [] }
    }
    const keys = isOrigin ? selection.keys : [selection.key]
    const locations = facts.occurrences.filter((item) => keys.includes(item.key)
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
