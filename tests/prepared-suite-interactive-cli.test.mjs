import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { sha256File } from "../scripts/bench/reference-replay-input.mjs"
import { digestJson } from "../scripts/bench/prepared-suite-input.mjs"
import { makeSuite, runSuite, saveSuite } from "./support/prepared-suite-fixture.mjs"

test("prepared suite compares the complete hover payload without certifying semantic readiness", async t => {
  const fixture = await makeSuite(t)
  const result = { contents: { kind: "markdown", value: "```arkts\nconst Thing: string\n```" },
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }
  const oracle = path.join(fixture.directory, "hover-oracle.json")
  fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, kind: "hover", result }))
  fixture.suite.targets[0].kind = "hover"
  fixture.suite.targets[0].oracle = { path: oracle, sha256: sha256File(oracle), verified: true }
  saveSuite(fixture)
  const executed = runSuite(fixture)
  assert.equal(executed.status, 1, `${executed.stderr}\n${executed.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.correctness.status, "PASS", JSON.stringify(report.failure))
  assert.equal(report.requests.length, 2)
  assert.ok(report.requests.every(request => request.kind === "hover" && request.correctness.equal))
  assert.deepEqual(report.requests[0].correctness.payload, result)
  assert.equal(report.readiness.semantic.status, "READINESS_UNSUPPORTED")
  assert.equal(report.gateStatus.ready, "FAIL")
  assert.ok(report.memory.samples.length > 0)
})

test("prepared suite compares all signature parameters, documentation and active positions", async t => {
  const fixture = await makeSuite(t)
  const result = { signatures: [{ label: "call(count: number, label: string): string",
    documentation: { kind: "markdown", value: "signature docs 😀" },
    parameters: [{ label: [5, 18], documentation: "count docs" }, { label: "label: string" }] }],
  activeSignature: 0, activeParameter: 1 }
  const oracle = path.join(fixture.directory, "signature-oracle.json")
  fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, kind: "signatureHelp", result }))
  fixture.suite.targets[0].kind = "signatureHelp"
  fixture.suite.targets[0].oracle = { path: oracle, sha256: sha256File(oracle), verified: true }
  saveSuite(fixture)
  const executed = runSuite(fixture)
  assert.equal(executed.status, 1, `${executed.stderr}\n${executed.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.correctness.status, "PASS", JSON.stringify(report.failure))
  assert.equal(report.requests.length, 2)
  assert.deepEqual(report.requests[0].correctness.payload, result)
  assert.ok(report.requests.every(request => request.correctness.equal))
  assert.equal(report.readiness.semantic.status, "READINESS_UNSUPPORTED")
})

test("prepared suite compares every completion field and only canonicalizes a valid opaque session handle", async t => {
  const fixture = await makeSuite(t)
  const item = { label: "Thing", labelDetails: { detail: "()", description: "./Thing" },
    kind: 7, detail: "class Thing", filterText: "Thing", sortText: "01", insertText: "Thing",
    insertTextFormat: 1, commitCharacters: [".", ","], documentation: { kind: "markdown", value: "item docs 😀" },
    textEdit: { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: "Thing" } }
  const result = { isIncomplete: true, items: [item] }
  const oracle = path.join(fixture.directory, "completion-oracle.json")
  fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, kind: "completion", result }))
  fixture.suite.targets[0].kind = "completion"
  fixture.suite.targets[0].oracle = { path: oracle, sha256: sha256File(oracle), verified: true }
  saveSuite(fixture)
  const executed = runSuite(fixture)
  assert.equal(executed.status, 1, `${executed.stderr}\n${executed.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.correctness.status, "PASS", JSON.stringify(report.failure))
  assert.equal(report.requests.length, 2)
  assert.ok(report.requests.every(request => request.correctness.equal))
  assert.deepEqual(report.requests[0].correctness.payload, result)
  assert.equal(report.gateStatus.diagnostics, "PASS")
  assert.equal(report.readiness.semantic.status, "READINESS_UNSUPPORTED")
})

test("prepared suite resolves a declared completion result with the same handle and an independently timed complete payload", async t => {
  const fixture = await makeResolveSuite(t)
  saveSuite(fixture)
  const executed = runSuite(fixture)
  assert.equal(executed.status, 1, `${executed.stderr}\n${executed.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.correctness.status, "PASS", JSON.stringify(report.failure))
  assert.equal(report.requests.length, 3)
  assert.deepEqual(report.requests.map(request => request.method),
    ["textDocument/completion", "completionItem/resolve", "completionItem/resolve"])
  for (const request of report.requests.slice(1)) {
    assert.ok(request.correctness.equal)
    assert.deepEqual(request.correctness.payload, fixture.resolved)
    assert.equal(request.completionSourceTargetId, "thing")
    assert.ok(request.elapsedMs >= 0)
  }
  assert.equal(report.timeline.filter(event => event.phase === "request-start").length, 3)
  assert.equal(report.preparation.targetQueries, 0)
})

