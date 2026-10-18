import assert from "node:assert/strict"
import { createRequire } from "node:module"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { buildSync } from "esbuild"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

test("the committed semantic runtime configuration fixes one worker and two contexts", () => {
  const config = JSON.parse(fs.readFileSync(
    path.join(projectRoot, "config", "semantic-runtime.json"),
    "utf8",
  ))

  assert.equal(config.schemaVersion, 1)
  assert.equal(config.semanticWorkers, 1)
  assert.equal(config.maxResidentContexts, 2)
  assert.ok(config.level1Ratio < config.level2Ratio)
  assert.ok(config.level2Ratio < config.level3Ratio)
  assert.ok(config.level3TargetRatio < config.level3Ratio)
})

test("runtime pressure defaults to four GiB and accepts an explicit MiB override", t => {
  const { semanticRuntimeConfig } = buildCoordinatorDriver(t)
  assert.equal(semanticRuntimeConfig({}).memoryBudgetBytes, 4096 * 1024 * 1024)
  assert.equal(semanticRuntimeConfig({ ARKTS_MEMORY_BUDGET_MB: "768" }).memoryBudgetBytes, 768 * 1024 * 1024)
  for (const value of ["0", "-1", "NaN", "Infinity"]) {
    assert.throws(() => semanticRuntimeConfig({ ARKTS_MEMORY_BUDGET_MB: value }), /must be.*positive/)
  }
})

test("an active lease pins its context through level 3 pressure", (t) => {
  const { SemanticCoordinator } = buildCoordinatorDriver(t)
  const events = []
  const coordinator = new SemanticCoordinator({
    maxResidentContexts: 2,
    createContext: contextFactory(events, new Map()),
  })

  const lease = coordinator.acquire("project-a")
  coordinator.applyMemoryPressure("level3")

  assert.deepEqual(events, ["create:project-a"])
  assert.equal(coordinator.stats().leaseCount, 1)
  assert.equal(coordinator.stats().residentContextCount, 1)
  lease.release()
  coordinator.applyMemoryPressure("level3")
  assert.deepEqual(events, ["create:project-a", "dispose:project-a"])
})

test("level 2 trims cold contexts before level 3 disposes them", (t) => {
  const { SemanticCoordinator } = buildCoordinatorDriver(t)
  const events = []
  const coordinator = new SemanticCoordinator({
    maxResidentContexts: 2,
    createContext: contextFactory(events, new Map()),
  })

  coordinator.acquire("project-a").release()
  coordinator.applyMemoryPressure("level2")
  coordinator.applyMemoryPressure("level3")

  assert.deepEqual(events, [
    "create:project-a",
    "trim:project-a",
    "dispose:project-a",
  ])
})

test("the resident set stays bounded and evicts the least recently used unleased context", (t) => {
  const { SemanticCoordinator } = buildCoordinatorDriver(t)
  const events = []
  const coordinator = new SemanticCoordinator({
    maxResidentContexts: 2,
    createContext: contextFactory(events, new Map()),
  })

  coordinator.acquire("project-a").release()
  coordinator.acquire("project-b").release()
  coordinator.acquire("project-b").release()
  coordinator.acquire("project-c").release()

  assert.equal(coordinator.stats().residentContextCount, 2)
  assert.deepEqual(coordinator.contextIds(), ["project-b", "project-c"])
  assert.ok(events.includes("dispose:project-a"))
})

test("a disposed context rebuilds from the latest document authority overlay", (t) => {
  const { SemanticCoordinator } = buildCoordinatorDriver(t)
  const authority = new Map([["project-a", "overlay-v1"]])
  const events = []
  const coordinator = new SemanticCoordinator({
    maxResidentContexts: 2,
    createContext: contextFactory(events, authority),
  })

  const first = coordinator.acquire("project-a")
  assert.equal(first.context.overlay, "overlay-v1")
  first.release()
  coordinator.applyMemoryPressure("level3")

  authority.set("project-a", "overlay-v2")
  const rebuilt = coordinator.acquire("project-a")
  assert.equal(rebuilt.context.overlay, "overlay-v2")
  rebuilt.release()
  assert.deepEqual(events, [
    "create:project-a",
    "dispose:project-a",
    "create:project-a",
  ])
})

