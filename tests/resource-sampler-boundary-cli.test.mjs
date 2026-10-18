import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

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
