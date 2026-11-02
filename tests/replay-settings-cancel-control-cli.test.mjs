import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { digestSdk } from "../scripts/semantic/lock-toolchain.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const runner = path.join(root, "scripts/bench/replay-settings-cancel-control.mjs")

function invoke(...args) { return invokeWithEnvironment({}, ...args) }

function invokeWithEnvironment(extraEnvironment, ...args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(
    ([key]) => !key.startsWith("ARKTS_"),
  ))
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: root, encoding: "utf8", timeout: 10_000, env: { ...env, ...extraEnvironment },
  })
}

test("Settings cancel control exposes the explicit public LSP experiment", () => {
  const result = invoke("--help")
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  for (const required of ["--workspace", "--sdk", "--out", "--manifest", "--oracle",
    "--session-reuse", "textDocument/references", "$/cancelRequest", "textDocument/definition"]) {
    assert.ok(result.stdout.includes(required), required)
  }
})

test("Settings cancel control refuses an output path inside its source checkout", t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-cancel-cli-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspace = path.join(temporary, "workspace")
  const sdk = path.join(temporary, "sdk")
  const output = path.join(workspace, "evidence", "cancel.json")
  fs.mkdirSync(workspace)
  fs.mkdirSync(sdk)
  const result = invoke("--workspace", workspace, "--sdk", sdk, "--out", output)
  assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stderr, /BENCHMARK_BLOCKED=OUTPUT_INSIDE_SOURCE/u)
  assert.equal(fs.existsSync(path.dirname(output)), false)
})

test("Settings cancel control preserves an existing report", t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-cancel-existing-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspace = path.join(temporary, "workspace")
  const sdk = path.join(temporary, "sdk")
  const output = path.join(temporary, "evidence.json")
  fs.mkdirSync(workspace)
  fs.mkdirSync(sdk)
  fs.writeFileSync(output, "untouched\n")
  const result = invoke("--workspace", workspace, "--sdk", sdk, "--out", output)
  assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stderr, /output already exists/u)
  assert.equal(fs.readFileSync(output, "utf8"), "untouched\n")
})

test("Settings cancel control refuses a dirty source checkout", t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-cancel-dirty-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspace = path.join(temporary, "workspace")
  const sdk = path.join(temporary, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(sdk)
  for (const args of [["init", "-q"], ["-c", "user.name=Test", "-c",
    "user.email=test@example.com", "commit", "--allow-empty", "-qm", "fixture"]]) {
    const result = spawnSync("git", ["-C", workspace, ...args], { encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
  }
  fs.writeFileSync(path.join(workspace, "untracked.txt"), "dirty\n")
  const result = invoke("--workspace", workspace, "--sdk", sdk,
    "--out", path.join(temporary, "report.json"))
  assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stderr, /BENCHMARK_BLOCKED=DIRTY_WORKSPACE/u)
  assert.equal(fs.readFileSync(path.join(workspace, "untracked.txt"), "utf8"), "dirty\n")
})

test("Settings cancel control cancels an observed batch and validates exact recovery", async t => {
  const fixture = await makeFixture(t, "cancel")
  const result = invoke(...fixture.args)
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.status, "PASS")
  assert.equal(report.cancellation.requestId, 2)
  assert.equal(report.cancellation.stage.state, "batch-scheduled")
  assert.equal(report.cancellation.evidenceScope, "batch-scheduled-before-verifier")
  assert.equal(report.cancellation.response.error.code, -32800)
  assert.equal("result" in report.cancellation.response, false)
  assert.equal(report.recovery.references.validation.observedCount, 9)
  assert.equal(report.recovery.references.validation.pass, true)
  assert.equal(report.recovery.definition.exact, true)
  assert.equal(report.diagnostic.exact, true)
  assert.equal(report.closeResult.exit.code, 0)
  assert.equal(report.sourcePreserved, true)
})

test("Settings cancel control observes a legacy queue start before cancellation", async t => {
  const fixture = await makeFixture(t, "legacy-cancel")
  const result = invoke(...fixture.args, "--strategy", "legacy")
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.status, "PASS")
  assert.equal(report.environment.effectiveArktsEnvironment.ARKTS_REFERENCES_STRATEGY, "legacy")
  assert.equal(report.cancellation.stage.state, "queue-start")
  assert.equal(report.cancellation.stage.event.event, "references.queue.start")
  assert.equal(report.cancellation.evidenceScope, "queue-start-before-full-result")
  assert.equal(report.cancellation.response.error.code, -32800)
  assert.equal("result" in report.cancellation.response, false)
  assert.equal(report.recovery.references.validation.pass, true)
  assert.equal(report.recovery.definition.exact, true)
  assert.equal(report.diagnostic.exact, true)
})

