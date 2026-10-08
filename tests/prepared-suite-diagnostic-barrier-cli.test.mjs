import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { capturePreparedIdentity, digestJson } from "../scripts/bench/prepared-suite-input.mjs"
import { sha256File } from "../scripts/bench/reference-replay-input.mjs"

const runner = path.resolve("scripts/bench/replay-references.mjs")
const serverSource = String.raw`
const documents = new Map()
let pending = Buffer.alloc(0)
let referencesAnswered = false

process.stdin.on("data", chunk => {
  pending = Buffer.concat([pending, chunk])
  while (true) {
    const headerEnd = pending.indexOf("\r\n\r\n")
    if (headerEnd < 0) return
    const match = /^Content-Length:\s*(\d+)$/mi.exec(pending.subarray(0, headerEnd).toString("ascii"))
    if (!match) process.exit(2)
    const end = headerEnd + 4 + Number(match[1])
    if (pending.length < end) return
    const message = JSON.parse(pending.subarray(headerEnd + 4, end).toString("utf8"))
    pending = pending.subarray(end)
    receive(message)
  }
})

function send(message) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }))
  process.stdout.write("Content-Length: " + body.length + "\r\n\r\n")
  process.stdout.write(body)
}

function location(uri) {
  return { uri, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }
}

function receive(message) {
  if (message.method === "initialize") {
    send({ id: message.id, result: { capabilities: {
      textDocumentSync: 2, referencesProvider: true, definitionProvider: true,
    } } })
  } else if (message.method === "initialized") {
    send({ id: "catalog", method: "window/workDoneProgress/create", params: { token: "catalog" } })
  } else if (message.id === "catalog" && !message.method) {
    send({ method: "$/progress", params: { token: "catalog", value: {
      kind: "begin", title: "ArkTS workspace index",
    } } })
    send({ method: "$/progress", params: { token: "catalog", value: {
      kind: "end", message: "ready",
    } } })
  } else if (message.method === "textDocument/didOpen") {
    const { uri, version } = message.params.textDocument
    documents.set(uri, version)
  } else if (message.method === "textDocument/references") {
    const uri = message.params.textDocument.uri
    send({ id: message.id, result: [location(uri)] })
    if (!referencesAnswered) {
      referencesAnswered = true
      const [first, second] = [...documents.keys()]
      for (const [index, openedUri] of [first, second].entries()) {
        if (index === 1 && process.env.ARKTS_TEST_PREOPEN_DIAGNOSTICS === "missing-second") continue
        setTimeout(() => send({ method: "textDocument/publishDiagnostics", params: {
          uri: openedUri, version: 1, diagnostics: [],
        } }), 90 + index * 70)
      }
    }
  } else if (message.method === "textDocument/definition") {
    send({ id: message.id, result: [location(message.params.textDocument.uri)] })
  } else if (message.method === "shutdown") {
    send({ id: message.id, result: null })
  } else if (message.method === "exit") {
    process.exit(0)
  }
}
`

test("second definition waits for both pre-open v1 diagnostics after first references", async t => {
  const fixture = await makeSuite(t)
  fixture.suite.scenarios[1].waitForPreOpenDiagnostics = true
  saveSuite(fixture)

  const run = runSuite(fixture)
  assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
  const report = readReport(fixture)
  assert.equal(report.correctness.status, "PASS", JSON.stringify(report.failure))
  assert.deepEqual(report.requests.map(request => [request.scenarioId, request.correctness.equal]),
    [["first-references", true], ["second-definition", true]])
  const firstComplete = report.timeline.findIndex(event => event.phase === "request-complete"
    && event.scenarioId === "first-references")
  const diagnostics = report.timeline.flatMap((event, index) => event.phase === "publishDiagnostics"
    && event.version === 1 ? [index] : [])
  const barrier = report.timeline.findIndex(event => event.phase === "pre-open-diagnostics-barrier-complete")
  const secondStart = report.timeline.findIndex(event => event.phase === "request-start"
    && event.scenarioId === "second-definition")
  assert.equal(diagnostics.length, 2)
  assert.ok(firstComplete >= 0 && diagnostics.every(index => index > firstComplete))
  assert.ok(barrier > Math.max(...diagnostics) && secondStart > barrier)
  assert.deepEqual(report.diagnostics.map(item => item.version), [1, 1])
})

test("missing pre-open diagnostics fail the barrier before the second request", async t => {
  const fixture = await makeSuite(t, "missing-second")
  fixture.suite.scenarios[1].waitForPreOpenDiagnostics = true
  saveSuite(fixture)

  const run = runSuite(fixture)
  assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
  const report = readReport(fixture)
  assert.equal(report.correctness.status, "FAIL")
  assert.equal(report.gateStatus.diagnostics, "FAIL")
  assert.match(report.failure.message, /PREOPEN_DIAGNOSTIC_BARRIER_FAILED=second/u)
  assert.deepEqual(report.requests.map(request => request.scenarioId), ["first-references"])
  assert.equal(report.timeline.some(event => event.phase === "pre-open-diagnostics-barrier-complete"), false)
  assert.equal(report.timeline.some(event => event.phase === "request-start"
    && event.scenarioId === "second-definition"), false)
})

