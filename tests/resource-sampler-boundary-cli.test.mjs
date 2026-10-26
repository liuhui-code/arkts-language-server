import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { createProcessResourceProbe } from "./support/process-resource-probe.mjs"

test("Linux RSS sampling refreshes the CPU clock for a child born during the sample", async () => {
  let uptimeReads = 0
  const stat = (pid, parent, start, cpu) => {
    const fields = Array(21).fill("0")
    fields[0] = String(parent); fields[10] = String(cpu); fields[18] = String(start)
    return `${pid} (node) S ${fields.join(" ")}`
  }
  const files = new Map([
    ["/virtual-proc/410/stat", stat(410, 1, 5000, 1)],
    ["/virtual-proc/410/status", "VmRSS:\t2048 kB\n"],
    ["/virtual-proc/410/task/410/children", "411"],
    ["/virtual-proc/411/stat", stat(411, 410, 10005, 2)],
    ["/virtual-proc/411/status", "VmRSS:\t512 kB\n"],
    ["/virtual-proc/411/task/411/children", ""],
  ])
  const probe = createProcessResourceProbe({ platform: "linux", procRoot: "/virtual-proc",
    now: () => 4000, clockTicksPerSecond: 100, readFile: async file => {
      if (file === "/virtual-proc/uptime") return ++uptimeReads === 1 ? "100.00 50.00\n" : "100.20 50.00\n"
      assert.ok(files.has(file), file)
      return files.get(file)
    } })
  const sample = await probe.sample(await probe.identify(410))
  assert.deepEqual(sample.processes.map(({ pid, rssBytes }) => ({ pid, rssBytes })), [
    { pid: 410, rssBytes: 2097152 }, { pid: 411, rssBytes: 524288 },
  ])
  assert.equal(sample.processes[1].cpuPercent, 2 / 15 * 100)
  assert.equal(uptimeReads, 2, "refresh only the stale per-sample clock, never fabricate CPU lifetime")
})

test("Linux sampling still rejects a CPU clock inconsistent after the real clock refresh", async () => {
  let uptimeReads = 0
  const fields = Array(21).fill("0")
  fields[0] = "1"; fields[10] = "1"; fields[18] = "10005"
  const probe = createProcessResourceProbe({ platform: "linux", procRoot: "/virtual-proc",
    now: () => 4000, clockTicksPerSecond: 100, readFile: async file => {
      if (file === "/virtual-proc/uptime") { uptimeReads++; return "100.00 50.00\n" }
      if (file.endsWith("/stat")) return `410 (node) S ${fields.join(" ")}`
      if (file.endsWith("/status")) return "VmRSS:\t2048 kB\n"
      if (file.endsWith("/children")) return ""
      assert.fail(file)
    } })
  await assert.rejects(() => probe.sample({ pid: 410, startIdentity: "linux:10005" }), {
    code: "EPROBE_PARSE", message: "process 410 started after the reported uptime",
  })
  assert.equal(uptimeReads, 2)
})

test("Linux zero-lifetime CPU is explicitly unavailable while measured RSS stays usable", async () => {
  for (const [uptime, start] of [["100.05", "10005"], ["0.29", "29"], ["0.07", "7"]]) {
    for (const cpu of [0, 1]) {
      const fields = Array(21).fill("0")
      fields[0] = "1"; fields[10] = String(cpu); fields[18] = start
      const probe = createProcessResourceProbe({ platform: "linux", procRoot: "/virtual-proc",
        now: () => 4000, clockTicksPerSecond: 100, readFile: async file => {
          if (file === "/virtual-proc/uptime") return `${uptime} 50.00\n`
          if (file.endsWith("/stat")) return `410 (node) S ${fields.join(" ")}`
          if (file.endsWith("/status")) return "VmRSS:\t2048 kB\n"
          if (file.endsWith("/children")) return ""
          assert.fail(file)
        } })
      const sample = await probe.sample({ pid: 410, startIdentity: `linux:${start}` })
      assert.equal(sample.processes[0].rssBytes, 2097152)
      assert.equal(sample.processes[0].cpuPercent, null)
      assert.equal(sample.processes[0].cpuPercentUnavailableReason, "lifetime-below-clock-resolution")
    }
  }
})