test("Settings cancel control requires an interrupted compiler query for the in-flight gate", async t => {
  const fixture = await makeFixture(t, "compiler-cancel")
  const result = invoke(...fixture.args, "--strategy", "legacy", "--cancel-stage", "compiler-query")
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(result.status, 0, JSON.stringify({ stderr: result.stderr, ...reportSummary(report) }))
  assert.equal(report.status, "PASS")
  assert.equal(report.cancellation.stage.state, "find-references-start")
  assert.equal(report.cancellation.stage.event.event, "references.find-references.start")
  assert.equal(report.cancellation.compilerQuery.outcome, "cancelled-in-flight")
  assert.equal(report.cancellation.compilerQuery.findReferences.outcome, "threw-cancellation")
  assert.equal(report.cancellation.response.error.code, -32800)
  assert.equal("result" in report.cancellation.response, false)
  assert.equal(report.recovery.references.validation.pass, true)
  assert.equal(report.recovery.definition.exact, true)
  assert.equal(report.diagnostic.exact, true)
})

for (const [mode, expected] of [["compiler-cancel", "PASS"], ["completed", "NOT_CANCELLED"]]) {
  test(`Settings cancel control preserves ${expected} when the sampler is already exiting`, async t => {
    const fixture = await makeFixture(t, mode)
    const marker = path.join(path.dirname(fixture.output), "sampler-exiting.json")
    const result = invokeWithEnvironment({ RSS_TEST_CLOSE_RACE: marker,
      NODE_OPTIONS: `--require=${JSON.stringify(path.join(root, "tests/fixtures/rss-sampler-close-race.cjs"))}` },
      ...fixture.args, ...(mode === "compiler-cancel" ? ["--strategy", "legacy", "--cancel-stage", "compiler-query"] : []))
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.status, expected, JSON.stringify({ status: report.status, cancellation: report.cancellation,
      samplerExit: report.samplerExit, samplerStderr: report.samplerStderr, failure: report.failure }))
    assert.equal(result.status, expected === "PASS" ? 0 : 1, result.stderr)
    assert.equal(JSON.parse(fs.readFileSync(marker, "utf8")).phase, "flushed-exiting")
    assert.deepEqual(report.samplerExit, { code: 0, signal: null })
    assert.throws(() => process.kill(report.samplerPid, 0), { code: "ESRCH" })
    assert.equal(report.samplerStderr, "")
    assert.ok(report.memory.sampleCount > 0)
    assert.equal(report.recovery.references.validation.pass, true)
    assert.equal(report.recovery.definition.exact, true)
    assert.equal(report.sourcePreserved, true)
  })
}

test("Settings cancel control lets a longer configured sample interval finish naturally", async t => {
  const fixture = await makeFixture(t, "completed")
  const marker = path.join(path.dirname(fixture.output), "sampler-exiting.json")
  const result = invokeWithEnvironment({ RSS_TEST_CLOSE_RACE: marker, RSS_TEST_CLOSE_OUTCOME: "interval",
    NODE_OPTIONS: `--require=${JSON.stringify(path.join(root, "tests/fixtures/rss-sampler-close-race.cjs"))}` },
    ...fixture.args, "--sample-interval-ms", "6000")
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.status, "NOT_CANCELLED", JSON.stringify({ samplerExit: report.samplerExit,
    samplerStderr: report.samplerStderr, failure: report.failure }))
  assert.equal(result.status, 1, result.stderr)
  assert.equal(report.memory.sampleIntervalMs, 6000)
  const signals = fs.existsSync(`${marker}.signal-times`)
    ? fs.readFileSync(`${marker}.signal-times`, "utf8").trim().split("\n").map(JSON.parse) : []
  const cleanup = report.timeline.find(event => event.phase === "server-process-closed")
  assert.ok(cleanup?.monotonicNs, "cleanup boundary must be observable")
  const elapsedMs = signals.map(event => Number(BigInt(event.monotonicNs) - BigInt(cleanup.monotonicNs)) / 1e6)
  // A delayed child may legitimately need fallback; never signal before its
  // configured grace (allow only Node's at-most-1ms timer rounding).
  assert.ok(signals.length <= 1 && signals.every((event, index) =>
    event.signal === "SIGTERM" && elapsedMs[index] + 1 >= 7000), JSON.stringify({ signals, elapsedMs }))
  const recorded = fs.existsSync(`${marker}.signals`)
    ? fs.readFileSync(`${marker}.signals`, "utf8").trim().split("\n") : []
  assert.deepEqual(recorded, signals.map(event => event.signal))
  assert.deepEqual(report.samplerExit, { code: 0, signal: null })
  assert.ok(report.memory.sampleCount > 0)
  assert.throws(() => process.kill(report.samplerPid, 0), { code: "ESRCH" })
})

