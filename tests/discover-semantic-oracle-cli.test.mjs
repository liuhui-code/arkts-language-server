import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { capturePreparedIdentity, digestJson } from "../scripts/bench/prepared-suite-input.mjs"
import { sha256File } from "../scripts/bench/reference-replay-input.mjs"
import { makeSuite } from "./support/prepared-suite-fixture.mjs"

const root = path.resolve(import.meta.dirname, "..")
const runner = path.join(root, "scripts/bench/discover-semantic-oracle.mjs")

test("semantic discovery preserves and independently verifies a complete hover payload across cold processes", async t => {
  const fixture = await makeSuite(t)
  const target = fixture.suite.targets[0]
  const manifest = { schemaVersion: 1, benchmarkId: "hover-cold-oracle", workspace: fixture.suite.workspace,
    sdk: fixture.suite.sdk, server: fixture.suite.server, sidecar: fixture.suite.sidecar,
    pins: fixture.suite.pins, runtime: fixture.suite.runtime,
    query: { kind: "hover", file: target.file, symbol: target.symbol, position: target.position,
      sourceSha256: target.sourceSha256 } }
  const input = path.join(fixture.directory, "hover-discovery.json")
  fs.writeFileSync(input, JSON.stringify(manifest))
  const first = path.join(fixture.directory, "hover-first.json")
  const second = path.join(fixture.directory, "hover-second.json")
  const run = (output, compare) => spawnSync(process.execPath, [runner, "--manifest", input, "--out", output,
    ...(compare ? ["--compare", compare] : [])], { cwd: root, encoding: "utf8", timeout: 15_000 })
  const firstProcess = run(first)
  assert.equal(firstProcess.status, 0, `${firstProcess.stderr}\n${firstProcess.stdout}`)
  const discovered = JSON.parse(fs.readFileSync(first, "utf8"))
  assert.equal(discovered.status, "DISCOVERED")
  assert.equal(discovered.request.method, "textDocument/hover")
  assert.deepEqual(discovered.payload, { contents: { kind: "markdown", value: "```arkts\nconst Thing: string\n```" },
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } })
  const secondProcess = run(second, first)
  assert.equal(secondProcess.status, 0, `${secondProcess.stderr}\n${secondProcess.stdout}`)
  const verified = JSON.parse(fs.readFileSync(second, "utf8"))
  assert.equal(verified.status, "VERIFIED")
  assert.deepEqual(verified.payload, discovered.payload)
  assert.equal(verified.comparison.equal, true)
  assert.notEqual(verified.environment.targetPid, discovered.environment.targetPid)
  assert.ok(verified.inputIdentity.inputUnchanged)
  assert.ok(Array.isArray(verified.diagnostics[0].diagnostics))
})

test("semantic discovery verifies the full signature payload in separate cold processes", async t => {
  const fixture = await makeSuite(t)
  const target = fixture.suite.targets[0]
  const manifest = { schemaVersion: 1, benchmarkId: "signature-cold-oracle", workspace: fixture.suite.workspace,
    sdk: fixture.suite.sdk, server: fixture.suite.server, sidecar: fixture.suite.sidecar,
    pins: fixture.suite.pins, runtime: fixture.suite.runtime,
    query: { kind: "signatureHelp", file: target.file, symbol: target.symbol, position: target.position,
      sourceSha256: target.sourceSha256 } }
  const input = path.join(fixture.directory, "signature-discovery.json")
  fs.writeFileSync(input, JSON.stringify(manifest))
  const first = path.join(fixture.directory, "signature-first.json")
  const second = path.join(fixture.directory, "signature-second.json")
  const run = (output, compare) => spawnSync(process.execPath, [runner, "--manifest", input, "--out", output,
    ...(compare ? ["--compare", compare] : [])], { cwd: root, encoding: "utf8", timeout: 15_000 })
  const initial = run(first)
  assert.equal(initial.status, 0, `${initial.stderr}\n${initial.stdout}`)
  const discovered = JSON.parse(fs.readFileSync(first, "utf8"))
  assert.deepEqual(discovered.payload, { signatures: [{ label: "call(count: number, label: string): string",
    documentation: { kind: "markdown", value: "signature docs 😀" },
    parameters: [{ label: [5, 18], documentation: "count docs" }, { label: "label: string" }] }],
  activeSignature: 0, activeParameter: 1 })
  const compared = run(second, first)
  assert.equal(compared.status, 0, `${compared.stderr}\n${compared.stdout}`)
  const verified = JSON.parse(fs.readFileSync(second, "utf8"))
  assert.equal(verified.status, "VERIFIED")
  assert.equal(verified.comparison.equal, true)
  assert.deepEqual(verified.payload, discovered.payload)
  assert.notEqual(verified.environment.targetPid, discovered.environment.targetPid)
})