test("prepared suite rejects wrong hover markup, ranges and omitted fields without shrinking the request denominator", async t => {
  for (const result of [
    { contents: { kind: "plaintext", value: "```arkts\nconst Thing: string\n```" },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } },
    { contents: { kind: "markdown", value: "```arkts\nconst Thing: string\n```" },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } } },
    { contents: { kind: "markdown", value: "```arkts\nconst Thing: string\n```" } },
  ]) {
    const fixture = await makeSuite(t)
    const oracle = path.join(fixture.directory, "wrong-hover-oracle.json")
    fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, kind: "hover", result }))
    fixture.suite.targets[0].kind = "hover"
    fixture.suite.targets[0].oracle = { path: oracle, sha256: sha256File(oracle), verified: true }
    saveSuite(fixture)
    const executed = runSuite(fixture)
    assert.equal(executed.status, 1, `${executed.stderr}\n${executed.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.correctness.status, "FAIL")
    assert.equal(report.requests.length, 2)
    assert.ok(report.requests.every(request => !request.correctness.equal))
    assert.ok(report.bucketSummaries.every(bucket => bucket.samples === 1 && bucket.failures === 1))
    assert.deepEqual(report.requests[0].correctness.expectedPayload, result)
  }
})

test("prepared suite does not erase invalid or semantic completion data or a changed resolve handle", async t => {
  for (const [mode, index, reason] of [["invalid-completion-handle", 0, /opaque session UUID/u],
    ["semantic-completion-data", 0, /opaque session UUID/u],
    ["wrong-resolve-handle", 1, /changed the source session handle/u]]) {
    const fixture = await makeResolveSuite(t, mode)
    saveSuite(fixture)
    const executed = runSuite(fixture)
    assert.equal(executed.status, 1, `${executed.stderr}\n${executed.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.correctness.status, "FAIL")
    assert.equal(report.requests.length, 3)
    assert.ok(!report.requests[index].correctness.equal)
    assert.match(report.requests[index].correctness.invalid.join("\n"), reason)
    const sent = report.transcript.transcript.entries.filter(entry => entry.direction === "send")
    assert.equal(sent.filter(entry => entry.method === "textDocument/completion").length, 1)
    assert.equal(sent.filter(entry => entry.method === "completionItem/resolve").length, index === 0 ? 0 : 2)
  }
})