for (const outcome of ["error", "hang"]) {
  test(`Settings cancel control still fails when sampler teardown reports ${outcome}`, async t => {
    const fixture = await makeFixture(t, "completed")
    const marker = path.join(path.dirname(fixture.output), "sampler-exiting.json")
    const result = invokeWithEnvironment({ RSS_TEST_CLOSE_RACE: marker, RSS_TEST_CLOSE_OUTCOME: outcome,
      NODE_OPTIONS: `--require=${JSON.stringify(path.join(root, "tests/fixtures/rss-sampler-close-race.cjs"))}` }, ...fixture.args)
    assert.equal(result.status, 1, result.stderr)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.cancellation.outcome, "NOT_CANCELLED")
    assert.equal(report.status, "FAIL")
    assert.deepEqual(report.samplerExit, outcome === "error" ? { code: 9, signal: null } : { code: null, signal: "SIGTERM" })
    assert.equal(JSON.parse(fs.readFileSync(marker, "utf8")).phase, "flushed-exiting")
    assert.ok(report.memory.sampleCount > 0)
    assert.equal(report.recovery.references.validation.pass, true)
    assert.throws(() => process.kill(report.samplerPid, 0), { code: "ESRCH" })
  })
}

test("Settings cancel control rejects a protocol cancel after the compiler query completes", async t => {
  const fixture = await makeFixture(t, "compiler-completed-after-cancel")
  const result = invoke(...fixture.args, "--strategy", "legacy", "--cancel-stage", "compiler-query")
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.status, "FAIL")
  assert.equal(report.cancellation.response.error.code, -32800)
  assert.equal(report.cancellation.compilerQuery.outcome, "completed")
  assert.equal(report.recovery.references.validation.pass, true)
})

test("Settings cancel control rejects a compiler cancellation that predates client cancel", async t => {
  const fixture = await makeFixture(t, "compiler-cancel-before-client")
  const result = invoke(...fixture.args, "--strategy", "legacy", "--cancel-stage", "compiler-query")
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.status, "FAIL")
  assert.equal(report.cancellation.response.error.code, -32800)
  assert.equal(report.cancellation.compilerQuery.outcome, "cancelled-before-client")
  assert.equal(report.recovery.references.validation.pass, true)
})

test("Settings cancel control rejects cancellation after TypeScript findReferences returns", async t => {
  const fixture = await makeFixture(t, "compiler-mapping-cancel")
  const result = invoke(...fixture.args, "--strategy", "legacy", "--cancel-stage", "compiler-query")
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.status, "FAIL")
  assert.equal(report.cancellation.response.error.code, -32800)
  assert.equal(report.cancellation.compilerQuery.outcome, "cancelled-in-flight")
  assert.equal(report.cancellation.compilerQuery.findReferences.outcome, "completed")
  assert.equal(report.recovery.references.validation.pass, true)
})

test("Settings cancel control classifies a completed response as NOT_CANCELLED", async t => {
  const fixture = await makeFixture(t, "completed")
  const result = invoke(...fixture.args)
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.status, "NOT_CANCELLED", JSON.stringify(reportSummary(report)))
  assert.equal(report.cancellation.sent, false)
  assert.equal(report.cancellation.response.result.length, 9)
  assert.equal(report.recovery.references.validation.pass, true)
  assert.equal(report.recovery.definition.exact, true)
})

test("Settings cancel control classifies a completion racing with cancel as NOT_CANCELLED", async t => {
  const fixture = await makeFixture(t, "race")
  const result = invoke(...fixture.args)
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.status, "NOT_CANCELLED", JSON.stringify(report))
  assert.equal(report.cancellation.sent, true)
  assert.equal(report.cancellation.stage.event.event, "references.batch.start")
  assert.equal(report.cancellation.response.result.length, 9)
  assert.equal(report.recovery.references.validation.pass, true)
})

test("Settings cancel control rejects a partial result racing with legacy cancel", async t => {
  const fixture = await makeFixture(t, "race-partial")
  const result = invoke(...fixture.args, "--strategy", "legacy")
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.status, "FAIL")
  assert.equal(report.cancellation.terminalValidation.pass, false)
  assert.equal(report.recovery.references.validation.pass, true)
})