test("LRU pressure eviction stops when live memory leaves level three", t => {
  const { SemanticCoordinator } = buildCoordinatorDriver(t)
  const events = []
  const coordinator = new SemanticCoordinator({ maxResidentContexts: 2,
    createContext: contextFactory(events, new Map()), readMemoryPressure: () => "level1" })
  coordinator.acquire("a").release()
  coordinator.acquire("b").release()
  assert.equal(coordinator.applyMemoryPressure("level3"), "level1")
  assert.deepEqual(events.filter(event => event.startsWith("dispose:")), ["dispose:a"])
  assert.deepEqual(coordinator.contextIds(), ["b"])
})

test("one retained scan slot cannot evict the two recent interaction groups", t => {
  const { SemanticCoordinator } = buildCoordinatorDriver(t)
  const events = []
  const coordinator = new SemanticCoordinator({
    maxResidentContexts: 2, isScanContext: id => id.startsWith("scan:"),
    createContext: contextFactory(events, new Map()),
  })
  coordinator.acquire("a").release()
  coordinator.acquire("b").release()
  coordinator.acquire("scan:one").release()
  coordinator.acquire("scan:two").release()
  assert.deepEqual(coordinator.contextIds(), ["a", "b", "scan:two"])
  assert.deepEqual(events.filter(event => event.startsWith("dispose:")), ["dispose:scan:one"])
  const active = coordinator.acquire("a")
  coordinator.acquire("c").release()
  assert.equal(coordinator.peek("b"), undefined)
  assert.ok(coordinator.peek("a"))
  coordinator.applyMemoryPressure("level3")
  assert.deepEqual(coordinator.contextIds(), ["a"])
  active.release()
})

test("background leases protect execution without promoting interaction recency", t => {
  const { SemanticCoordinator } = buildCoordinatorDriver(t)
  const coordinator = new SemanticCoordinator({ maxResidentContexts: 2,
    createContext: contextFactory([], new Map()) })
  for (const id of ["a", "b", "a"]) coordinator.acquire(id).release()
  coordinator.acquire("b", false).release()
  coordinator.acquire("c").release()
  assert.deepEqual(coordinator.contextIds(), ["a", "c"])
})

test("memory policy maps the configured ratios to levels without double-counting workers", (t) => {
  const { SemanticMemoryPolicy, semanticRuntimeMetrics } = buildCoordinatorDriver(t)
  const config = JSON.parse(fs.readFileSync(
    path.join(projectRoot, "config", "semantic-runtime.json"),
    "utf8",
  ))
  const policy = new SemanticMemoryPolicy(config)
  const budget = 1_000

  assert.equal(policy.levelFor(699, budget), "level0")
  assert.equal(policy.levelFor(700, budget), "level1")
  assert.equal(policy.levelFor(820, budget), "level2")
  assert.equal(policy.levelFor(920, budget), "level3")
  assert.equal(policy.levelFor(900, budget), "level3")
  assert.equal(policy.levelFor(850, budget), "level3")
  assert.equal(policy.levelFor(849, budget), "level2")
  assert.equal(policy.levelFor(819, budget), "level1")

  assert.deepEqual(semanticRuntimeMetrics({
    memoryUsage: {
      rss: 101,
      heapTotal: 202,
      heapUsed: 303,
      external: 404,
      arrayBuffers: 505,
    },
    semanticWorkerCount: 1,
    residentContextCount: 2,
    projectFiles: 9,
    openDocuments: 3,
    leaseCount: 1,
  }), {
    rss: 101,
    heapTotal: 202,
    heapUsed: 303,
    external: 404,
    arrayBuffers: 505,
    semanticWorkerCount: 1,
    residentContextCount: 2,
    projectFiles: 9,
    openDocuments: 3,
    leaseCount: 1,
  })
})

test("twenty context rebuild and pressure cycles leave no resident context", (t) => {
  const { SemanticCoordinator } = buildCoordinatorDriver(t)
  const events = []
  const coordinator = new SemanticCoordinator({
    maxResidentContexts: 2,
    createContext: contextFactory(events, new Map()),
  })

  for (let cycle = 0; cycle < 20; cycle += 1) {
    coordinator.acquire(`project-${cycle}`).release()
    coordinator.applyMemoryPressure("level2")
    coordinator.applyMemoryPressure("level3")
    assert.equal(coordinator.stats().residentContextCount, 0)
  }

  assert.equal(events.filter((event) => event.startsWith("create:")).length, 20)
  assert.equal(events.filter((event) => event.startsWith("trim:")).length, 20)
  assert.equal(events.filter((event) => event.startsWith("dispose:")).length, 20)
})

