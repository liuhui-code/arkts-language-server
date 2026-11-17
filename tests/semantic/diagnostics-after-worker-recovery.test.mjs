import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { initializeReadinessFixture, createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { diagnostic, waitForEvent } from "../support/semantic-recycle-lsp.mjs"

test("successful Worker recovery republishes an interrupted diagnosis without another editor event", { timeout: 30_000 }, async t => {
  const f = createReadinessFixture(t, {
    ARKTS_TEST_WORKER_DIAGNOSE_HOLD_MS: "1500",
    ARKTS_TEST_WORKER_DIAGNOSE_HOLD_URI_SUFFIX: "Main.ets",
    NODE_OPTIONS: "--require=" + JSON.stringify(path.resolve("tests/fixtures/unresponsive-semantic-worker.cjs")),
  })
  await initializeReadinessFixture(f)
  const uri = f.uri("Main.ets")
  const text = `${f.sources["Main.ets"]}\nmissingAfterReplacement\n`
  f.session.openDocument({ uri, version: 1, text })
  await waitForEvent(path.join(f.directory, "logs"), row => row.event === "semantic.test.diagnose.hold.start")
  fs.writeFileSync(path.join(f.directory, "unresponsive-fault.json"), JSON.stringify({ stage: "exit", remaining: 1 }))
  await waitForEvent(path.join(f.directory, "logs"), row => row.event === "semantic.worker.recovery.complete")
  const result = await diagnostic(f.session, uri, 1)
  assert.ok(result.params.diagnostics.some(entry => entry.code === 2304
    && entry.message.includes("missingAfterReplacement")), JSON.stringify(result))
  assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 2)
  assert.deepEqual((await f.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
})
