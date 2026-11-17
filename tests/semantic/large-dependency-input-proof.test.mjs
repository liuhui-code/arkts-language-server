import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"
import { createTestSdk, positionAt } from "../support/reference-coverage-replay.mjs"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("default membership preserves complete references and rename beyond both former catalog bounds",
  { timeout: 120_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined })
    const noise = path.join(f.workspace, "unrelated-source-component-".repeat(3))
    fs.mkdirSync(noise)
    for (let i = 0; i < 30_000; i++) fs.writeFileSync(path.join(noise, `Unused${i}.ts`), `export const unused${i} = ${i}\n`)
    const late = 'import { neverQueried } from "./Unopened"\nexport const late = neverQueried()\n'
    fs.writeFileSync(path.join(f.workspace, "ZZLast.ets"), late)
    try {
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } }, timeoutMs: 10_000 })
    const create = await f.session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
    f.session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
    await f.session.transport.progress(create.params.token, m => m.params.value.kind === "end", 60_000)
    const locations = (name, text) => {
      const result = []
      for (let i = text.indexOf("neverQueried"); i >= 0; i = text.indexOf("neverQueried", i + 1)) {
        result.push({ uri: f.uri(name), range: { start: positionAt(text, i), end: positionAt(text, i + 12) } })
      }
      return result
    }
    const expected = [...locations("Main.ets", f.sources["Main.ets"]),
      ...locations("Unopened.ets", f.sources["Unopened.ets"]), ...locations("ZZLast.ets", late)]
    const sorted = values => values.map(x => JSON.stringify(x)).sort()
    const params = { textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 23 } }
    const start = performance.now()
    const refs = await f.session.request("textDocument/references", { ...params, context: { includeDeclaration: true } }, { timeoutMs: 60_000 })
    const referencesMs = performance.now() - start
    assert.equal(refs.error, undefined, JSON.stringify(refs))
    assert.deepEqual(sorted(refs.result), sorted(expected), "include the closed consumer outside the old prefix")
    const renameStart = performance.now()
    const rename = await f.session.request("textDocument/rename", {
      textDocument: { uri: f.uri("Unopened.ets") },
      position: positionAt(f.sources["Unopened.ets"], f.sources["Unopened.ets"].indexOf("neverQueried") + 1),
      newName: "renamedFunction",
    }, { timeoutMs: 60_000 })
    assert.equal(rename.error, undefined, JSON.stringify(rename))
    const edits = rename.result.documentChanges.flatMap(c => c.edits.map(edit => {
      assert.equal(edit.newText, "renamedFunction")
      return { uri: c.textDocument.uri, range: edit.range }
    }))
    assert.deepEqual(sorted(edits), sorted(expected), "rename must be complete, not a partial edit set")
    t.diagnostic(JSON.stringify({ sources: 30_003, referencesMs, renameMs: performance.now() - renameStart }))
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
    } finally {
      await f.session.close().catch(() => {})
      if (process.env.ARKTS_TEST_EVIDENCE_DIR) {
        const target = path.join(process.env.ARKTS_TEST_EVIDENCE_DIR, "large-default-membership")
        fs.mkdirSync(target, { recursive: true })
        fs.writeFileSync(path.join(target, "transcript.json"), JSON.stringify(f.session.transport.transcriptEntries))
        const log = path.join(f.directory, "logs/server.log")
        if (fs.existsSync(log)) fs.copyFileSync(log, path.join(target, "server.log"))
      }
    }
  })