test("default path does not wait at a pre-open diagnostic barrier", async t => {
  const fixture = await makeSuite(t)
  const run = runSuite(fixture)
  assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
  const report = readReport(fixture)
  assert.equal(report.correctness.status, "PASS", JSON.stringify(report.failure))
  assert.deepEqual(report.requests.map(request => request.correctness.equal), [true, true])
  assert.equal(report.timeline.some(event => event.phase === "pre-open-diagnostics-barrier-complete"), false)
  assert.equal(report.gateStatus.diagnostics, "PASS")
})

test("diagnostic barrier requires pre-open targets and an unedited prior scenario", async t => {
  const fixture = await makeSuite(t)
  fixture.suite.scenarios[1].waitForPreOpenDiagnostics = true

  fixture.suite.preOpenTargetIds = []
  saveSuite(fixture)
  let run = runSuite(fixture)
  assert.equal(run.status, 2, run.stderr)
  assert.match(run.stderr, /PREPARED_SUITE_INVALID=PREOPEN_DIAGNOSTIC_BARRIER/u)
  assert.equal(fs.existsSync(fixture.output), false)

  fixture.suite.preOpenTargetIds = ["first", "second"]
  fixture.suite.scenarios[0].waitForPreOpenDiagnostics = true
  saveSuite(fixture)
  run = runSuite(fixture)
  assert.equal(run.status, 2, run.stderr)
  assert.match(run.stderr, /PREPARED_SUITE_INVALID=PREOPEN_DIAGNOSTIC_BARRIER/u)

  delete fixture.suite.scenarios[0].waitForPreOpenDiagnostics
  const changes = [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
    newText: "// edit\n" }]
  fixture.suite.scenarios[0] = { ...fixture.suite.scenarios[0], bucket: "edit-body", edit: {
    file: "First.ets", changes, sha256: digestJson(changes), oracle: fixture.suite.targets[0].oracle,
  } }
  saveSuite(fixture)
  run = runSuite(fixture)
  assert.equal(run.status, 2, run.stderr)
  assert.match(run.stderr, /PREPARED_SUITE_INVALID=PREOPEN_DIAGNOSTIC_BARRIER/u)
  assert.equal(fs.existsSync(fixture.output), false)
})

async function makeSuite(t, mode = "normal") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-preopen-barrier-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const workspace = path.join(directory, "workspace")
  const sdk = path.join(directory, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "lib.d.ts"), "declare const Thing: string\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"), JSON.stringify({ apiVersion: "24", version: "test" }))
  for (const file of ["First.ets", "Second.ets"]) fs.writeFileSync(path.join(workspace, file), "Thing\n")
  for (const args of [["init", "-q"], ["add", "First.ets", "Second.ets"],
    ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]]) {
    const git = spawnSync("git", args, { cwd: workspace, encoding: "utf8" })
    assert.equal(git.status, 0, git.stderr)
  }
  const server = path.join(directory, "server.mjs")
  fs.writeFileSync(server, serverSource)
  const target = (id, kind, file) => {
    const oracle = path.join(directory, `${id}-oracle.json`)
    fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, locations: [{
      file, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
    }] }))
    return { id, moduleId: id, kind, file, symbol: "Thing", position: { line: 0, character: 1 },
      sourceSha256: sha256File(path.join(workspace, file)),
      ...(kind === "references" ? { includeDeclaration: true } : {}),
      oracle: { path: oracle, sha256: sha256File(oracle), verified: true } }
  }
  const suite = {
    schemaVersion: 1, benchmarkId: "preopen-diagnostic-barrier", seed: 20261006,
    workspace, sdk, server, sidecar: server,
    pins: await capturePreparedIdentity({ workspace, sdk, server, sidecar: server }),
    runtime: { timeoutMs: 5000, diagnosticTimeoutMs: 500, sampleIntervalMs: 25,
      env: { ARKTS_TEST_PREOPEN_DIAGNOSTICS: mode } },
    readiness: { candidateControl: true }, preOpenTargetIds: ["first", "second"],
    targets: [target("first", "references", "First.ets"), target("second", "definition", "Second.ets")],
    scenarios: [
      { id: "first-references", bucket: "first-unseen-symbol", targetId: "first" },
      { id: "second-definition", bucket: "first-unseen-symbol", targetId: "second" },
    ],
  }
  const input = path.join(directory, "suite.json")
  const output = path.join(directory, "report.json")
  fs.writeFileSync(input, JSON.stringify(suite))
  return { directory, input, output, suite }
}

function saveSuite(fixture) {
  fs.writeFileSync(fixture.input, JSON.stringify(fixture.suite))
}

function runSuite(fixture) {
  return spawnSync(process.execPath, [runner, "--prepared-suite", fixture.input, "--out", fixture.output],
    { encoding: "utf8", timeout: 20_000 })
}

function readReport(fixture) {
  return JSON.parse(fs.readFileSync(fixture.output, "utf8"))
}
