import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture, initializeReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

for (const lateTerminal of [false, true]) {
test(`cancelling the outer fallback preserves the next request on the same verifier (late terminal=${lateTerminal})`, { timeout: 30000 }, async t => {
  const fixture = createReadinessFixture(t, {
    ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0", ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR: "1",
    ARKTS_MEMORY_BUDGET_MB: "4096",
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/verifier-job-gates.cjs"))}`,
  })
  const { workspace, session, uri, directory } = fixture
  fs.writeFileSync(path.join(directory, "verifier-controls.json"), JSON.stringify({ lateTerminal }))
  for (const name of ["Main.ets", "Unopened.ets"]) fs.unlinkSync(path.join(workspace, name))
  const sources = {
    "Target.ets": "export class Thing {}\nexport function f(Thing: number) { return Thing }\n",
    "Barrel.ets": 'export { Thing as PublicThing } from "./Target"\n',
    "Query.ets": 'import { PublicThing } from "./Barrel"\nexport const query = new PublicThing()\n',
    "Use.ets": 'import { PublicThing } from "./Barrel"\nexport const use = new PublicThing()\n',
    "SameName.ets": "export class PublicThing {}\n",
  }
  for (const [file, text] of Object.entries(sources)) fs.writeFileSync(path.join(workspace, file), text)
  await initializeReadinessFixture(fixture, 5)
  session.openDocument({ uri: uri("Target.ets"), version: 1, text: sources["Target.ets"] })
  if (lateTerminal) session.openDocument({ uri: uri("Query.ets"), version: 1, text: sources["Query.ets"] })
  const params = { textDocument: { uri: uri("Target.ets") }, position: { line: 1, character: 43 },
    context: { includeDeclaration: true } }
  session.transport.send({ jsonrpc: "2.0", id: 900, method: "textDocument/references", params })
  const observations = () => {
    const file = path.join(directory, "verifier-jobs.jsonl")
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : []
  }
  await until(() => observations().some(e => e.event === "fallback-gate"))
  session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: 900 } })
  const cancelled = await session.transport.response(900, 10000)
  assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
  assert.equal(cancelled.result, undefined)
  const nextParams = lateTerminal ? { ...params, textDocument: { uri: uri("Query.ets") },
    position: { line: 1, character: 26 } } : params
  const response = await session.request("textDocument/references", nextParams, { timeoutMs: 10000 })
  assert.equal(response.error, undefined, JSON.stringify(response))
  const triples = lateTerminal ? [["Target.ets", 0, 13, 18], ["Barrel.ets", 0, 9, 14],
    ["Barrel.ets", 0, 18, 29], ["Query.ets", 0, 9, 20], ["Query.ets", 1, 25, 36],
    ["Use.ets", 0, 9, 20], ["Use.ets", 1, 23, 34]] : [["Target.ets", 1, 18, 23], ["Target.ets", 1, 42, 47]]
  const expected = triples.map(([file, line, start, end]) => ({ uri: uri(file), range: {
    start: { line, character: start }, end: { line, character: end },
  } }))
  assert.deepEqual(response.result.map(JSON.stringify).sort(), expected.map(JSON.stringify).sort())
  assert.equal(observations().filter(e => e.event === "verifier-created").length, 1,
    "a completed job's outer cancellation must not force cold replacement")
  assert.ok(observations().some(e => e.event === "cancellation-observed"))
  if (lateTerminal) assert.ok(observations().some(e => e.event === "late-terminal-injected"),
    "the stale terminal control must actually reach the reused Worker")
  const closed = await session.close()
  assert.deepEqual(closed.exit, { code: 0, signal: null })
  assert.equal(observations().filter(e => e.event === "verifier-exited").length, 1)
  const phases = new Map()
  for (const event of fs.readFileSync(path.join(directory, "logs/server.log"), "utf8").trim().split("\n").map(JSON.parse)) {
    if (event.event !== "references.verifier.job") continue
    const states = phases.get(event.jobId) ?? []
    states.push(event.phase); phases.set(event.jobId, states)
  }
  assert.ok(phases.size > 0, "trace must correlate actual verifier jobs, not only physical Worker occupancy")
  for (const states of phases.values()) assert.deepEqual(states, ["queued", "running", "settling", "settled"])
})
}

async function until(predicate) {
  const end = performance.now() + 10000
  while (!predicate()) {
    assert.ok(performance.now() < end, "public reference request did not reach the fallback gate")
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
