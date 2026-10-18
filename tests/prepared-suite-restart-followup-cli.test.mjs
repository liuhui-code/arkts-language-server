import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { canonicalPreparedCompletion } from "../scripts/bench/prepared-query-report.mjs"
import { waitForCatalog } from "../scripts/bench/reference-replay-evidence.mjs"
import { LspSession } from "./support/lsp-session.mjs"
import { productionCallSuite, productionFollowupSuite } from "./support/prepared-followup-fixture.mjs"
import { saveSuite } from "./support/prepared-suite-fixture.mjs"

test("prepared restart measures a fresh completion and resolves its entire payload for both source entries",
  { timeout: 90_000 }, async t => {
    for (const opened of [true, false]) {
      const fixture = await productionFollowupSuite(t, opened)
      const run = spawnSync(process.execPath, [path.resolve("scripts/bench/replay-references.mjs"),
        "--prepared-suite", fixture.input, "--out", fixture.output], { encoding: "utf8", timeout: 60_000 })
      assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
      const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
      assert.equal(report.correctness.status, "PASS", JSON.stringify({ failure: report.failure, requests: report.requests }))
      assert.equal(report.gateStatus.ready, "PASS")
      assert.deepEqual(report.requests.map(request => request.method), ["textDocument/completion", "completionItem/resolve"])
      assert.equal(report.processSegments.length, 2)
      assert.notEqual(report.processSegments[0].pid, report.processSegments[1].pid)
      for (const request of report.requests) {
        assert.equal(request.processSegmentId, report.processSegments[1].id)
        assert.equal(request.documentVersion, opened ? 1 : undefined)
        assert.equal(request.correctness.equal, true)
        assert.equal(request.readiness.verified, true)
      }
      assert.equal(report.requests[1].completionSourceTargetId, "value-list")
      assert.equal(report.requests[1].sourceScenarioId, "new-list")
      assert.equal(report.preparation.targetQueries, 0)
      assert.equal(report.gateStatus.latency, "BLOCKED")
      assert.equal(report.gateStatus.memory, "BLOCKED")
    }
  })

test("production completion UUIDs expire across a real server restart for both source entries",
  { timeout: 90_000 }, async t => {
    for (const opened of [true, false]) {
      const fixture = await productionFollowupSuite(t, opened)
      const rootUri = pathToFileURL(fixture.suite.workspace).href
      const target = fixture.suite.targets[0], uri = pathToFileURL(path.join(fixture.suite.workspace, target.file)).href
      const params = { textDocument: { uri }, position: target.position }
      const expectedList = JSON.parse(fs.readFileSync(target.oracle.path, "utf8")).result
      const expectedResolved = JSON.parse(fs.readFileSync(fixture.suite.targets[1].oracle.path, "utf8")).result
      const first = await start("first")
      const oldList = await first.session.request("textDocument/completion", params)
      assert.deepEqual({ ...oldList.result, items: oldList.result.items.map(canonicalPreparedCompletion) }, expectedList)
      const oldItem = oldList.result.items[0]
      const oldResolve = await first.session.request("completionItem/resolve", oldItem)
      assert.deepEqual(canonicalPreparedCompletion(oldResolve.result), expectedResolved)
      assert.deepEqual((await first.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
      const second = await start("second")
      assert.notEqual(first.session.transport.child.pid, second.session.transport.child.pid)
      assert.notEqual(first.ready.semanticGeneration, second.ready.semanticGeneration)
      const stale = await second.session.request("completionItem/resolve", oldItem)
      assert.equal(stale.error?.code, -32602, JSON.stringify(stale))
      assert.equal(stale.result, undefined)
      const list = await second.session.request("textDocument/completion", params)
      assert.deepEqual({ ...list.result, items: list.result.items.map(canonicalPreparedCompletion) }, expectedList)
      assert.notEqual(list.result.items[0].data.arktsCompletionId, oldItem.data.arktsCompletionId)
      const resolved = await second.session.request("completionItem/resolve", list.result.items[0])
      assert.deepEqual(canonicalPreparedCompletion(resolved.result), expectedResolved)
      assert.equal(second.session.documentVersions.size, opened ? 1 : 0)
      assert.equal((await second.session.request("arkts/semanticReadiness", { rootUri, prepare: false })).result?.semanticState, "ready")
      assert.deepEqual((await second.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })

      async function start(id) {
        const directory = path.join(fixture.directory, id)
        fs.mkdirSync(directory)
        const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
          cwd: path.resolve("."), rootUri, capabilities: { window: { workDoneProgress: true },
            textDocument: { publishDiagnostics: { versionSupport: true } } },
          env: { ...fixture.suite.runtime.env, ARKTS_INDEX_SIDECAR_PATH: fixture.suite.sidecar,
            ARKTS_INDEX_CACHE_DIR: path.join(directory, "index"), ARKTS_LSP_LOG_DIR: path.join(directory, "logs") } })
        t.after(() => session.close().catch(() => {}))
        await session.initialize({ initializationOptions: { sdk: { path: fixture.suite.sdk } }, timeoutMs: 10000 })
        await waitForCatalog(session, 10000)
        assert.equal((await session.request("arkts/semanticReadiness", { rootUri, prepare: false })).result?.semanticState, "ready")
        if (opened) session.openDocument({ uri, version: 1, text: fs.readFileSync(path.join(fixture.suite.workspace, target.file), "utf8") })
        const prepared = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 10000 })
        assert.equal(prepared.result?.semanticState, "ready", JSON.stringify(prepared))
        return { session, ready: prepared.result }
      }
    }
  })