test("prepared suite refuses a pre-edit completion source without issuing an unplanned refresh", async t => {
  const fixture = await makeResolveSuite(t)
  const changes = [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
    newText: "// body edit 😀\n" }]
  fixture.suite.scenarios = [fixture.suite.scenarios[0], { id: "edit-resolve", bucket: "edit-body", targetId: "resolved",
    edit: { file: "Query.ets", changes, sha256: digestJson(changes), oracle: fixture.suite.targets[1].oracle } }]
  saveSuite(fixture)
  const executed = runSuite(fixture)
  assert.equal(executed.status, 1, `${executed.stderr}\n${executed.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.correctness.status, "FAIL")
  assert.equal(report.requests.length, 2)
  assert.equal(report.requests[1].status, "ERROR")
  assert.equal(report.requests[1].documentVersion, 2)
  assert.match(report.requests[1].error.message, /NO_CURRENT_VALIDATED_COMPLETION/u)
  const sent = report.transcript.transcript.entries.filter(entry => entry.direction === "send")
  assert.equal(sent.filter(entry => entry.method === "textDocument/completion").length, 1)
  assert.equal(sent.filter(entry => entry.method === "completionItem/resolve").length, 0)
  assert.equal(report.timeline.filter(event => event.phase === "request-start").length, 2)
  assert.equal(fs.readFileSync(path.join(fixture.suite.workspace, "Query.ets"), "utf8"), "Thing\n")
})

test("prepared suite rejects a duplicate resolve target even when selector key order changes", async t => {
  const fixture = await makeResolveSuite(t)
  fixture.suite.targets.push({ ...fixture.suite.targets[1], id: "same-resolve",
    completionSelector: { detail: "class Thing", label: "Thing" } })
  fixture.suite.scenarios.push({ id: "false-unseen-resolve", bucket: "first-unseen-symbol", targetId: "same-resolve" })
  saveSuite(fixture)
  const executed = runSuite(fixture)
  assert.equal(executed.status, 2, `${executed.stderr}\n${executed.stdout}`)
  assert.match(executed.stderr, /PREPARED_SUITE_INVALID=DUPLICATE_TARGET/u)
  assert.equal(fs.existsSync(fixture.output), false)
})

test("prepared suite preserves every rename and call field with declared genuine call-source requests", async t => {
  const fixture = await makeEditCallSuite(t)
  saveSuite(fixture)
  const executed = runSuite(fixture)
  assert.equal(executed.status, 1, `${executed.stderr}\n${executed.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.correctness.status, "PASS", JSON.stringify(report.failure))
  assert.equal(report.requests.length, 10)
  for (const request of report.requests) {
    assert.equal(request.status, "COMPLETE")
    assert.ok(request.correctness.equal)
    assert.deepEqual(request.correctness.payload, fixture.payloads[request.kind])
    if (["outgoingCalls", "incomingCalls"].includes(request.kind)) {
      assert.equal(request.callHierarchySourceTargetId, "prepareCallHierarchy")
    }
  }
  const sent = report.transcript.transcript.entries.filter(entry => entry.direction === "send")
  assert.equal(sent.filter(entry => entry.method === "textDocument/prepareCallHierarchy").length, 2,
    "only the two declared source requests, no hidden prepare refresh")
  assert.equal(sent.filter(entry => entry.method === "callHierarchy/outgoingCalls").length, 2)
  assert.equal(sent.filter(entry => entry.method === "callHierarchy/incomingCalls").length, 2)
  assert.equal(report.preparation.targetQueries, 0)
  assert.equal(report.readiness.semantic.status, "READINESS_UNSUPPORTED")
  assert.equal(report.gateStatus.ready, "FAIL")
  assert.equal(fs.readFileSync(path.join(fixture.suite.workspace, "Query.ets"), "utf8"), "Thing\n")
})

