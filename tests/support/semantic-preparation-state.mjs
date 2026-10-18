import assert from "node:assert/strict"

/** Establish a genuinely cold post-initialization owner through public protocol controls. */
export async function releasePreparedOwner(session, rootUri) {
  await session.transport.notification("arkts/semanticPreparation",
    message => message.params.rootUri === rootUri && message.params.phase === "complete", 20_000)
  const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
  assert.deepEqual(pressure.result, { applied: "level3" }, JSON.stringify(pressure))
  const cold = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
  assert.equal(cold.error, undefined, JSON.stringify(cold))
  assert.notEqual(cold.result?.semanticState, "ready", "the real pressure control must release the prepared owner")
}

export function assertColdOwnerRecovery(events) {
  const miss = events.findIndex(event => event.event === "references.resident.miss")
  const create = events.findIndex(event => event.event === "semantic.context.create")
  assert.ok(miss >= 0 && create > miss, "proof-only lookup must miss before a real replacement owner is prepared")
  assert.ok(!events.slice(0, create).some(event => event.event === "references.resident.hit"),
    "an evicted or absent owner cannot answer through resident reuse")
  assert.ok(events.slice(create).some(event => event.event === "semantic.references.complete"),
    "replacement must execute the complete compiler query")
}