test("cold compiler snapshots consume the admitted read identity without duplicate physical guard windows",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/cold-source-read-observation.cjs"))}` })
    const imports = []
    for (let index = 0; index < 300; index++) {
      const name = `Dep${String(index).padStart(3, "0")}`
      fs.writeFileSync(path.join(f.workspace, name + ".ets"), `export const value${index} = ${index}\n`)
      imports.push(`import { value${index} } from "./${name}"`)
    }
    const main = imports.join("\n") + "\nexport const selected = value299\n"
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), main)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } }, timeoutMs: 10_000 })
    const prepared = await f.session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === f.rootUri && message.params.phase === "complete", 20_000)
    assert.equal(prepared.params.report.semanticState, "ready", JSON.stringify(prepared.params))
    const params = { textDocument: { uri: f.uri("Main.ets") }, position: positionAt(main, main.lastIndexOf("value299") + 1) }
    const definition = await f.session.request("textDocument/definition", params)
    assert.equal(definition.error, undefined, JSON.stringify(definition))
    assert.deepEqual(definition.result, [{ uri: f.uri("Dep299.ets"), range: {
      start: { line: 0, character: 13 }, end: { line: 0, character: 21 } } }])
    const file = path.join(f.directory, "cold-source-read-guards.jsonl")
    const rows = fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : []
    t.diagnostic(JSON.stringify({ sources: 302, duplicateColdPhysicalGuards: rows.length,
      distinctPaths: new Set(rows.map(row => row.file)).size }))
    assert.equal(rows.length, 0, "the descriptor-guarded admitted read must supply the cold snapshot identity")
    const provenance = fs.readFileSync(path.join(f.directory, "cold-source-read-provenance.jsonl"), "utf8")
      .trim().split("\n").filter(Boolean).map(JSON.parse)
    const lazyPaths = new Set(provenance.filter(row => row.kind === "lazy-read").map(row => row.file))
    const redundant = provenance.filter(row => row.kind === "proof-read" && lazyPaths.has(row.file))
    t.diagnostic(JSON.stringify({ admittedLazyFiles: lazyPaths.size, redundantReadinessReads: redundant.length,
      firstRedundantCaller: redundant[0]?.caller }))
    assert.ok(lazyPaths.size > 0, "actual cold reads participate in the complete prepared Program")
    assert.equal(redundant.length, 0,
      "readiness must consume the exact admitted compiler-source read provenance, without loading those bytes again")
    fs.writeFileSync(path.join(f.workspace, "Dep299.ets"), "// actual unnotified disk update\nexport const value299 = 299\n")
    const changed = await f.session.request("textDocument/definition", params)
    if (changed.error) assert.equal(changed.error.code, -32803, JSON.stringify(changed))
    else assert.equal(changed.result[0].range.start.line, 1)
    // A real notification admits the new source revision; refusal alone never
    // authorizes silently restamping the previous cold-load proof.
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: f.uri("Dep299.ets"), type: 2 }] } })
    const current = await f.session.request("textDocument/definition", params)
    assert.equal(current.error, undefined, JSON.stringify(current))
    assert.equal(current.result[0].range.start.line, 1, "borrowed load identity cannot certify an old source location")
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("original cold read provenance cannot certify bytes changed before registry adoption",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/cold-source-provenance-window.cjs"))}` })
    const imports = []
    for (let index = 0; index < 300; index++) {
      const name = `Dep${String(index).padStart(3, "0")}`
      fs.writeFileSync(path.join(f.workspace, name + ".ets"), `export const value${index} = ${index}\n`)
      imports.push(`import { value${index} } from "./${name}"`)
    }
    const main = imports.join("\n") + "\nexport const selected = value299\n"
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), main)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const prepared = await f.session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === f.rootUri && message.params.phase === "complete", 20_000)
    const window = JSON.parse(fs.readFileSync(path.join(f.directory, "cold-provenance-window.json"), "utf8"))
    assert.equal(window.stage, "after-registry-acquire-before-read-provenance")
    assert.notEqual(window.originalCompilerText, window.currentDiskText)
    assert.equal(prepared.params.report.semanticState, "degraded", JSON.stringify(prepared.params))
    assert.ok(prepared.params.report.unavailableReasons.some(reason =>
      ["current-program-inputs-unproven", "inputs-changed-during-preparation"].includes(reason)),
      JSON.stringify(prepared.params))
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: f.uri("Dep299.ets"), type: 2 }] } })
    const ready = await f.session.request("arkts/semanticReadiness", { rootUri: f.rootUri, prepare: true })
    assert.equal(ready.error, undefined, JSON.stringify(ready))
    assert.equal(ready.result.semanticState, "ready", JSON.stringify(ready))
    const current = await f.session.request("textDocument/definition", {
      textDocument: { uri: f.uri("Main.ets") }, position: positionAt(main, main.lastIndexOf("value299") + 1) })
    assert.equal(current.error, undefined, JSON.stringify(current))
    assert.deepEqual(current.result, [{ uri: f.uri("Dep299.ets"), range: {
      start: { line: 1, character: 13 }, end: { line: 1, character: 21 } } }])
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

