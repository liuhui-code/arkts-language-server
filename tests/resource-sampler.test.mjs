import assert from "node:assert/strict"
import test from "node:test"

import { createResourceSampler } from "./support/resource-sampler.mjs"

test("periodically records JSON-safe RSS and CPU samples for the explicit PID set", async () => {
  const clock = createManualClock(1_000)
  const probedPidSets = []
  const sampler = createResourceSampler({
    pids: [42, 7, 42],
    intervalMs: 250,
    clock,
    probe: async (pids) => {
      probedPidSets.push(pids)
      return pids.map((pid) => ({
        pid,
        rssBytes: pid * 100 + probedPidSets.length,
        cpuPercent: probedPidSets.length,
      }))
    },
  })

  await Promise.all([sampler.start(), sampler.start()])
  await clock.advance(250)

  assert.deepEqual(probedPidSets, [[7, 42], [7, 42]])
  assert.deepEqual(clock.intervals, [250])
  assert.deepEqual(sampler.snapshot(), [
    {
      timestamp: 1_000,
      processes: [
        { pid: 7, rssBytes: 701, cpuPercent: 1 },
        { pid: 42, rssBytes: 4_201, cpuPercent: 1 },
      ],
    },
    {
      timestamp: 1_250,
      processes: [
        { pid: 7, rssBytes: 702, cpuPercent: 2 },
        { pid: 42, rssBytes: 4_202, cpuPercent: 2 },
      ],
    },
  ])
  assert.doesNotThrow(() => JSON.stringify(sampler.snapshot()))
  await sampler.stop()
})

test("stop is idempotent, waits for an in-flight probe, and prevents later samples", async () => {
  const clock = createManualClock(2_000)
  let probeCount = 0
  let releaseProbe
  const sampler = createResourceSampler({
    pids: [9],
    intervalMs: 100,
    clock,
    probe: async ([pid]) => {
      probeCount += 1
      if (probeCount === 1) return [{ pid, rssBytes: 900, cpuPercent: 1 }]
      return new Promise((resolve) => {
        releaseProbe = () => resolve([{ pid, rssBytes: 950, cpuPercent: 2 }])
      })
    },
  })

  await sampler.start()
  const intervalProbe = clock.advance(100)
  await Promise.resolve()
  assert.equal(probeCount, 2)

  let stopped = false
  const firstStop = sampler.stop().then(() => {
    stopped = true
  })
  const secondStop = sampler.stop()
  await Promise.resolve()

  assert.equal(stopped, false)
  assert.equal(clock.activeTimerCount, 0)
  assert.equal(clock.clearCount, 1)

  releaseProbe()
  await Promise.all([intervalProbe, firstStop, secondStop])
  assert.equal(stopped, true)
  assert.equal(sampler.snapshot().length, 2)

  await clock.advance(100)
  await sampler.stop()
  assert.equal(probeCount, 2)
  assert.equal(clock.clearCount, 1)
})

test("records a controlled probe error, recovers, and does not leak its timer", async () => {
  const clock = createManualClock(3_000)
  let probeCount = 0
  const probeFailure = Object.assign(new Error("resource probe failed"), {
    code: "EPROBE",
    stderr: "must-not-be-recorded",
    environment: { SECRET_TOKEN: "must-not-be-recorded" },
  })
  const sampler = createResourceSampler({
    pids: [12],
    intervalMs: 50,
    clock,
    probe: async ([pid]) => {
      probeCount += 1
      if (probeCount === 1) throw probeFailure
      return [{ pid, rssBytes: 1_024, cpuPercent: 0.5 }]
    },
  })

  await sampler.start()
  assert.deepEqual(sampler.snapshot(), [{
    timestamp: 3_000,
    error: {
      name: "Error",
      message: "resource probe failed",
      code: "EPROBE",
    },
  }])

  await clock.advance(50)
  assert.deepEqual(sampler.snapshot()[1], {
    timestamp: 3_050,
    processes: [{ pid: 12, rssBytes: 1_024, cpuPercent: 0.5 }],
  })
  assert.doesNotMatch(JSON.stringify(sampler.snapshot()), /stderr|SECRET_TOKEN|must-not-be-recorded/)

  await sampler.stop()
  await clock.advance(50)
  assert.equal(probeCount, 2)
  assert.equal(clock.activeTimerCount, 0)
})

function createManualClock(initialTimestamp) {
  let timestamp = initialTimestamp
  let nextTimerId = 1
  let clearCount = 0
  const timers = new Map()
  const intervals = []

  return {
    intervals,
    now: () => timestamp,
    setInterval(callback, intervalMs) {
      const id = nextTimerId++
      intervals.push(intervalMs)
      timers.set(id, callback)
      return id
    },
    clearInterval(id) {
      clearCount += 1
      timers.delete(id)
    },
    async advance(milliseconds) {
      timestamp += milliseconds
      await Promise.all([...timers.values()].map((callback) => callback()))
    },
    get activeTimerCount() {
      return timers.size
    },
    get clearCount() {
      return clearCount
    },
  }
}