test("semantic discovery validates opaque completion handles before comparing full cold payloads", async t => {
  const fixture = await makeSuite(t)
  const target = fixture.suite.targets[0]
  const manifest = { schemaVersion: 1, benchmarkId: "completion-cold-oracle", workspace: fixture.suite.workspace,
    sdk: fixture.suite.sdk, server: fixture.suite.server, sidecar: fixture.suite.sidecar,
    pins: fixture.suite.pins, runtime: fixture.suite.runtime,
    query: { kind: "completion", file: target.file, symbol: target.symbol, position: target.position,
      sourceSha256: target.sourceSha256 } }
  const input = path.join(fixture.directory, "completion-discovery.json")
  fs.writeFileSync(input, JSON.stringify(manifest))
  const first = path.join(fixture.directory, "completion-first.json")
  const second = path.join(fixture.directory, "completion-second.json")
  const run = (output, compare) => spawnSync(process.execPath, [runner, "--manifest", input, "--out", output,
    ...(compare ? ["--compare", compare] : [])], { cwd: root, encoding: "utf8", timeout: 15_000 })
  const initial = run(first)
  assert.equal(initial.status, 0, `${initial.stderr}\n${initial.stdout}`)
  const discovered = JSON.parse(fs.readFileSync(first, "utf8"))
  assert.deepEqual(discovered.payload, { isIncomplete: true, items: [{
    label: "Thing", labelDetails: { detail: "()", description: "./Thing" },
    kind: 7, detail: "class Thing", filterText: "Thing", sortText: "01", insertText: "Thing",
    insertTextFormat: 1, commitCharacters: [".", ","], documentation: { kind: "markdown", value: "item docs 😀" },
    textEdit: { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: "Thing" },
  }] })
  assert.match(discovered.response.rawPayload.items[0].data.arktsCompletionId,
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u)
  const compared = run(second, first)
  assert.equal(compared.status, 0, `${compared.stderr}\n${compared.stdout}`)
  const verified = JSON.parse(fs.readFileSync(second, "utf8"))
  assert.equal(verified.status, "VERIFIED")
  assert.equal(verified.comparison.equal, true)
  assert.deepEqual(verified.payload, discovered.payload)
})