test("a real RSS snapshot crossing a task boundary retains its actual completion interval",
  { timeout: 20_000 }, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-rss-boundary-"))
    const output = path.join(root, "rss.jsonl")
    const targetCode = `
      const fs = require("node:fs"), path = require("node:path");
      const { spawn } = require("node:child_process");
      const root = ${JSON.stringify(root)};
      let child;
      const interval = setInterval(() => {
        if (!fs.existsSync(path.join(root, "sample-started.json"))) return;
        clearInterval(interval);
        setTimeout(() => {
          const queryCompleteTimestamp = Date.now();
          child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
          child.once("spawn", () => fs.writeFileSync(path.join(root, "post-window-child.json"),
            JSON.stringify({ pid: child.pid, queryCompleteTimestamp, spawnedAt: Date.now() })));
        }, 10);
      }, 5);
      process.once("SIGTERM", () => {
        clearInterval(interval);
        if (!child) process.exit(0);
        child.once("close", () => process.exit(0)); child.kill("SIGTERM");
      });
    `
    const target = spawn(process.execPath, ["-e", targetCode], { stdio: "ignore" })
    const targetClosed = once(target, "close")
    const sampler = spawn(process.execPath, ["--require", path.resolve("tests/fixtures/rss-sample-boundary.cjs"),
      path.resolve("scripts/bench/sample-process-tree-rss.mjs"), String(target.pid), output, "10"], {
      stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, ARKTS_TEST_RSS_BOUNDARY_CONTROL: root },
    })
    const samplerClosed = once(sampler, "close")
    let stderr = ""
    sampler.stderr.on("data", chunk => { stderr += chunk })
    t.after(async () => {
      if (sampler.exitCode === null && sampler.signalCode === null) sampler.kill("SIGINT")
      await samplerClosed
      if (target.exitCode === null) target.kill("SIGTERM")
      await targetClosed
      fs.rmSync(root, { recursive: true, force: true })
    })
    const read = () => fs.existsSync(output) ? fs.readFileSync(output, "utf8").trim().split("\n")
      .filter(Boolean).map(JSON.parse) : []
    const deadline = performance.now() + 10_000
    while (read().length < 2 && sampler.exitCode === null && sampler.signalCode === null
      && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
    if (sampler.exitCode === null && sampler.signalCode === null) sampler.kill("SIGINT")
    const exit = await samplerClosed
    if (!["darwin", "linux"].includes(process.platform)) {
      assert.deepEqual(exit, [2, null], stderr)
      assert.match(stderr, /unsupported/u)
      return
    }
    assert.deepEqual(exit, [0, null], stderr)
    const child = JSON.parse(fs.readFileSync(path.join(root, "post-window-child.json")))
    const samples = read()
    assert.ok(samples.length >= 2, JSON.stringify(samples))
    const crossing = samples[0]
    console.log(JSON.stringify({ queryCompleteTimestamp: child.queryCompleteTimestamp,
      spawnedAt: child.spawnedAt, crossing, scope: "SAMPLER_BOUNDARY_ONLY_NOT_PRODUCT_TIMING" }))
    assert.ok(crossing.timestamp <= child.queryCompleteTimestamp, "real read started inside the old task")
    assert.ok(crossing.processes.some(process => process.pid === child.pid && process.rssBytes > 0),
      "actual OS read includes the known post-task child, not a fabricated process")
    assert.ok(crossing.completedTimestamp >= child.spawnedAt,
      "retain completion of the real OS read, not just its earlier start timestamp")
    assert.ok(crossing.completedTimestamp > child.queryCompleteTimestamp,
      "a straddling snapshot cannot certify the old task's process set")
    assert.ok(crossing.completedMonotonicMs >= crossing.monotonicMs,
      "sample duration uses one genuine sampler clock")
    assert.ok(samples.every(sample => sample.completedMonotonicMs >= sample.monotonicMs))
  })
