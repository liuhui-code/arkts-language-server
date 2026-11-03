import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../tests/support/semantic-readiness-lsp.mjs"

// Run with: node --test --test-concurrency=1 scripts/measure-witness-budget.mjs
// A Linux metadata accounting probe, not an official SDK/Windows latency benchmark.
assert.equal(process.platform, "linux", "This controlled root-length probe requires Linux")
const evidence = path.resolve(process.env.ARKTS_WITNESS_EVIDENCE_DIR ?? ".bench/witness-budget-measurement")
fs.mkdirSync(evidence, { recursive: true })
const count = 23785

for (const extra of [0, 192, 384]) test(`23787 closure extra path ${extra}`, { timeout: 180_000 }, async t => {
  const originalTmp = process.env.TMPDIR, base = os.tmpdir()
  if (extra) {
    const nested = path.join(base, ...Array.from({ length: extra / 64 }, (_, i) =>
      String.fromCharCode(97 + i).repeat(63)))
    fs.mkdirSync(nested, { recursive: true })
    process.env.TMPDIR = nested
  }
  let f
  try {
    f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined, ARKTS_REFERENCES_TRACE: undefined,
      NODE_OPTIONS: `--require=${path.resolve("tests/fixtures/witness-budget-observer.cjs")}` })
  } finally {
    if (originalTmp === undefined) delete process.env.TMPDIR
    else process.env.TMPDIR = originalTmp
  }
  fs.unlinkSync(path.join(f.workspace, "Unopened.ets"))
  const imports = []
  for (let index = 0; index < count; index++) {
    const name = `File${String(index).padStart(5, "0")}`
    imports.push(`import { Value${index} } from './${name}'`)
    fs.writeFileSync(path.join(f.workspace, name + ".ets"), `export class Value${index} {}\n`)
  }
  const source = `import { Target } from './Target'\n${imports.join("\n")}\nexport const value = new Target()\n`
  fs.writeFileSync(path.join(f.workspace, "Main.ets"), source)
  fs.writeFileSync(path.join(f.workspace, "Target.ets"), "export class Target {}\n")
  const start = performance.now()
  try {
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } }, timeoutMs: 10_000 })
    const prepared = await f.session.transport.notification("arkts/semanticPreparation",
      message => message.params.phase === "complete", 90_000)
    const expected = [{ uri: f.uri("Target.ets"), range: {
      start: { line: 0, character: 13 }, end: { line: 0, character: 19 } } }]
    const times = []
    for (let repeat = 0; repeat < 2; repeat++) {
      const at = performance.now()
      const response = await f.session.request("textDocument/definition", {
        textDocument: { uri: f.uri("Main.ets") }, position: { line: count + 1, character: 26 } }, { timeoutMs: 90_000 })
      times.push(performance.now() - at)
      if (extra === 384) assert.equal(response.error?.code, -32803, JSON.stringify(response))
      else { assert.equal(response.error, undefined, JSON.stringify(response)); assert.deepEqual(response.result, expected) }
    }
    assert.deepEqual(prepared.params.report.unavailableReasons, ["project-membership-incomplete"])
    const observations = fs.readFileSync(path.join(f.directory, "witness-measure.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse)
    const maximum = observations.reduce((left, right) => left.bytes > right.bytes ? left : right)
    assert.ok(maximum.facts > 4096 && maximum.bytes <= maximum.limit)
    fs.writeFileSync(path.join(evidence, `measurement-${extra}.json`), JSON.stringify({
      sourceFiles: count + 2, padding: extra, node: process.version, preparation: prepared.params.report,
      elapsedMs: performance.now() - start, definitionMs: times, observations,
      events: f.events().filter(event => /semantic.worker.(started|unresponsive)/.test(event.event)) }, null, 2))
    t.diagnostic(JSON.stringify({ padding: extra, preparation: prepared.params.report, max: maximum, definitionMs: times }))
    assert.equal(f.events().filter(event => event.event === "semantic.worker.started").length, 1)
    assert.ok(!f.events().some(event => event.event === "semantic.worker.unresponsive"))
    assert.deepEqual((await f.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
  } finally {
    const facts = path.join(f.directory, "witness-measure.jsonl")
    for (const [name, content] of [["events", JSON.stringify(f.events(), null, 2)],
      ["stderr", f.session.transport.stderr], ["facts", fs.existsSync(facts) ? fs.readFileSync(facts, "utf8") : "none"]]) {
      fs.writeFileSync(path.join(evidence, `measurement-${extra}-${name}.txt`), content ?? "unavailable")
    }
  }
})
