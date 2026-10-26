import assert from "node:assert/strict"
import test from "node:test"
import { auditFixture, until } from "../support/worker-recovery-audit.mjs"

// Bounded independent model: accepted full text and document version, not the implementation's journal.
function position(text, offset) {
  const lines = text.slice(0, offset).split(/\r\n|\n|\r/)
  return { line: lines.length - 1, character: lines.at(-1).length }
}
const words = Array.from({ length: 8 }, (_, bits) => [2, 1, 0].map(shift => bits & (1 << shift) ? "B" : "A").join(""))

for (const word of words) {
  test("all three-edit replay interleavings preserve exact UTF-16 semantics: " + word, { timeout: 25000 }, async t => {
    const f = await auditFixture(t, "model-" + word)
    const model = {
      A: { file: "Main.ets", version: 1, text: f.sources["Main.ets"] },
      B: { file: "Unopened.ets", version: 1, text: f.sources["Unopened.ets"] },
    }
    await f.initialize()
    for (const value of Object.values(model)) f.session.openDocument({ uri: f.uri(value.file), version: value.version, text: value.text })
    await f.readiness()
    f.write("unresponsive-fault.json", { stage: "mutation", remaining: 1, then: "startup" })
    model.A.version++
    model.A.text = "// trigger\n" + model.A.text
    f.session.changeDocument({ uri: f.uri(model.A.file), version: model.A.version, text: model.A.text })
    await until(() => {
      try { return f.read("unresponsive-entered.json").stage === "startup" } catch { return false }
    }, "replacement snapshot before model edits")
    const trace = []
    for (const label of word) {
      const value = model[label]
      value.version++
      value.text = (label === "A" ? "// A" + value.version + "\r\n" : "/* 😀 B" + value.version + " */ ") + value.text
      trace.push({ label, ...value })
      f.session.changeDocument({ uri: f.uri(value.file), version: value.version, text: value.text })
    }
    f.report.observations.model = structuredClone(model)
    f.report.observations.trace = trace
    await f.barrier()
    f.release()
    const query = position(model.A.text, model.A.text.lastIndexOf("neverQueried") + 2)
    const start = position(model.B.text, model.B.text.indexOf("neverQueried"))
    const end = { ...start, character: start.character + "neverQueried".length }
    const expected = [{ uri: f.uri(model.B.file), range: { start, end } }]
    f.report.observations.expected = expected
    const first = await f.definition(model.A.file, query.line, query.character)
    const repeated = await f.definition(model.A.file, query.line, query.character)
    f.report.observations.first = first
    f.report.observations.repeated = repeated
    f.report.observations.readiness = await f.readiness()
    assert.deepEqual(first.result, expected, JSON.stringify({ word, first, expected }))
    assert.deepEqual(repeated.result, expected)
  })
}