test("Settings cancel control rejects a second result for the cancelled ID", async t => {
  const fixture = await makeFixture(t, "duplicate")
  const result = invoke(...fixture.args)
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.status, "FAIL")
  assert.equal(report.cancellation.response.error.code, -32800)
  assert.equal(report.requestEvidence.receivedTargetResponseCount, 2)
})

test("Settings cancel control rejects a recovered response carrying error and result", async t => {
  const fixture = await makeFixture(t, "recovery-both")
  const result = invoke(...fixture.args)
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.status, "FAIL")
  assert.equal(report.recovery.references.response.error.code, -32603)
  assert.equal(report.recovery.references.validation.pass, true)
})

function reportSummary(report) {
  return { status: report.status, cancellationOutcome: report.cancellation?.outcome,
    samplerExit: report.samplerExit, samplerStderr: report.samplerStderr,
    closeResult: report.closeResult, failure: report.failure }
}

const consumerFile = "product/phone/src/main/ets/Setting/Home/controller/HomePageMenuManager.ets"
const declarationFile = "common/src/main/ets/sendable/HomeInitData.ets"
const hash = fileName => crypto.createHash("sha256").update(fs.readFileSync(fileName)).digest("hex")

async function makeFixture(t, mode) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-cancel-fixture-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspace = path.join(temporary, "workspace")
  const sdk = path.join(temporary, "sdk")
  const consumer = path.join(workspace, consumerFile)
  const declaration = path.join(workspace, declarationFile)
  fs.mkdirSync(path.dirname(consumer), { recursive: true })
  fs.mkdirSync(path.dirname(declaration), { recursive: true })
  fs.mkdirSync(path.join(sdk, "ets"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"), { recursive: true })
  const consumerLines = Array.from({ length: 41 }, (_, line) => (
    line < 8 ? "HomeInitData" : line === 40 ? `${" ".repeat(37)}HomeInitData` : ""
  ))
  fs.writeFileSync(consumer, `${consumerLines.join("\n")}\n`)
  const declarationLines = Array.from({ length: 17 }, (_, line) => (
    line === 16 ? `${" ".repeat(13)}HomeInitData` : ""
  ))
  fs.writeFileSync(declaration, `${declarationLines.join("\n")}\n`)
  fs.writeFileSync(path.join(sdk, "ets/oh-uni-package.json"), JSON.stringify({
    apiVersion: "24", version: "6.1.1.125",
  }))
  fs.writeFileSync(path.join(sdk, "ets/lib.d.ts"), "declare const HomeInitData: object\n")
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: workspace, encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  git("init", "-q")
  git("add", ".")
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture")
  const locations = [
    ...Array.from({ length: 8 }, (_, line) => ({ file: consumerFile,
      range: { start: { line, character: 0 }, end: { line, character: 12 } } })),
    { file: consumerFile, range: { start: { line: 40, character: 37 },
      end: { line: 40, character: 49 } } },
  ]
  const oracle = path.join(temporary, "oracle.json")
  fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, verified: true, locations }))
  const server = path.join(temporary, "server.mjs")
  fs.writeFileSync(server, fakeServer(mode))
  const sidecar = path.join(temporary, "sidecar")
  fs.writeFileSync(sidecar, "fixture sidecar\n")
  const manifest = path.join(temporary, "manifest.json")
  fs.writeFileSync(manifest, JSON.stringify({
    schemaVersion: 1, benchmarkId: `settings-cancel-fixture-${mode}`,
    repoSha: git("rev-parse", "HEAD"), nodeVersion: process.version,
    sdk: { apiVersion: "24", version: "6.1.1.125", declarationDigest: await digestSdk(sdk) },
    query: { file: consumerFile, symbol: "HomeInitData", line: 40, character: 37,
      includeDeclaration: false, sourceSha256: hash(consumer), expectedDiagnostics: [] },
    watchedEdit: { file: declarationFile, sourceSha256: hash(declaration),
      expectedDefinitionBefore: { line: 16, character: 13 } },
    oracle: { verified: true, expectedLocationCount: 9, sha256: hash(oracle) },
    serverSha256: hash(server), sidecarSha256: hash(sidecar),
  }))
  const output = path.join(temporary, "report.json")
  return { output, args: ["--workspace", workspace, "--sdk", sdk, "--out", output,
    "--manifest", manifest, "--oracle", oracle, "--server", server, "--sidecar", sidecar] }
}

