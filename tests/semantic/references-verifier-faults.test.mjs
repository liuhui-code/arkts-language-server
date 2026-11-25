import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture, initializeReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

for (const mode of ["exit", "spawn", "send"]) {
test(`nested verifier fatal failures consume the existing recovery budget (mode=${mode})`, { timeout: 40000 }, async t => {
  const f = createReadinessFixture(t, { ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
    ARKTS_MEMORY_BUDGET_MB: "4096",
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/verifier-job-gates.cjs"))}` })
  const controls = path.join(f.directory, "verifier-controls.json")
  fs.writeFileSync(controls, JSON.stringify({ mode, crashRemaining: 4, gateFallback: false }))
  await initializeReadinessFixture(f)
  const params = { textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 25 },
    context: { includeDeclaration: true } }
  for (let index = 0; index < 4; index++) {
    if (mode === "send") {
      const current = JSON.parse(fs.readFileSync(controls, "utf8"))
      fs.writeFileSync(controls, JSON.stringify({ ...current, armedSend: false }))
      const warm = await f.session.request("textDocument/references", params, { timeoutMs: 10000 })
      assert.equal(warm.error, undefined, JSON.stringify(warm))
      fs.writeFileSync(controls, JSON.stringify({ ...current, armedSend: true }))
      const edit = { uri: f.uri("Main.ets"), version: index + 1, text: f.sources["Main.ets"] + `// send ${index}\n` }
      if (index === 0) f.session.openDocument(edit)
      else f.session.changeDocument(edit)
    }
    const result = await f.session.request("textDocument/references", params, { timeoutMs: 10000 })
    assert.ok(result.error, JSON.stringify(result))
    assert.equal(result.result, undefined, "a fatal verifier cannot publish incomplete success")
    await until(() => index < 3
      ? f.events().filter(e => e.event === "semantic.worker.recovery.complete").length === index + 1
      : f.events().some(e => e.event === "semantic.worker.recovery.stopped"))
  }
  const starts = f.events().filter(e => e.event === "semantic.worker.started").length
  assert.equal(starts, 4, "one original semantic Worker plus three budgeted replacements")
  const blocked = await f.session.request("textDocument/references", params, { timeoutMs: 10000 })
  assert.ok(blocked.error)
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, starts)
  const injected = fs.readFileSync(path.join(f.directory, "verifier-jobs.jsonl"), "utf8")
    .trim().split("\n").map(JSON.parse).filter(e => e.event === "verifier-fatal-injected")
  assert.equal(injected.length, 4)
  t.diagnostic(JSON.stringify({ mode, starts, fatalAttempts: injected.length, blocked: blocked.error }))
})
}

async function until(predicate) {
  const deadline = performance.now() + 10000
  while (!predicate()) {
    assert.ok(performance.now() < deadline, "nested fatal did not reach the existing recovery terminal")
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
