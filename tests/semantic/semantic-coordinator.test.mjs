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