test("prepared restart cannot supply a missing new completion or call preparation from its previous process",
  { timeout: 90_000 }, async t => {
    for (const [build, sourceId, followupId, method, reason] of [
      [productionFollowupSuite, "value-list", "value-resolve", "completionItem/resolve", "PREPARED_RESOLVE_BLOCKED=NO_CURRENT_VALIDATED_COMPLETION"],
      [productionCallSuite, "caller-prepare", "outgoing", "callHierarchy/outgoingCalls", "PREPARED_CALL_BLOCKED=NO_CURRENT_VALIDATED_PREPARE"],
    ]) {
      const fixture = await build(t, true)
      fixture.suite.scenarios = [
        { id: "before", bucket: "first-unseen-symbol", targetId: sourceId },
        { id: "after", bucket: "restart-after-validated-ready", targetId: followupId },
      ]
      saveSuite(fixture)
      const run = spawnSync(process.execPath, [path.resolve("scripts/bench/replay-references.mjs"),
        "--prepared-suite", fixture.input, "--out", fixture.output], { encoding: "utf8", timeout: 60000 })
      assert.equal(run.status, 1, run.stderr)
      const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
      assert.equal(report.requests.length, 2)
      assert.equal(report.requests[0].correctness.equal, true)
      assert.equal(report.requests[1].status, "ERROR")
      assert.equal(report.requests[1].error.message, reason)
      assert.equal(report.requests[1].sourceScenarioId, undefined)
      assert.equal(report.correctness.status, "FAIL")
      assert.equal(report.correctness.plannedRequests, 2)
      const canonical = JSON.parse(fs.readFileSync(path.join(fixture.directory,
        report.processSegments[1].reportArtifact.file), "utf8"))
      assert.equal(canonical.transcript.transcript.entries.filter(entry => entry.direction === "send"
        && entry.method === method).length, 0, "no hidden query or prior-process item may be sent")
    }
  })

