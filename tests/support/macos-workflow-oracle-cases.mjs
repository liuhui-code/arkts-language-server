import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

import { macosWorkflow } from "./macos-workflow-fixture.mjs"

/** Independent frozen oracle and admitted-failure contracts through the real CLI. */
export function registerMacosOracleCases() {
  test("macOS full completion oracle rejects missing mismatched and session-bound snapshot facts", async (t) => {
    for (const [reason, mutate] of [
      ["COMPLETION_SNAPSHOTS", oracle => { oracle.completion.snapshots.pop() }],
      ["COMPLETION_VERSION", oracle => { oracle.completion.snapshots[2].query.documentVersion = 1 }],
      ["COMPLETION_QUERY", oracle => { oracle.completion.snapshots[2].query.position = { line: 0, character: 0 } }],
      ["COMPLETION_SOURCE", oracle => { oracle.completion.snapshots[1].sourceSha256 = "f".repeat(64) }],
      ["COMPLETION_PAYLOAD", oracle => { oracle.completion.snapshots[0].result.items[0].data = { arktsCompletionId: "stale" } }],
    ]) {
      const fixture = await macosWorkflow(t, { oracle: true, completionOracle: true, expectedStatus: 1,
        mutate: ({ oracle }) => mutate(oracle) })
      if (process.platform !== "darwin") continue
      assert.match(fixture.result.stderr, new RegExp("WORKFLOW_ORACLE_INVALID=" + reason))
      assert.equal(fixture.report, null, "invalid preflight must not invent an execution")
      assert.doesNotMatch(fixture.result.stdout, /MACOS_E2E=PASS/u)
    }
  })

  test("macOS full completion oracle verifies every field and bound initial edited and pressure snapshot", async (t) => {
    const fixture = await macosWorkflow(t, { oracle: true, completionOracle: true })
    if (process.platform !== "darwin") return
    assert.equal(fixture.report.correctness.completionOracle.status, "PASS")
    assert.deepEqual(fixture.report.correctness.completionOracle.capabilities,
      ["completion:initial", "completion:edited", "completion:post-pressure"])
    const receipts = fixture.report.runs.flatMap(run => run.receipts)
      .filter(receipt => receipt.method === "textDocument/completion")
    assert.equal(receipts.length, 41)
    for (const receipt of receipts) {
      const expected = fixture.oracle.completion.snapshots.find(item => item.query.documentVersion === receipt.documentVersion)
      assert.equal(receipt.correctness.equal, true)
      assert.deepEqual(receipt.correctness.payload, expected.result)
      assert.deepEqual(receipt.correctness.expectedPayload, expected.result)
      assert.equal(receipt.correctness.sourceSha256, expected.sourceSha256)
      assert.equal(receipt.correctness.documentVersion, expected.query.documentVersion)
      assert.deepEqual(receipt.correctness.invalid, [])
      assert.ok(receipt.response.result.items.every(item => typeof item.data.arktsCompletionId === "string"))
      assert.ok(receipt.correctness.payload.items.every(item => !Object.hasOwn(item, "data")))
    }
    assert.ok(fixture.report.runs.every(run => run.status === "COMPLETE"
      && run.closeResult.exit.code === 0 && run.closeResult.exit.signal === null))
    assert.equal(fixture.report.releasePssComparable, false)
  })

  test("macOS full completion oracle rejects a wrong payload even while the required label remains", async (t) => {
    const fixture = await macosWorkflow(t, { oracle: true, expectedStatus: 1, mutate: ({ oracle, workspace }) => {
      const original = fs.readFileSync(path.join(workspace, oracle.query.file), "utf8")
      const dotted = original.replace("return this.stableMember", "return this.")
      const result = { isIncomplete: false, items: [{ label: "stableMember", kind: 5,
        insertText: "stableMember", detail: "incorrect source-declared detail", sortText: "0" }] }
      oracle.completion = { snapshots: [
        [1, dotted], [3, dotted.replace("// benchmark-edit", "// benchmark-edit changed")], [4, dotted],
      ].map(([documentVersion, source]) => ({
        query: { file: oracle.query.file, documentVersion, position: oracle.query.position, context: { triggerKind: 1 } },
        sourceSha256: createHash("sha256").update(source).digest("hex"), result,
      })) }
    } })
    if (process.platform !== "darwin") return
    assert.match(fixture.result.stderr, /WORKFLOW_ORACLE_MISMATCH=completion/u)
    assert.ok(fixture.report, "retain the actual completion that disproves the supplied full oracle")
    assert.equal(fixture.report.measurementStatus, "incomplete")
    assert.deepEqual(fixture.report.workflowExecution,
      { plannedRuns: 18, attemptedRuns: 1, completedRuns: 0, unexecutedRuns: 17 })
    const run = fixture.report.runs[0], receipt = run.receipts[0]
    assert.equal(receipt.method, "textDocument/completion")
    assert.equal(receipt.status, "RECEIVED")
    assert.ok(receipt.response.result.items.some(item => item.label === "stableMember" && item.data))
    assert.equal(receipt.correctness.equal, false)
    assert.equal(receipt.correctness.expectedPayload.items[0].detail, "incorrect source-declared detail")
    assert.notDeepEqual(receipt.correctness.payload, receipt.correctness.expectedPayload)
    assert.deepEqual(run.closeResult.exit, { code: 0, signal: null })
    assert.doesNotMatch(fixture.result.stdout, /MACOS_E2E=PASS/u)
  })

  test("macOS workflow verifies exact locations against an independently pinned fixture oracle", async (t) => {
    const { report, oracle, oraclePath } = await macosWorkflow(t, { oracle: true })
    if (process.platform !== "darwin") return
    const digest = createHash("sha256").update(fs.readFileSync(oraclePath)).digest("hex")
    assert.equal(report.comparisonIdentity.workflowOracleSha256, digest)
    assert.equal(report.correctness.locationOracle.status, "PASS")
    assert.deepEqual(report.correctness.locationOracle.capabilities, ["definition", "references:includeDeclaration=true"])
    for (const run of report.runs) {
      for (const [index, kind] of [[1, "definition"], [2, "references"]]) {
        assert.equal(run.receipts[index].correctness.equal, true)
        assert.deepEqual(run.receipts[index].correctness.expectedLocations, oracle[kind].locations)
        assert.deepEqual(run.receipts[index].correctness.locations, oracle[kind].locations)
      }
    }
    assert.equal(report.releasePssComparable, false)
  })

  test("macOS oracle fails closed for changed inputs and same-count wrong locations", async (t) => {
    for (const [reason, mutate] of [
      ["UNVERIFIED", fixture => { fixture.oracle.verified = false }],
      ["INPUT_IDENTITY", fixture => { fixture.oracle.inputIdentity.sdkDeclarationDigest = "a".repeat(64) }],
      ["INPUT_IDENTITY", fixture => { fs.appendFileSync(path.join(fixture.sdk, "ets/component/common.d.ts"), "// changed\n") }],
      ["INPUT_IDENTITY", fixture => { fs.appendFileSync(path.join(fixture.workspace,
        "entry/src/main/ets/generated/Active000001.ets"), "// changed\n") }],
      ["QUERY_IDENTITY", fixture => { fixture.oracle.query.position.character++ }],
      ["DUPLICATE_LOCATION", fixture => { fixture.oracle.references.locations.push(fixture.oracle.references.locations[0]) }],
      ["WORKFLOW_ORACLE_MISMATCH=definition", fixture => { fixture.oracle.definition.locations[0].range.start.character++ }],
      ["WORKFLOW_ORACLE_MISMATCH=references", fixture => { fixture.oracle.references.locations[1].range.end.character-- }],
    ]) {
      const fixture = await macosWorkflow(t, { oracle: true, expectedStatus: 1, mutate })
      if (process.platform !== "darwin") continue
      assert.match(fixture.result.stderr, new RegExp(reason))
      assert.doesNotMatch(fixture.result.stdout, /MACOS_E2E=PASS/u)
      if (reason.startsWith("WORKFLOW_ORACLE_MISMATCH")) {
        assert.equal(fixture.report.measurementStatus, "incomplete")
        assert.equal(fixture.report.correctness.failures, 1)
      } else assert.equal(fixture.report, null, "preflight rejection must not fabricate an execution")
    }
  })

  test("macOS oracle rejects fixture drift after its initial input admission", async (t) => {
    const fixture = await macosWorkflow(t, { oracle: true, expectedStatus: 1, drift: true })
    if (process.platform !== "darwin") return
    assert.match(fs.readFileSync(path.join(fixture.workspace, "unrelated/000/Unused000000.ets"), "utf8"),
      /changed after oracle admission/u)
    assert.match(fixture.result.stderr, /WORKFLOW_ORACLE_INVALID=INPUT_IDENTITY/u)
    assert.doesNotMatch(fixture.result.stdout, /MACOS_E2E=PASS/u)
    assert.ok(fixture.report, "postflight rejection must retain all actual executions")
    const report = fixture.report
    assert.equal(report.measurementStatus, "incomplete")
    assert.equal(report.correctness.locationOracle.status, "FAIL")
    assert.match(report.failure.message, /WORKFLOW_ORACLE_INVALID=INPUT_IDENTITY/u)
    assert.deepEqual(report.workflowExecution,
      { plannedRuns: 18, attemptedRuns: 18, completedRuns: 18, unexecutedRuns: 0 })
    assert.deepEqual(report.unexecutedRuns, [])
    assert.equal(report.runs.reduce((count, run) => count + run.receipts.length, 0), 82)
    for (const run of report.runs) {
      assert.equal(run.status, "COMPLETE")
      assert.deepEqual(run.closeResult.exit, { code: 0, signal: null })
      assert.equal(run.receipts[2].correctness.equal, true)
    }
  })

  test("macOS location oracle compares positions not JSON field or set order", async (t) => {
    const fixture = await macosWorkflow(t, { oracle: true, mutate: ({ oracle }) => {
      oracle.references.locations = oracle.references.locations.reverse().map(({ file, range: { start, end } }) =>
        ({ range: { end: { character: end.character, line: end.line },
          start: { character: start.character, line: start.line } }, file }))
    } })
    if (process.platform !== "darwin") return
    assert.equal(fixture.report.correctness.locationOracle.status, "PASS")
    assert.ok(fixture.report.runs.every(run => run.receipts[2].correctness.equal === true))
  })

  test("macOS failed workflow retains native responses exit and its unexecuted tail", async (t) => {
    const fixture = await macosWorkflow(t, { oracle: true, expectedStatus: 1, mutate: ({ oracle }) => {
      oracle.references.locations[1].range.end.character--
    } })
    if (process.platform !== "darwin") return
    assert.ok(fixture.report, "failed execution must retain its partial evidence report")
    const report = fixture.report
    assert.equal(report.measurementStatus, "incomplete")
    assert.equal(report.correctness.failures, 1)
    assert.equal(report.correctness.locationOracle.status, "FAIL")
    assert.match(report.failure.message, /WORKFLOW_ORACLE_MISMATCH=references/u)
    assert.deepEqual(report.workflowExecution,
      { plannedRuns: 18, attemptedRuns: 1, completedRuns: 0, unexecutedRuns: 17 })
    assert.equal(report.unexecutedRuns.length, 17)
    assert.deepEqual(report.unexecutedRuns[0], { kind: "cold", index: 1 })
    assert.deepEqual(report.unexecutedRuns.at(-1), { kind: "stress", index: 4 })
    const run = report.runs[0]
    assert.equal(run.status, "FAIL")
    assert.ok(Number.isSafeInteger(run.targetPid) && run.targetPid > 0)
    assert.deepEqual(run.closeResult.exit, { code: 0, signal: null })
    assert.deepEqual(run.receipts.map(item => item.method),
      ["textDocument/completion", "textDocument/definition", "textDocument/references"])
    assert.equal(run.receipts[2].response.result.length, 2)
    assert.equal(run.receipts[2].correctness.equal, false)
    assert.equal(report.memory.steadyWarmRssBytes, null)
    assert.equal(report.latency.warmReferencesP95Ms, null)
    assert.doesNotMatch(fixture.result.stdout, /MACOS_E2E=PASS/u)
  })

}