test("semantic discovery verifies complete resolve payloads with a disclosed source query and unchanged handle", async t => {
  const fixture = await makeSuite(t)
  const target = fixture.suite.targets[0]
  const manifest = { schemaVersion: 1, benchmarkId: "resolve-cold-oracle", workspace: fixture.suite.workspace,
    sdk: fixture.suite.sdk, server: fixture.suite.server, sidecar: fixture.suite.sidecar,
    pins: fixture.suite.pins, runtime: fixture.suite.runtime,
    query: { kind: "completionResolve", file: target.file, symbol: target.symbol, position: target.position,
      sourceSha256: target.sourceSha256, completionSelector: { label: "Thing", detail: "class Thing" } } }
  const input = path.join(fixture.directory, "resolve-discovery.json")
  fs.writeFileSync(input, JSON.stringify(manifest))
  const first = path.join(fixture.directory, "resolve-first.json")
  const second = path.join(fixture.directory, "resolve-second.json")
  const run = (output, compare) => spawnSync(process.execPath, [runner, "--manifest", input, "--out", output,
    ...(compare ? ["--compare", compare] : [])], { cwd: root, encoding: "utf8", timeout: 15_000 })
  const initial = run(first)
  assert.equal(initial.status, 0, `${initial.stderr}\n${initial.stdout}`)
  const discovered = JSON.parse(fs.readFileSync(first, "utf8"))
  assert.equal(discovered.request.method, "completionItem/resolve")
  assert.equal(discovered.request.preparatoryTargetQueries, 1)
  assert.equal(discovered.payload.detail, "resolved class Thing")
  assert.deepEqual(discovered.payload.additionalTextEdits, [{ range: {
    start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: 'import { Thing } from "./Thing";\n' }])
  assert.deepEqual(discovered.response.rawPayload.data, discovered.sourceCompletion.rawPayload.items[0].data)
  const sent = discovered.transcript.transcript.entries.filter(entry => entry.direction === "send")
  assert.equal(sent.filter(entry => entry.method === "textDocument/completion").length, 1)
  assert.equal(sent.filter(entry => entry.method === "completionItem/resolve").length, 1)
  const compared = run(second, first)
  assert.equal(compared.status, 0, `${compared.stderr}\n${compared.stdout}`)
  const verified = JSON.parse(fs.readFileSync(second, "utf8"))
  assert.equal(verified.status, "VERIFIED")
  assert.equal(verified.comparison.equal, true)
  assert.deepEqual(verified.payload, discovered.payload)
})

test("semantic discovery preserves complete definition and typeDefinition Locations across cold processes", async t => {
  for (const kind of ["definition", "typeDefinition"]) {
    const fixture = await makeSuite(t)
    const target = fixture.suite.targets[0]
    const knownLocation = { file: target.file,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }
    const manifest = { schemaVersion: 1, benchmarkId: `${kind}-cold-oracle`, workspace: fixture.suite.workspace,
      sdk: fixture.suite.sdk, server: fixture.suite.server, sidecar: fixture.suite.sidecar,
      pins: fixture.suite.pins, runtime: fixture.suite.runtime, knownLocation,
      query: { kind, file: target.file, symbol: target.symbol, position: target.position,
        sourceSha256: target.sourceSha256 } }
    const input = path.join(fixture.directory, "navigation-discovery.json")
    fs.writeFileSync(input, JSON.stringify(manifest))
    const first = path.join(fixture.directory, "navigation-first.json")
    const second = path.join(fixture.directory, "navigation-second.json")
    const run = (output, compare) => spawnSync(process.execPath, [runner, "--manifest", input, "--out", output,
      ...(compare ? ["--compare", compare] : [])], { cwd: root, encoding: "utf8", timeout: 15_000 })
    const initial = run(first)
    assert.equal(initial.status, 0, `${initial.stderr}\n${initial.stdout}`)
    const discovered = JSON.parse(fs.readFileSync(first, "utf8"))
    assert.equal(discovered.request.method, `textDocument/${kind}`)
    assert.deepEqual(discovered.locations, [knownLocation])
    const compared = run(second, first)
    assert.equal(compared.status, 0, `${compared.stderr}\n${compared.stdout}`)
    const verified = JSON.parse(fs.readFileSync(second, "utf8"))
    assert.equal(verified.status, "VERIFIED")
    assert.equal(verified.knownLocation.included, true)
    assert.equal(verified.comparison.equal, true)
  }
})

test("semantic discovery independently verifies a pinned v2 overlay without changing the disk source", async t => {
  const fixture = await makeSuite(t)
  const target = fixture.suite.targets[0]
  const changes = [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
    newText: "ThingThing" }]
  const knownLocation = { file: target.file,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } } }
  const manifest = { schemaVersion: 1, benchmarkId: "overlay-cold-oracle", workspace: fixture.suite.workspace,
    sdk: fixture.suite.sdk, server: fixture.suite.server, sidecar: fixture.suite.sidecar,
    pins: fixture.suite.pins, runtime: fixture.suite.runtime, knownLocation,
    overlay: { version: 2, changes, sha256: digestJson(changes) },
    query: { kind: "definition", file: target.file, symbol: "ThingThing", position: target.position,
      sourceSha256: target.sourceSha256 } }
  const input = path.join(fixture.directory, "overlay-discovery.json")
  fs.writeFileSync(input, JSON.stringify(manifest))
  const first = path.join(fixture.directory, "overlay-first.json")
  const second = path.join(fixture.directory, "overlay-second.json")
  const run = (output, compare) => spawnSync(process.execPath, [runner, "--manifest", input, "--out", output,
    ...(compare ? ["--compare", compare] : [])], { cwd: root, encoding: "utf8", timeout: 15_000 })
  const initial = run(first)
  assert.equal(initial.status, 0, `${initial.stderr}\n${initial.stdout}`)
  const discovered = JSON.parse(fs.readFileSync(first, "utf8"))
  assert.deepEqual(discovered.locations, [knownLocation])
  assert.equal(discovered.diagnostics[0].version, 2)
  assert.deepEqual(discovered.request.overlay, manifest.overlay)
  const sent = discovered.transcript.transcript.entries.filter(entry => entry.direction === "send")
  assert.equal(sent.filter(entry => entry.method === "textDocument/didOpen").length, 1)
  assert.equal(sent.filter(entry => entry.method === "textDocument/didChange").length, 1)
  assert.ok(discovered.timeline.some(event => event.phase === "didChange-sent"
    && event.version === 2 && event.overlaySha256 === manifest.overlay.sha256))
  assert.equal(fs.readFileSync(path.join(fixture.suite.workspace, target.file), "utf8"), "Thing\n")
  const compared = run(second, first)
  assert.equal(compared.status, 0, `${compared.stderr}\n${compared.stdout}`)
  const verified = JSON.parse(fs.readFileSync(second, "utf8"))
  assert.equal(verified.status, "VERIFIED")
  assert.equal(verified.comparison.equal, true)
  assert.notEqual(verified.environment.targetPid, discovered.environment.targetPid)
  manifest.overlay.sha256 = "0".repeat(64)
  fs.writeFileSync(input, JSON.stringify(manifest))
  const rejected = run(path.join(fixture.directory, "overlay-drift.json"))
  assert.equal(rejected.status, 2, rejected.stderr)
  assert.match(rejected.stderr, /DISCOVERY_BLOCKED=OVERLAY_PIN/u)
})

