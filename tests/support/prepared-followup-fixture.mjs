import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { capturePreparedIdentity } from "../../scripts/bench/prepared-suite-input.mjs"
import { sha256File } from "../../scripts/bench/reference-replay-input.mjs"
import { productionSuite, saveSuite } from "./prepared-suite-fixture.mjs"

/** Source-derived complete oracles; no target response is used to construct expectations. */
export async function productionFollowupSuite(t, opened) {
  const fixture = await productionSuite(t)
  const { suite } = fixture
  const query = "export class Widget {\n  /** Restart value documentation 😀 */\n  value: number = 1\n}\n"
  const use = 'import { Widget } from "./Query"\nconst instance = new Widget()\nexport const selected = instance.value\n'
  fs.writeFileSync(path.join(suite.workspace, "Query.ets"), query)
  fs.writeFileSync(path.join(suite.workspace, "Use.ets"), use)
  for (const args of [["add", "Query.ets", "Use.ets"], ["-c", "user.name=Test", "-c",
    "user.email=test@example.invalid", "commit", "-qm", "production follow-up fixture"]]) {
    const result = spawnSync("git", args, { cwd: suite.workspace, encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
  }
  const line = use.split("\n")[2]
  const range = { start: { line: 2, character: line.indexOf("value") }, end: { line: 2, character: line.length } }
  const item = { label: "value", detail: "TypeScript property", kind: 5, insertText: "value",
    sortText: "11", textEdit: { range, newText: "value" } }
  const resolved = { ...item, detail: "(property) Widget.value: number", documentation: "Restart value documentation 😀" }
  const source = { moduleId: "use", file: "Use.ets", symbol: "value",
    sourceSha256: sha256File(path.join(suite.workspace, "Use.ets")),
    position: { line: 2, character: line.length } }
  suite.targets = [
    { ...source, id: "value-list", kind: "completion",
      oracle: payloadOracle("completion", { isIncomplete: false, items: [item] }) },
    { ...source, id: "value-resolve", kind: "completionResolve", completionTargetId: "value-list",
      completionSelector: { label: "value", kind: 5 }, oracle: payloadOracle("completionResolve", resolved) },
  ]
  suite.readiness.candidateControl = false
  suite.preOpenTargetIds = opened ? ["value-list"] : []
  suite.runtime.env.ARKTS_REFERENCES_TRACE = "0"
  suite.scenarios = [
    { id: "new-list", bucket: "restart-after-validated-ready", targetId: "value-list" },
    { id: "new-resolve", bucket: "restart-after-validated-ready", targetId: "value-resolve" },
  ]
  suite.pins = await capturePreparedIdentity(suite)
  saveSuite(fixture)
  return fixture

  function payloadOracle(kind, result) {
    const file = path.join(fixture.directory, `${kind}.json`)
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, kind, result }))
    return { path: file, sha256: sha256File(file), verified: true }
  }
}

export async function productionCallSuite(t, opened) {
  const fixture = await productionFollowupSuite(t, opened)
  const { suite } = fixture
  const targetText = "export function target(): number { return 1 }"
  const callerText = "export function caller(): number { return target() }"
  const query = fs.readFileSync(path.join(suite.workspace, "Query.ets"), "utf8") + targetText + "\n"
  const use = fs.readFileSync(path.join(suite.workspace, "Use.ets"), "utf8")
    .replace("{ Widget }", "{ Widget, target }") + callerText + "\n"
  fs.writeFileSync(path.join(suite.workspace, "Query.ets"), query)
  fs.writeFileSync(path.join(suite.workspace, "Use.ets"), use)
  const commit = spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid",
    "commit", "-am", "call follow-up fixture", "-q"], { cwd: suite.workspace, encoding: "utf8" })
  assert.equal(commit.status, 0, commit.stderr)
  const data = { arktsCallHierarchy: { protocol: 1, rootUri: pathToFileURL(suite.workspace).href } }
  const item = (name, file, line, text) => ({ name, kind: 12, uri: pathToFileURL(path.join(suite.workspace, file)).href,
    range: { start: { line, character: 0 }, end: { line, character: text.length } },
    selectionRange: { start: { line, character: text.indexOf(name) }, end: { line, character: text.indexOf(name) + name.length } }, data })
  const caller = item("caller", "Use.ets", 3, callerText), target = item("target", "Query.ets", 4, targetText)
  const fromRanges = [{ start: { line: 3, character: callerText.indexOf("target") },
    end: { line: 3, character: callerText.indexOf("target") + "target".length } }]
  const prepared = (id, source) => ({ id, moduleId: source.uri.endsWith("/Use.ets") ? "use" : "query",
    file: source.uri.endsWith("/Use.ets") ? "Use.ets" : "Query.ets", symbol: source.name,
    position: { ...source.selectionRange.start, character: source.selectionRange.start.character + 1 },
    kind: "prepareCallHierarchy" })
  const callerTarget = prepared("caller-prepare", caller), targetTarget = prepared("target-prepare", target)
  suite.targets = [
    { ...callerTarget, oracle: oracle("caller-prepare", "prepareCallHierarchy", [caller]) },
    { ...callerTarget, id: "outgoing", kind: "outgoingCalls", callHierarchyTargetId: "caller-prepare",
      callHierarchySelector: { name: "caller", kind: 12 }, oracle: oracle("outgoing", "outgoingCalls", [{ to: target, fromRanges }]) },
    { ...targetTarget, oracle: oracle("target-prepare", "prepareCallHierarchy", [target]) },
    { ...targetTarget, id: "incoming", kind: "incomingCalls", callHierarchyTargetId: "target-prepare",
      callHierarchySelector: { name: "target", kind: 12 }, oracle: oracle("incoming", "incomingCalls", [{ from: caller, fromRanges }]) },
  ].map(target => ({ ...target, sourceSha256: sha256File(path.join(suite.workspace, target.file)) }))
  suite.preOpenTargetIds = opened ? ["caller-prepare"] : []
  suite.scenarios = suite.targets.map(target => ({ id: target.id, bucket: "restart-after-validated-ready", targetId: target.id }))
  suite.pins = await capturePreparedIdentity(suite)
  saveSuite(fixture)
  return fixture

  function oracle(id, kind, result) {
    const file = path.join(fixture.directory, `${id}.json`)
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, kind, result }))
    return { path: file, sha256: sha256File(file), verified: true }
  }
}