for (const count of [128, 4608]) {
  test(`current-input proof retains a valid ${count}-source dependency closure`, { timeout: 60_000 }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-input-proof-"))
    const root = path.join(directory, "workspace"), sdk = createTestSdk(t)
    fs.mkdirSync(path.join(root, "lib", "deps"), { recursive: true })
    const main = 'import { Counter } from "./lib/Counter"\nexport const instance = new Counter()\n'
    const counter = 'import { value0 } from "./deps/n0"\nexport class Counter { value: number = value0() }\n'
    fs.writeFileSync(path.join(root, "Main.ets"), main)
    fs.writeFileSync(path.join(root, "lib/Counter.ets"), counter)
    for (let index = 0; index < count - 2; index++) {
      const children = Array.from({ length: 32 }, (_, j) => index * 32 + j + 1).filter(x => x < count - 2)
      const text = children.map(x => `import { value${x} } from "./n${x}"\n`).join("")
        + `export function value${index}(): number { return ${children.length ? children.map(x => `value${x}()`).join(" + ") : "1"} }\n`
      fs.writeFileSync(path.join(root, `lib/deps/n${index}.ets`), text)
    }
    const logs = path.join(directory, "logs")
    const session = new LspSession({
      args: [process.env.ARKTS_TEST_SERVER_PATH ?? path.join(projectRoot, "dist/server.cjs"), "--stdio"],
      rootUri: pathToFileURL(root).href,
      capabilities: { window: { workDoneProgress: true } },
      env: {
        ARKLINE_HARMONY_SDK_PATH: sdk, DEVECO_SDK_HOME: sdk,
        ARKTS_INDEX_CACHE_DIR: path.join(directory, "cache"), ARKTS_LSP_LOG_DIR: logs,
        ARKTS_INDEX_SIDECAR_PATH: process.env.ARKTS_TEST_NATIVE_BINARY
          ?? path.join(projectRoot, "target/release/arkts-index-sidecar"),
        ARKTS_REFERENCES_TRACE: "1", ARKTS_BENCHMARK_CONTROL: "0",
      },
    })
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
    try {
      await session.initialize({ timeoutMs: 10_000 })
      const create = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
      session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
      await session.transport.progress(create.params.token, message => message.params.value.kind === "end", 30_000)
      const uri = pathToFileURL(path.join(root, "Main.ets")).href
      session.openDocument({ uri, version: 1, text: main })
      for (const withinName of [1, 2]) {
        const response = await session.request("textDocument/definition", {
          textDocument: { uri }, position: positionAt(main, main.indexOf("new Counter") + 4 + withinName),
        }, { timeoutMs: 30_000 })
        assert.equal(response.error, undefined, JSON.stringify(response.error))
        const at = counter.indexOf("class Counter") + 6
        assert.deepEqual(response.result, [{
          uri: pathToFileURL(path.join(root, "lib/Counter.ets")).href,
          range: { start: positionAt(counter, at), end: positionAt(counter, at + 7) },
        }])
      }
    } finally {
      await session.close().catch(() => {})
      if (process.env.ARKTS_TEST_EVIDENCE_DIR) {
        const target = path.join(process.env.ARKTS_TEST_EVIDENCE_DIR, `source-proof-${count}`)
        fs.mkdirSync(target, { recursive: true })
        fs.writeFileSync(path.join(target, "transcript.json"), JSON.stringify(session.transport.transcriptEntries))
        if (fs.existsSync(path.join(logs, "server.log"))) fs.copyFileSync(path.join(logs, "server.log"), path.join(target, "server.log"))
      }
    }
  })
}