test("equal measured rebuild costs retain the LRU decision and its truthful reason", t => {
  const { SemanticCoordinator } = buildCoordinatorDriver(t)
  const evictions = []
  const coordinator = new SemanticCoordinator({
    maxResidentContexts: 2, costAwareEviction: true,
    createContext: contextFactory([], new Map()),
    onLifecycle: (event, fields) => { if (event === "evict") evictions.push(fields) },
  })
  for (const id of ["a", "b"]) {
    const lease = coordinator.acquire(id)
    coordinator.recordRebuildCost(id, lease.context, 10)
    lease.release()
  }
  coordinator.acquire("c").release()
  assert.deepEqual(coordinator.contextIds(), ["b", "c"])
  assert.equal(evictions[0].reason, "capacity-lru")
})

test("missing, invalid and stale rebuild costs never fabricate a capacity ranking", t => {
  const { SemanticCoordinator } = buildCoordinatorDriver(t)
  const observed = []
  const coordinator = new SemanticCoordinator({
    maxResidentContexts: 2, costAwareEviction: true,
    createContext: contextFactory([], new Map()),
    onLifecycle: (event, fields) => observed.push({ event, ...fields }),
  })
  const a = coordinator.acquire("a")
  coordinator.recordRebuildCost("a", a.context, 100)
  a.release()
  const b = coordinator.acquire("b")
  for (const value of [0, -1, NaN, Infinity]) coordinator.recordRebuildCost("b", b.context, value)
  coordinator.recordRebuildCost("b", a.context, 1)
  b.release()
  coordinator.acquire("c").release()
  assert.deepEqual(coordinator.contextIds(), ["b", "c"])
  assert.equal(observed.find(event => event.event === "evict").reason, "capacity-lru")
  assert.equal(observed.filter(event => event.event === "cost").length, 1)
  const fresh = coordinator.acquire("a")
  coordinator.recordRebuildCost("a", a.context, 1)
  assert.equal(observed.filter(event => event.event === "cost").length, 1)
  coordinator.recordRebuildCost("a", fresh.context, 2)
  const costs = observed.filter(event => event.event === "cost")
  assert.equal(costs.length, 2)
  assert.notEqual(costs[0].contextSequence, costs[1].contextSequence)
  fresh.release()
})

test("cost selection never evicts leases and does not depend on a telemetry observer", t => {
  const { SemanticCoordinator } = buildCoordinatorDriver(t)
  const coordinator = new SemanticCoordinator({
    maxResidentContexts: 2, costAwareEviction: true,
    createContext: contextFactory([], new Map()),
  })
  const a = coordinator.acquire("a")
  coordinator.recordRebuildCost("a", a.context, 1)
  const b = coordinator.acquire("b")
  coordinator.recordRebuildCost("b", b.context, 100)
  b.release()
  const c = coordinator.acquire("c")
  assert.deepEqual(coordinator.contextIds(), ["a", "c"])
  assert.throws(() => coordinator.acquire("blocked"), /all semantic contexts are leased/)
  coordinator.recordRebuildCost("c", c.context, 5)
  c.release()
  coordinator.recordRebuildCost("a", a.context, 100)
  a.release()
  coordinator.acquire("d").release()
  assert.deepEqual(coordinator.contextIds(), ["a", "d"])
  coordinator.applyMemoryPressure("level3")
  assert.equal(coordinator.stats().residentContextCount, 0, "L3 ignores recovery cost and frees every unleased context")
})