function fakeServer(mode) {
  return `import fs from "node:fs"
import path from "node:path"
const mode = ${JSON.stringify(mode)}
const consumer = ${JSON.stringify(consumerFile)}
const declaration = ${JSON.stringify(declarationFile)}
let rootUri = ""
let buffer = Buffer.alloc(0)
let references = 0
const send = value => { const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...value }))
  process.stdout.write("Content-Length: " + body.length + "\\r\\n\\r\\n"); process.stdout.write(body) }
const uri = file => new URL(file, rootUri.endsWith("/") ? rootUri : rootUri + "/").href
const locations = () => [...Array.from({ length: 8 }, (_, line) => ({ uri: uri(consumer),
  range: { start: { line, character: 0 }, end: { line, character: 12 } } })),
  { uri: uri(consumer), range: { start: { line: 40, character: 37 },
    end: { line: 40, character: 49 } } }]
const log = value => fs.appendFileSync(path.join(process.env.ARKTS_LSP_LOG_DIR, "server.log"),
  JSON.stringify({ ts: new Date().toISOString(), ...value }) + "\\n")
process.stdin.on("data", chunk => { buffer = Buffer.concat([buffer, chunk]); for (;;) {
  const end = buffer.indexOf("\\r\\n\\r\\n"); if (end < 0) break
  const length = Number(/Content-Length: (\\d+)/i.exec(buffer.subarray(0, end).toString("ascii"))?.[1])
  if (buffer.length < end + 4 + length) break
  const message = JSON.parse(buffer.subarray(end + 4, end + 4 + length).toString("utf8"))
  buffer = buffer.subarray(end + 4 + length); accept(message)
} })
function accept(message) {
  if (message.method === "initialize") { rootUri = message.params.rootUri
    send({ id: message.id, result: { capabilities: { definitionProvider: true, referencesProvider: true } } }); return }
  if (message.method === "initialized") { send({ id: 700, method: "window/workDoneProgress/create", params: { token: "catalog" } }); return }
  if (message.id === 700) { send({ method: "$/progress", params: { token: "catalog", value: { kind: "begin" } } })
    send({ method: "$/progress", params: { token: "catalog", value: { kind: "end", message: "ready" } } }); return }
  if (message.method === "textDocument/didOpen") { send({ method: "textDocument/publishDiagnostics",
    params: { uri: message.params.textDocument.uri, version: 1, diagnostics: [] } }); return }
  if (message.method === "textDocument/references") { references++
    if (references === 1 && mode === "completed") { send({ id: message.id, result: locations() }); return }
    if (references === 1) { log({ event: "references.queue.start", requestId: 3, traceId: "fixture" })
      if (mode.startsWith("compiler-")) { log({ event: "references.compiler-query.start", traceId: "fixture" })
        log({ event: "references.find-references.start", traceId: "fixture", callIndex: 1 }) }
      if (mode !== "legacy-cancel") log({ event: "references.batch.start", referenceSession: 1,
        batchIndex: 0, batchCount: 2, traceId: "fixture" })
      globalThis.cancelId = message.id
    } else send(mode === "recovery-both"
      ? { id: message.id, error: { code: -32603, message: "failed recovery" }, result: locations() }
      : { id: message.id, result: locations() }); return }
  if (message.method === "$/cancelRequest") { if (message.params.id === globalThis.cancelId) {
    const finish = () => {
      if (mode.startsWith("compiler-")) log({ event: mode === "compiler-cancel"
        || mode === "compiler-cancel-before-client" ? "references.find-references.throw"
        : "references.find-references.complete", traceId: "fixture", callIndex: 1,
      ...(mode === "compiler-cancel" || mode === "compiler-cancel-before-client"
        ? { cancelled: true } : {}) })
      if (mode.startsWith("compiler-")) log({ event: mode === "compiler-cancel"
        || mode === "compiler-cancel-before-client" || mode === "compiler-mapping-cancel"
        ? "references.compiler-query.cancelled" : "references.compiler-query.complete",
      traceId: "fixture", ...(mode === "compiler-cancel-before-client"
        ? { ts: "2000-01-01T00:00:00.000Z" } : {}) })
      send(mode === "race" || mode === "race-partial"
        ? { id: globalThis.cancelId, result: mode === "race-partial" ? locations().slice(0, 1) : locations() }
        : { id: globalThis.cancelId, error: { code: -32800, message: "Request cancelled by client" } })
      if (mode === "duplicate") send({ id: globalThis.cancelId, result: locations() })
    }
    if (mode.startsWith("compiler-")) setTimeout(finish, 5)
    else finish()
  } return }
  if (message.method === "textDocument/definition") { send({ id: message.id, result: [{ uri: uri(declaration),
    range: { start: { line: 16, character: 13 }, end: { line: 16, character: 25 } } }] }); return }
  if (message.method === "shutdown") { send({ id: message.id, result: null }); return }
  if (message.method === "exit") process.exit(0)
}
`
}