test("prepared suite refuses a missing call source without an unplanned prepare request", async t => {
  const fixture = await makeEditCallSuite(t)
  fixture.suite.scenarios = [{ id: "missing-source", bucket: "first-unseen-symbol", targetId: "outgoingCalls" }]
  saveSuite(fixture)
  const executed = runSuite(fixture)
  assert.equal(executed.status, 1, `${executed.stderr}\n${executed.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.correctness.status, "FAIL")
  assert.equal(report.requests.length, 1)
  assert.equal(report.requests[0].status, "ERROR")
  assert.match(report.requests[0].error.message, /NO_CURRENT_VALIDATED_PREPARE/)
  const sent = report.transcript.transcript.entries.filter(entry => entry.direction === "send")
  assert.equal(sent.filter(entry => entry.method === "textDocument/prepareCallHierarchy").length, 0)
  assert.equal(sent.filter(entry => entry.method === "callHierarchy/outgoingCalls").length, 0)
})

test("prepared suite refuses a pre-edit call source while preserving the full request denominator", async t => {
  const fixture = await makeEditCallSuite(t)
  const target = fixture.suite.targets.find(target => target.kind === "incomingCalls")
  const changes = [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, newText: "// body 😀\n" }]
  fixture.suite.scenarios = [{ id: "source", bucket: "first-unseen-symbol", targetId: "prepareCallHierarchy" },
    { id: "stale-source", bucket: "edit-body", targetId: target.id,
      edit: { file: target.file, changes, sha256: digestJson(changes), oracle: target.oracle } }]
  saveSuite(fixture)
  const executed = runSuite(fixture)
  assert.equal(executed.status, 1, `${executed.stderr}\n${executed.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.correctness.status, "FAIL")
  assert.equal(report.requests.length, 2)
  assert.equal(report.requests[0].correctness.equal, true)
  assert.equal(report.requests[1].status, "ERROR")
  assert.equal(report.requests[1].documentVersion, 2)
  assert.match(report.requests[1].error.message, /NO_CURRENT_VALIDATED_PREPARE/)
  const sent = report.transcript.transcript.entries.filter(entry => entry.direction === "send")
  assert.equal(sent.filter(entry => entry.method === "textDocument/prepareCallHierarchy").length, 1)
  assert.equal(sent.filter(entry => entry.method === "callHierarchy/incomingCalls").length, 0)
})

test("prepared suite rejects wrong snapshot edit versions even when the oracle repeats that wrong version", async t => {
  const fixture = await makeEditCallSuite(t, "wrong-rename-version")
  const target = fixture.suite.targets.find(target => target.kind === "rename")
  fixture.payloads.rename.documentChanges[0].textDocument.version = 2
  fs.writeFileSync(target.oracle.path, JSON.stringify({ schemaVersion: 1, kind: "rename", result: fixture.payloads.rename }))
  target.oracle.sha256 = sha256File(target.oracle.path)
  fixture.suite.scenarios = [{ id: "wrong-version", bucket: "first-unseen-symbol", targetId: target.id }]
  saveSuite(fixture)
  const executed = runSuite(fixture)
  assert.equal(executed.status, 1, `${executed.stderr}\n${executed.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.correctness.status, "FAIL")
  assert.equal(report.requests.length, 1)
  assert.equal(report.requests[0].documentVersion, 1)
  assert.deepEqual(report.requests[0].correctness.payload, fixture.payloads.rename)
  assert.ok(report.requests[0].correctness.invalid.some(message => message.includes("EDIT_VERSION")))
})

async function makeEditCallSuite(t, mode = "normal") {
  const fixture = await makeSuite(t, mode)
  fixture.suite.workspace = fs.realpathSync(fixture.suite.workspace)
  const uri = pathToFileURL(path.join(fixture.suite.workspace, "Query.ets")).href
  const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }
  const item = { name: "Thing", kind: 12, tags: [1], detail: "public Thing 😀", uri, range, selectionRange: range,
    data: { arktsCallHierarchy: { protocol: 1, rootUri: pathToFileURL(fixture.suite.workspace).href } } }
  const payloads = { prepareRename: { range, placeholder: "Thing" },
    rename: { documentChanges: [{ textDocument: { uri, version: 1 }, edits: [{ range, newText: "RenamedThing" }] }] },
    prepareCallHierarchy: [item], outgoingCalls: [{ to: item, fromRanges: [range] }],
    incomingCalls: [{ from: item, fromRanges: [range] }] }
  const base = fixture.suite.targets[0]
  fixture.suite.targets = Object.entries(payloads).map(([kind, result]) => {
    const oracle = path.join(fixture.directory, `${kind}-oracle.json`)
    fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, kind, result }))
    return { ...base, id: kind, kind, ...(kind === "rename" ? { newName: "RenamedThing" } : {}),
      ...(["outgoingCalls", "incomingCalls"].includes(kind)
        ? { callHierarchyTargetId: "prepareCallHierarchy", callHierarchySelector: { name: "Thing", kind: 12 } } : {}),
      oracle: { path: oracle, sha256: sha256File(oracle), verified: true } }
  })
  fixture.suite.scenarios = [
    ...fixture.suite.targets.map(({ id }) => ({ id: `first-${id}`, bucket: "first-unseen-symbol", targetId: id })),
    ...fixture.suite.targets.map(({ id }) => ({ id: `repeat-${id}`, bucket: "repeated-snapshot", targetId: id })),
  ]
  return { ...fixture, payloads }
}

async function makeResolveSuite(t, mode = "normal") {
  const fixture = await makeSuite(t, mode)
  const item = { label: "Thing", labelDetails: { detail: "()", description: "./Thing" },
    kind: 7, detail: "class Thing", filterText: "Thing", sortText: "01", insertText: "Thing",
    insertTextFormat: 1, commitCharacters: [".", ","], documentation: { kind: "markdown", value: "item docs 😀" },
    textEdit: { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: "Thing" } }
  const resolved = { ...item, detail: "resolved class Thing", documentation: { kind: "markdown", value: "resolved docs 😀" },
    additionalTextEdits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      newText: 'import { Thing } from "./Thing";\n' }] }
  const oracles = {}
  for (const [kind, result] of [["completion", { isIncomplete: true, items: [item] }], ["completionResolve", resolved]]) {
    const file = path.join(fixture.directory, `${kind}-oracle.json`)
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, kind, result }))
    oracles[kind] = { path: file, sha256: sha256File(file), verified: true }
  }
  fixture.suite.targets[0].kind = "completion"
  fixture.suite.targets[0].oracle = oracles.completion
  fixture.suite.targets.push({ ...fixture.suite.targets[0], id: "resolved", kind: "completionResolve",
    completionTargetId: "thing", completionSelector: { label: "Thing", detail: "class Thing" },
    oracle: oracles.completionResolve })
  fixture.suite.scenarios = [fixture.suite.scenarios[0],
    { id: "resolve-first", bucket: "first-unseen-symbol", targetId: "resolved" },
    { id: "resolve-repeat", bucket: "repeated-snapshot", targetId: "resolved" }]
  return { ...fixture, item, resolved }
}