test("semantic discovery independently verifies complete rename and directional calls with disclosed item preparation", async t => {
  for (const kind of ["prepareRename", "rename", "prepareCallHierarchy", "outgoingCalls", "incomingCalls"]) {
    const fixture = await makeSuite(t), target = fixture.suite.targets[0]
    const workspace = fs.realpathSync(fixture.suite.workspace)
    const uri = pathToFileURL(path.join(workspace, target.file)).href
    const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }
    const item = { name: "Thing", kind: 12, tags: [1], detail: "public Thing 😀", uri, range, selectionRange: range,
      data: { arktsCallHierarchy: { protocol: 1, rootUri: pathToFileURL(workspace).href } } }
    const expected = { prepareRename: { placeholder: "Thing", range },
      rename: { documentChanges: [{ textDocument: { uri, version: 1 }, edits: [{ range, newText: "RenamedThing" }] }] },
      prepareCallHierarchy: [item], outgoingCalls: [{ to: item, fromRanges: [range] }],
      incomingCalls: [{ from: item, fromRanges: [range] }] }[kind]
    const manifest = { schemaVersion: 1, benchmarkId: `${kind}-cold-oracle`, workspace,
      sdk: fixture.suite.sdk, server: fixture.suite.server, sidecar: fixture.suite.sidecar,
      pins: fixture.suite.pins, runtime: fixture.suite.runtime,
      query: { kind, file: target.file, symbol: target.symbol, position: target.position, sourceSha256: target.sourceSha256,
        ...(kind === "rename" ? { newName: "RenamedThing" } : {}),
        ...(["outgoingCalls", "incomingCalls"].includes(kind) ? { callHierarchySelector: { name: "Thing", kind: 12 } } : {}) } }
    const input = path.join(fixture.directory, `${kind}-discovery.json`)
    fs.writeFileSync(input, JSON.stringify(manifest))
    const first = path.join(fixture.directory, `${kind}-first.json`), second = path.join(fixture.directory, `${kind}-second.json`)
    const run = (output, compare) => spawnSync(process.execPath, [runner, "--manifest", input, "--out", output,
      ...(compare ? ["--compare", compare] : [])], { cwd: root, encoding: "utf8", timeout: 15_000 })
    const initial = run(first)
    assert.equal(initial.status, 0, `${kind}: ${initial.stderr}\n${initial.stdout}`)
    const discovered = JSON.parse(fs.readFileSync(first, "utf8"))
    assert.equal(discovered.status, "DISCOVERED")
    assert.deepEqual(discovered.payload, expected)
    const compared = run(second, first)
    assert.equal(compared.status, 0, `${kind}: ${compared.stderr}\n${compared.stdout}`)
    const verified = JSON.parse(fs.readFileSync(second, "utf8"))
    assert.equal(verified.status, "VERIFIED")
    assert.deepEqual(verified.payload, expected)
    assert.notEqual(verified.environment.targetPid, discovered.environment.targetPid)
    assert.equal(verified.inputIdentity.inputUnchanged, true)
    if (["outgoingCalls", "incomingCalls"].includes(kind)) {
      assert.equal(verified.request.preparatoryTargetQueries, 1)
      assert.deepEqual(verified.sourceCallHierarchy.rawPayload, [item])
      const sent = verified.transcript.transcript.entries.filter(entry => entry.direction === "send")
      assert.equal(sent.filter(entry => entry.method === "textDocument/prepareCallHierarchy").length, 1)
    }
  }
})