test("cost-aware pressure disposal rechecks live bytes through the original hysteresis target", t => {
  const { SemanticCoordinator, SemanticMemoryPolicy } = buildCoordinatorDriver(t)
  const policy = new SemanticMemoryPolicy({
    level1Ratio: 0.70, level2Ratio: 0.82, level3Ratio: 0.92, level3TargetRatio: 0.85,
  })
  const observations = [900, 850, 849]
  const events = []
  const coordinator = new SemanticCoordinator({
    maxResidentContexts: 4, costAwareEviction: true,
    createContext: contextFactory(events, new Map()),
    readMemoryPressure: () => policy.levelFor(observations.shift(), 1000),
  })
  for (const [id, cost] of [["expensive", 1000], ["medium", 100], ["cheap", 10], ["cheapest", 1]]) {
    const lease = coordinator.acquire(id)
    coordinator.recordRebuildCost(id, lease.context, cost)
    lease.release()
  }
  assert.equal(coordinator.applyMemoryPressure(policy.levelFor(920, 1000)), "level2")
  assert.deepEqual(events.filter(event => event.startsWith("dispose:")),
    ["dispose:cheapest", "dispose:cheap", "dispose:medium"])
  assert.deepEqual(coordinator.contextIds(), ["expensive"])
  assert.deepEqual(observations, [], "RSS at the target remains L3; only below the target recovers")
})

test("persistent live pressure cannot be waived by expensive work and never evicts a lease", t => {
  const { SemanticCoordinator } = buildCoordinatorDriver(t)
  let reads = 0
  const coordinator = new SemanticCoordinator({
    maxResidentContexts: 2, costAwareEviction: true,
    createContext: contextFactory([], new Map()),
    readMemoryPressure: () => { reads += 1; return "level3" },
  })
  const active = coordinator.acquire("active")
  coordinator.recordRebuildCost("active", active.context, 1)
  const cold = coordinator.acquire("expensive")
  coordinator.recordRebuildCost("expensive", cold.context, 1000)
  cold.release()
  assert.equal(coordinator.applyMemoryPressure("level3"), "level3")
  assert.deepEqual(coordinator.contextIds(), ["active"])
  assert.equal(coordinator.stats().leaseCount, 1)
  active.release()
  assert.equal(coordinator.applyMemoryPressure("level3"), "level3")
  assert.equal(coordinator.stats().residentContextCount, 0)
  assert.equal(reads, 2, "disposed objects do not manufacture a low-pressure observation")
})

for (const [name, enabled, costs] of [
  ["missing cost", true, [100, undefined]],
  ["equal cost", true, [10, 10]],
  ["disabled policy", false, [100, 1]],
]) {
  test(`pressure recovery preserves the safe LRU fallback for ${name}`, t => {
    const { SemanticCoordinator } = buildCoordinatorDriver(t)
    const events = []
    let reads = 0
    const coordinator = new SemanticCoordinator({
      maxResidentContexts: 2, costAwareEviction: enabled,
      createContext: contextFactory(events, new Map()),
      readMemoryPressure: () => { reads += 1; return "level0" },
    })
    for (const [index, id] of ["old", "new"].entries()) {
      const lease = coordinator.acquire(id)
      if (costs[index] !== undefined) coordinator.recordRebuildCost(id, lease.context, costs[index])
      lease.release()
    }
    assert.equal(coordinator.applyMemoryPressure("level3"), "level0")
    assert.deepEqual(coordinator.contextIds(), ["new"])
    assert.equal(events.find(event => event.startsWith("dispose:")), "dispose:old")
    assert.equal(reads, 1, "pressure recovery does not depend on cost ranking")
  })
}

function contextFactory(events, authority) {
  return (contextId) => {
    events.push(`create:${contextId}`)
    return {
      overlay: authority.get(contextId),
      trim() { events.push(`trim:${contextId}`) },
      dispose() { events.push(`dispose:${contextId}`) },
      stats() { return { projectFiles: 0, openDocuments: 0 } },
    }
  }
}

function buildCoordinatorDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-semantic-coordinator-"))
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  const outfile = path.join(outputRoot, "semantic-coordinator.cjs")
  buildSync({
    stdin: {
      contents: [
        'export { SemanticCoordinator } from "./src/semantic/coordinator/semantic-coordinator.ts"',
        'export { SemanticMemoryPolicy } from "./src/semantic/coordinator/memory-policy.ts"',
        'export { semanticRuntimeConfig } from "./src/semantic/coordinator/runtime-config.ts"',
        'export { semanticRuntimeMetrics } from "./src/semantic/coordinator/metrics.ts"',
      ].join("\n"),
      resolveDir: projectRoot,
    },
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
  })
  return createRequire(import.meta.url)(outfile)
}
