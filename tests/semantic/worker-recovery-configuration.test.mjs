import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import test from "node:test"
import { auditFixture, until } from "../support/worker-recovery-audit.mjs"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("SDK configuration received during replay controls the exact definition target", { timeout: 25000 }, async t => {
  const f = await auditFixture(t, "sdk-during-replay")
  const main = "export const result = selectedSDK()\n"
  const declaration = "declare function selectedSDK(): number\n"
  fs.writeFileSync(path.join(f.workspace, "Main.ets"), main)
  fs.writeFileSync(path.join(f.sdk, "ets/component/common.d.ts"), declaration)
  const sdkB = path.join(f.directory, "sdk-b")
  fs.cpSync(f.sdk, sdkB, { recursive: true })
  const declarationB = path.join(sdkB, "ets/component/common.d.ts")
  fs.writeFileSync(declarationB, "// alternate SDK\n" + declaration)
  await f.initialize()
  f.report.observations.baseline = await f.readiness()
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: main })
  await f.readiness()
  f.write("unresponsive-fault.json", { stage: "mutation", remaining: 1, then: "startup" })
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 2, text: "// trigger\n" + main })
  await until(() => {
    try { return f.read("unresponsive-entered.json").stage === "startup" } catch { return false }
  }, "replacement startup with original SDK")
  f.configure(sdkB)
  await f.barrier()
  f.release()
  const definition = await f.definition("Main.ets", 1, main.indexOf("selectedSDK") + 2)
  f.report.observations.final = await f.readiness()
  const character = declaration.indexOf("selectedSDK")
  assert.deepEqual(definition.result, [{ uri: pathToFileURL(declarationB).href, range: {
    start: { line: 1, character }, end: { line: 1, character: character + "selectedSDK".length },
  } }], JSON.stringify(definition))
  assert.notEqual(f.report.observations.final.result?.inputIdentity?.sdkSha256,
    f.report.observations.baseline.result?.inputIdentity?.sdkSha256)
})

test("explicit readiness cannot publish READY for a superseded SDK configuration", { timeout: 25000 }, async t => {
  const f = await auditFixture(t, "sdk-during-preparation")
  await f.initialize()
  f.report.observations.baseline = await f.readiness()
  f.configure()
  await f.readiness(false)
  f.write("audit-controls.json", { gate: { stage: "checker", remaining: 1 } })
  const pending = f.readiness()
  await until(() => fs.existsSync(path.join(f.directory, "audit-gate-entered.json")), "compiler checker gate")
  f.configure(path.join(f.directory, "missing-explicit-sdk"))
  await f.barrier()
  f.release()
  f.report.observations.overlapping = await pending
  f.report.observations.afterConfiguration = await f.readiness()
  f.configure()
  f.report.observations.restored = await f.readiness()
  assert.notEqual(f.report.observations.afterConfiguration.result?.semanticState, "ready")
  assert.equal(f.report.observations.restored.result?.semanticState, "ready")
  assert.notEqual(f.report.observations.overlapping.result?.semanticState, "ready",
    "a readiness certificate whose SDK was superseded before publication cannot certify current inputs")
})