test("implementation discovery preserves the complete public Location set across fresh processes", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-implementation-oracle-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const workspace = path.join(directory, "workspace")
  const sdk = path.join(directory, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "minimal.d.ts"), "declare interface Minimal {}\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"), JSON.stringify({ apiVersion: "24", version: "test" }))
  for (const file of ["NavigationContracts.ets", "NavigationImplementations.ets"]) {
    fs.copyFileSync(path.join(root, "fixtures/basic", file), path.join(workspace, file))
  }
  execFileSync("git", ["init", "-q", workspace])
  execFileSync("git", ["-C", workspace, "add", "."])
  execFileSync("git", ["-C", workspace, "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
    "commit", "-qm", "fixed implementation fixture"])

  const manifest = {
    schemaVersion: 1,
    benchmarkId: "implementation-public-lsp-control",
    workspace,
    sdk,
    server: path.join(root, "dist/server.cjs"),
    sidecar: path.join(root, "target/release/arkts-index-sidecar"),
    query: { file: "NavigationContracts.ets", symbol: "Formatter",
      position: { line: 0, character: 20 }, sourceSha256: sha256File(path.join(workspace, "NavigationContracts.ets")) },
    knownLocation: { file: "NavigationImplementations.ets", range: {
      start: { line: 2, character: 13 }, end: { line: 2, character: 26 },
    } },
    runtime: { timeoutMs: 20_000, diagnosticTimeoutMs: 20_000, env: {
      ARKTS_SEMANTIC_SESSION_REUSE: "off",
    } },
  }
  manifest.pins = await capturePreparedIdentity({ ...manifest, file: manifest.query.file })
  const input = path.join(directory, "manifest.json")
  fs.writeFileSync(input, `${JSON.stringify(manifest, null, 2)}\n`)
  const first = path.join(directory, "first.json")
  const second = path.join(directory, "second.json")
  const run = (output, compare) => spawnSync(process.execPath, [runner, "--manifest", input,
    "--out", output, ...(compare ? ["--compare", compare] : [])], {
    cwd: root, encoding: "utf8", timeout: 60_000,
  })
  const firstProcess = run(first)
  assert.equal(firstProcess.status, 0, `${firstProcess.stderr}\n${firstProcess.stdout}\n${fs.existsSync(first) ? fs.readFileSync(first, "utf8") : "no report"}`)
  const discovered = JSON.parse(fs.readFileSync(first, "utf8"))
  assert.equal(discovered.status, "DISCOVERED")
  assert.equal(discovered.request.method, "textDocument/implementation")
  assert.deepEqual(discovered.locations, [manifest.knownLocation])
  assert.ok(Array.isArray(discovered.diagnostics[0]?.diagnostics))

  const secondProcess = run(second, first)
  assert.equal(secondProcess.status, 0, `${secondProcess.stderr}\n${secondProcess.stdout}`)
  const verified = JSON.parse(fs.readFileSync(second, "utf8"))
  assert.equal(verified.status, "VERIFIED")
  assert.deepEqual(verified.locations, discovered.locations)
  assert.equal(verified.comparison.equal, true)
  assert.equal(verified.knownLocation.included, true)

  fs.appendFileSync(path.join(sdk, "ets", "minimal.d.ts"), "declare interface Changed {}\n")
  const drifted = path.join(directory, "drifted.json")
  const drift = run(drifted)
  assert.equal(drift.status, 2, drift.stderr)
  assert.match(drift.stderr, /DISCOVERY_BLOCKED=PIN_MISMATCH/u)
  assert.equal(fs.existsSync(drifted), false)
})
