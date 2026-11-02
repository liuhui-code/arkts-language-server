import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { waitForSamplerExit } from "../scripts/bench/sampler-shutdown.mjs"

// Real target and RSS sampler; the fixture controls only its post-flush exit.
// This is the cleanup module contract, not a 100-edit Settings CLI acceptance run.
for (const [outcome, intervalMs, expected] of [
  ["normal", 50, { code: 0, signal: null }],
  ["error", 50, { code: 9, signal: null }],
  ["hang", 50, { code: null, signal: "SIGTERM" }],
  ["interval", 6000, { code: 0, signal: null }],
]) {
  test(`sampler shutdown preserves ${outcome} outcome at ${intervalMs}ms cadence`,
    { timeout: 20_000 }, async t => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-cancel-fixture-"))
      const samples = path.join(directory, "samples.jsonl")
      const marker = path.join(directory, "sampler-exiting.json")
      const target = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })
      const targetClosed = once(target, "close")
      const sampler = spawn(process.execPath, ["--require", path.resolve("tests/fixtures/rss-sampler-close-race.cjs"),
        path.resolve("scripts/bench/sample-process-tree-rss.mjs"), String(target.pid), samples, String(intervalMs)], {
        stdio: ["ignore", "ignore", "pipe"], env: { ...process.env,
          RSS_TEST_CLOSE_RACE: marker, RSS_TEST_CLOSE_OUTCOME: outcome },
      })
      const samplerClosed = once(sampler, "close")
      let stderr = ""
      sampler.stderr.setEncoding("utf8")
      sampler.stderr.on("data", chunk => { stderr += chunk })
      t.after(async () => {
        if (target.exitCode === null && target.signalCode === null) target.kill("SIGKILL")
        if (sampler.exitCode === null && sampler.signalCode === null) sampler.kill("SIGKILL")
        await Promise.all([targetClosed, samplerClosed])
        fs.rmSync(directory, { recursive: true, force: true })
      })
      if (!["linux", "darwin"].includes(process.platform)) {
        const [code, signal] = await samplerClosed
        assert.deepEqual({ code, signal }, { code: 2, signal: null })
        assert.match(stderr, /external RSS sampling is unsupported/u)
        await waitForSamplerExit(sampler, intervalMs)
        assert.equal(sampler.exitCode, 2)
        return
      }
      await until(() => fs.existsSync(samples) && fs.statSync(samples).size > 0)
      target.kill("SIGTERM")
      await targetClosed
      const targetExitedAt = performance.now()
      // For the long-interval control start waiting immediately, proving the
      // grace period respects polling cadence, not just an already-exiting child.
      if (outcome !== "interval") await until(() => fs.existsSync(marker))
      const signals = []
      const cleanupStartedAt = performance.now()
      const kill = sampler.kill.bind(sampler)
      sampler.kill = signal => {
        signals.push({ signal, elapsedMs: performance.now() - cleanupStartedAt })
        return kill(signal)
      }
      await waitForSamplerExit(sampler, intervalMs)
      const [code, signal] = await samplerClosed
      fs.writeFileSync(path.join(directory, "cleanup-timeline.json"), JSON.stringify({
        targetPid: target.pid, samplerPid: sampler.pid, targetExitedAt, cleanupStartedAt,
        closedAt: performance.now(), intervalMs, signals, code, signal,
      }, null, 2))
      assert.equal(stderr, "")
      assert.deepEqual({ code, signal }, expected)
      if (outcome === "interval") {
        // Scheduling/IO may delay natural exit past the grace period. The
        // contract forbids premature signals, not all legitimate fallbacks.
        // Allow at most 1ms for Node timer rounding, never an early budget.
        assert.ok(signals.length <= 1
          && signals.every(event => event.signal === "SIGTERM" && event.elapsedMs + 1 >= 7000),
          JSON.stringify(signals))
      } else assert.deepEqual(signals.map(event => event.signal), outcome === "hang" ? ["SIGTERM"] : [])
      assert.throws(() => process.kill(sampler.pid, 0), { code: "ESRCH" })
      assert.equal(JSON.parse(fs.readFileSync(marker)).phase, "flushed-exiting")
      assert.ok(fs.readFileSync(samples, "utf8").trim().split("\n")
        .every(line => JSON.parse(line).processes.some(item => item.pid === target.pid)))
      // Already-exited children must be idempotent and must not receive signals.
      const signalCount = signals.length
      await waitForSamplerExit(sampler, intervalMs)
      assert.equal(signals.length, signalCount)
    })
}

async function until(predicate) {
  const deadline = performance.now() + 10_000
  while (!predicate()) {
    assert.ok(performance.now() < deadline, "sampler did not reach the required real-process boundary")
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
