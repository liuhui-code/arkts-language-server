import assert from "node:assert/strict"

/** A reset before proof consumption is as safe as explicit rejection of that proof. */
export function assertFreshResidentAdmission(route, admissions, firstTraceId, observation) {
  const miss = route.findIndex(event => event.event === "references.resident.miss"
    && event.traceId === firstTraceId)
  assert.ok(miss >= 0, JSON.stringify(observation))
  const rejected = route.findIndex(event => event.event === "references.resident.proof.rejected"
    && event.traceId === firstTraceId)
  const reset = route.findIndex((event, index) => index > miss
    && event.event === "semantic.prepare.complete" && event.resetReason === "content-revision-change")
  assert.ok(rejected >= 0 || reset > miss,
    "changed input must reject the old proof or replace its owner before any reuse")
  for (const hit of admissions.filter(event => event.event === "references.resident.hit")) {
    assert.ok(observation.rpcs.some(rpc => rpc.traceId === hit.traceId), JSON.stringify(observation))
    const hitIndex = route.indexOf(hit)
    const invalidated = rejected >= 0 ? rejected : miss
    const prepared = route.findIndex((event, index) => index > invalidated && index < hitIndex
      && event.event === "semantic.prepare.complete")
    const rebuilt = route.findIndex((event, index) => index > prepared && index < hitIndex
      && event.event === "semantic.context.cost" && event.reason === "compiler-build")
    assert.ok(prepared > invalidated && rebuilt > prepared,
      "resident reuse after invalidation requires a fresh prepare and actual compiler build")
  }
}