for (const mode of ["configuration", "overflow"]) {
  test(`${mode}-collapsed file changes unlock one recovery probe without bypassing its rate budget`,
    { timeout: 25_000 }, async t => {
      const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
        NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/unresponsive-semantic-worker.cjs"))}` })
      const fault = (remaining, clockOffset = 0) => fs.writeFileSync(path.join(f.directory, "unresponsive-fault.json"),
        JSON.stringify({ stage: "exit", remaining, clockOffset }))
      const starts = () => f.events().filter(event => event.event === "semantic.worker.started").length
      const probes = () => f.events().filter(event => event.event === "semantic.worker.recovery.half-open").length
      const readiness = prepare => f.session.request("arkts/semanticReadiness", { rootUri: f.rootUri, prepare })
      const params = { textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 23 } }
      const definition = () => f.session.request("textDocument/definition", params, { timeoutMs: 10_000 })
      fs.writeFileSync(path.join(f.workspace, "oh-package.json5"), '{"name":"recovery-test","version":"1.0.0"}\n')
      await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
      await f.session.transport.notification("arkts/semanticPreparation", message => message.params.phase === "complete", 10_000)
      assert.deepEqual((await definition()).result, [{ uri: f.uri("Unopened.ets"), range: {
        start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
      } }])
      // The original shared budget, not a private recovery shortcut, establishes the stopped state.
      for (let count = 1; count <= 4; count++) {
        fault(1)
        await until(() => count < 4
          ? f.events().filter(event => event.event === "semantic.worker.recovery.complete").length === count
          : f.events().some(event => event.event === "semantic.worker.recovery.stopped"), `worker failure ${count}`)
      }
      await until(() => f.events().some(event => event.event === "semantic.worker.recovery.retired"), "stopped worker exit")
      fault(0)
      fs.writeFileSync(path.join(f.workspace, "Unopened.ets"), "// corrected disk input\n" + f.sources["Unopened.ets"])
      const changes = [{ uri: f.uri("Unopened.ets"), type: 2 }]
      if (mode === "configuration") {
        fs.writeFileSync(path.join(f.workspace, "oh-package.json5"), '{"name":"recovery-test","version":"1.0.1"}\n')
        changes.push({ uri: f.uri("oh-package.json5"), type: 2 })
      } else {
        for (let index = 0; index < 1024; index++) {
          const name = `Batch${index}.ts`
          fs.writeFileSync(path.join(f.workspace, name), `export const batch${index} = ${index}\n`)
          changes.push({ uri: f.uri(name), type: 1 })
        }
      }
      f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: { changes } })
      const rateLimited = await definition()
      assert.match(rateLimited.error?.message ?? "", /Semantic worker unavailable/)
      assert.equal(starts(), 4, "changed inputs cannot exceed three recoveries in the current rate window")
      assert.equal(probes(), 0)
      fault(0, 181_000) // Expire only the rate window; time alone must not qualify an unchanged input.
      assert.equal((await readiness(false)).error?.code, -32803, "read-only status cannot spend a probe")
      assert.equal(starts(), 4)
      assert.equal(probes(), 0)
      const expected = [{ uri: f.uri("Unopened.ets"), range: {
        start: { line: 1, character: 16 }, end: { line: 1, character: 28 },
      } }]
      const recovered = await definition()
      assert.deepEqual(recovered.result, expected, JSON.stringify(recovered))
      assert.deepEqual((await definition()).result, expected)
      assert.equal(starts(), 5, "one admitted physical replacement serves both corrected queries")
      assert.equal(probes(), 1)
      assert.deepEqual((await f.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
      const lifetime = fs.readFileSync(path.join(f.directory, "worker-lifetime.ndjson"), "utf8")
        .trim().split("\n").map(JSON.parse)
      assert.deepEqual(lifetime.map(event => event.event), Array.from({ length: 5 }, () => ["created", "exited"]).flat())
    })
}

test("empty or rejected file events cannot unlock stopped recovery after the rate window expires",
  { timeout: 20_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/unresponsive-semantic-worker.cjs"))}` })
    const fault = (remaining, clockOffset = 0) => fs.writeFileSync(path.join(f.directory, "unresponsive-fault.json"),
      JSON.stringify({ stage: "exit", remaining, clockOffset }))
    const starts = () => f.events().filter(event => event.event === "semantic.worker.started").length
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", message => message.params.phase === "complete", 10_000)
    for (let count = 1; count <= 4; count++) {
      fault(1)
      await until(() => count < 4
        ? f.events().filter(event => event.event === "semantic.worker.recovery.complete").length === count
        : f.events().some(event => event.event === "semantic.worker.recovery.stopped"), `worker failure ${count}`)
    }
    await until(() => f.events().some(event => event.event === "semantic.worker.recovery.retired"), "stopped worker exit")
    fault(0, 181_000)
    const outside = path.join(f.directory, "Outside.ets")
    fs.writeFileSync(outside, "export const outside = 1\n")
    const params = { textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 23 } }
    for (const changes of [[], [{ uri: "file:///%ZZ.ets", type: 2 }],
      [{ uri: f.uri("Unopened.ets"), type: 999 }], [{ uri: pathToFileURL(outside).href, type: 2 }]]) {
      f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: { changes } })
      const response = await f.session.request("textDocument/definition", params)
      assert.match(response.error?.message ?? "", /Semantic worker unavailable/, JSON.stringify({ changes, response }))
      assert.equal(starts(), 4)
      assert.equal(f.events().some(event => event.event === "semantic.worker.recovery.half-open"), false)
    }
    fs.writeFileSync(path.join(f.workspace, "Unopened.ets"), "// real accepted input\n" + f.sources["Unopened.ets"])
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: f.uri("Unopened.ets"), type: 2 }] } })
    const current = await f.session.request("textDocument/definition", params, { timeoutMs: 10_000 })
    assert.deepEqual(current.result, [{ uri: f.uri("Unopened.ets"), range: {
      start: { line: 1, character: 16 }, end: { line: 1, character: 28 },
    } }], JSON.stringify(current))
    assert.equal(starts(), 5)
    assert.deepEqual((await f.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
  })