test("release rejects an otherwise valid restart resolve that borrows its completion source from the old process",
  { timeout: 90_000 }, async t => {
    const fixture = await productionFollowupSuite(t, true)
    fixture.suite.scenarios.unshift({ id: "before-list", bucket: "first-unseen-symbol", targetId: "value-list" })
    saveSuite(fixture)
    const run = spawnSync(process.execPath, [path.resolve("scripts/bench/replay-references.mjs"),
      "--prepared-suite", fixture.input, "--out", fixture.output], { encoding: "utf8", timeout: 60_000 })
    assert.equal(run.status, 1, run.stderr)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.correctness.status, "PASS", JSON.stringify(report.failure))
    assert.equal(report.requests.length, 3)
    const validOutput = path.join(fixture.directory, "valid-release.json")
    const valid = spawnSync(process.execPath, [path.resolve("scripts/bench/assert-semantic-release.mjs"),
      "--matrix", path.resolve("config/semantic-release-matrix.json"), "--prepared-report", fixture.output,
      "--out", validOutput], { encoding: "utf8", timeout: 15_000 })
    assert.equal(valid.status, 1, valid.stderr)
    const validCell = JSON.parse(fs.readFileSync(validOutput, "utf8")).cells
      .find(cell => cell.capability === "completionResolve" && cell.requests)
    assert.equal(validCell.gates.ready, "PASS", "the actual current-process source remains admissible")
    assert.equal(validCell.gates.correctness, "PASS")
    assert.notEqual(report.requests[0].processSegmentId, report.requests[2].processSegmentId)
    const segment = report.processSegments[1]
    const file = path.join(fixture.directory, segment.reportArtifact.file)
    const canonical = JSON.parse(fs.readFileSync(file, "utf8"))
    canonical.requests[1].sourceScenarioId = "before-list"
    report.requests[2].sourceScenarioId = "before-list"
    const bytes = Buffer.from(JSON.stringify(canonical))
    fs.writeFileSync(file, bytes)
    segment.reportArtifact.sha256 = createHash("sha256").update(bytes).digest("hex")
    segment.reportArtifact.byteLength = bytes.length
    const changed = path.join(fixture.directory, "borrowed-source.json")
    const output = path.join(fixture.directory, "release.json")
    fs.writeFileSync(changed, JSON.stringify(report))
    const released = spawnSync(process.execPath, [path.resolve("scripts/bench/assert-semantic-release.mjs"),
      "--matrix", path.resolve("config/semantic-release-matrix.json"), "--prepared-report", changed,
      "--out", output], { encoding: "utf8", timeout: 15_000 })
    assert.equal(released.status, 1, released.stderr)
    const release = JSON.parse(fs.readFileSync(output, "utf8"))
    assert.equal(release.cells.reduce((sum, cell) => sum + cell.requests, 0), 3)
    const resolve = release.cells.find(cell => cell.capability === "completionResolve" && cell.requests)
    assert.equal(resolve.gates.ready, "BLOCKED")
    assert.equal(resolve.gates.correctness, "BLOCKED")
    assert.equal(release.releaseEligible, false)
  })

test("prepared restart re-prepares and preserves complete outgoing and incoming payloads for both source entries",
  { timeout: 90_000 }, async t => {
    for (const opened of [true, false]) {
      const fixture = await productionCallSuite(t, opened)
      const run = spawnSync(process.execPath, [path.resolve("scripts/bench/replay-references.mjs"),
        "--prepared-suite", fixture.input, "--out", fixture.output], { encoding: "utf8", timeout: 60_000 })
      assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
      const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
      assert.equal(report.correctness.status, "PASS", JSON.stringify(report.requests.map(request => ({
        kind: request.kind, status: request.status, error: request.error, correctness: request.correctness }))))
      assert.equal(report.gateStatus.ready, "PASS")
      assert.equal(report.processSegments.length, 2)
      assert.deepEqual(report.requests.map(request => request.kind),
        ["prepareCallHierarchy", "outgoingCalls", "prepareCallHierarchy", "incomingCalls"])
      assert.deepEqual(report.requests.map(request => request.sourceScenarioId),
        [undefined, "caller-prepare", undefined, "target-prepare"])
      assert.deepEqual(report.requests.map(request => request.documentVersion),
        [opened ? 1 : undefined, opened ? 1 : undefined, undefined, undefined])
      assert.ok(report.requests.every(request => request.processSegmentId === report.processSegments[1].id
        && request.correctness.equal && request.readiness.verified))
      const releaseFile = path.join(fixture.directory, "release.json")
      const released = spawnSync(process.execPath, [path.resolve("scripts/bench/assert-semantic-release.mjs"),
        "--matrix", path.resolve("config/semantic-release-matrix.json"), "--prepared-report", fixture.output,
        "--out", releaseFile], { encoding: "utf8", timeout: 15_000 })
      assert.equal(released.status, 1, released.stderr)
      const release = JSON.parse(fs.readFileSync(releaseFile, "utf8"))
      assert.equal(release.cells.reduce((sum, cell) => sum + cell.requests, 0), 4)
      for (const cell of release.cells.filter(cell => cell.requests)) {
        assert.equal(cell.gates.ready, "PASS")
        assert.equal(cell.gates.correctness, "PASS")
        assert.equal(cell.gates.memory, "BLOCKED")
        assert.equal(cell.gates.latency, "BLOCKED")
      }
    }
  })
