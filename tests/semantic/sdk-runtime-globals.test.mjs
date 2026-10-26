import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

const runtimeDeclarations = [
  "/** Schedules one SDK timer. */",
  "declare function setTimeout(handler: Function | string, delay?: number, ...arguments: any[]): number;",
  "declare function clearTimeout(timeoutID?: number): void;",
  "declare function setInterval(handler: Function | string, delay: number, ...arguments: any[]): number;",
  "declare function clearInterval(intervalID?: number): void;",
  "declare class console { static info(message: string, ...arguments: any[]): void; }",
  "",
].join("\n")

const source = [
  'export const timeoutId = setTimeout(() => console.info("ready"), 10)',
  "clearTimeout(timeoutId)",
  "export const intervalId = setInterval(() => {}, 20)",
  "clearInterval(intervalId)",
  "",
].join("\n")

test("selected SDK runtime globals resolve without importing browser or Node types", { timeout: 30_000 }, async t => {
  const fixture = await openFixture(t, source)
  const diagnostics = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === fixture.uri && message.params.version === 1, 20_000)
  assert.deepEqual(diagnostics.params.diagnostics, [])
  const definition = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.uri }, position: positionAt(source, source.indexOf("setTimeout") + 1),
  }, { timeoutMs: 10_000 })
  assert.equal(definition.error, undefined)
  assert.deepEqual(definition.result, [{
    uri: pathToFileURL(fixture.runtimeFile).href,
    range: rangeAt(runtimeDeclarations, runtimeDeclarations.indexOf("setTimeout"), "setTimeout"),
  }])
})

test("one unknown SDK module leaves the service available for unrelated SDK globals", { timeout: 30_000 }, async t => {
  const fixture = await openFixture(t, source, {
    "Missing.ets": 'import missing from "@ohos.missing"\nexport const result = missing.read()\n',
  })
  const report = fixture.preparation.params.report
  assert.equal(report.semanticState, "partial", JSON.stringify(report))
  assert.deepEqual(report.inputIssues, [{ layer: "sdk", reason: "module-not-found", specifier: "@ohos.missing" }])
  assert.ok(report.availableCapabilities.includes("definition"))
  assert.ok(report.availableCapabilities.includes("completion"))
  assert.deepEqual(report.readyCapabilities, [], "partial SDK inputs do not create a complete-project certificate")
  assert.equal(report.semanticGeneration, null)
  const diagnostics = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === fixture.uri && message.params.version === 1, 20_000)
  assert.deepEqual(diagnostics.params.diagnostics, [])
  const definition = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.uri }, position: positionAt(source, source.indexOf("setTimeout") + 1),
  }, { timeoutMs: 10_000 })
  assert.equal(definition.error, undefined)
  assert.deepEqual(definition.result, [{ uri: pathToFileURL(fixture.runtimeFile).href,
    range: rangeAt(runtimeDeclarations, runtimeDeclarations.indexOf("setTimeout"), "setTimeout") }])
  const params = { textDocument: { uri: fixture.uri },
    position: positionAt(source, source.indexOf("timeoutId") + 1) }
  const references = await fixture.session.request("textDocument/references", {
    ...params, context: { includeDeclaration: true },
  })
  assert.equal(references.error, undefined)
  assert.deepEqual(references.result, [source.indexOf("timeoutId"), source.lastIndexOf("timeoutId")]
    .map(offset => ({ uri: fixture.uri, range: rangeAt(source, offset, "timeoutId") })))
  const renamed = await fixture.session.request("textDocument/rename", { ...params, newName: "timerHandle" })
  assert.equal(renamed.error, undefined)
  assert.deepEqual(renamed.result, { documentChanges: [{ textDocument: { uri: fixture.uri, version: 1 },
    edits: references.result.map(location => ({ range: location.range, newText: "timerHandle" })) }] })
  const missingUri = pathToFileURL(path.join(fixture.workspace, "Missing.ets")).href
  const missingText = fs.readFileSync(path.join(fixture.workspace, "Missing.ets"), "utf8")
  fixture.session.openDocument({ uri: missingUri, version: 1, text: missingText })
  const missingDiagnostics = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === missingUri && message.params.version === 1, 20_000)
  assert.ok(missingDiagnostics.params.diagnostics.some(item => item.code === 2307))
  assert.equal(fixture.workerStarts(), 1, "unknown SDK input does not spend Worker recovery budget")
})

test("unfinished or oversized SDK import names remain input issues instead of protocol failures", { timeout: 30_000 }, async t => {
  for (const specifier of ["@ohos.missing module", "@ohos." + "x".repeat(4096)]) {
    const fixture = await openFixture(t, source, {
      "Missing.ets": `import missing from "${specifier}"\nexport { missing }\n`,
    })
    const report = fixture.preparation.params.report
    assert.equal(report.semanticState, "partial", JSON.stringify(report))
    assert.deepEqual(report.inputIssues, [specifier.length <= 4096
      ? { layer: "sdk", reason: "module-not-found", specifier }
      : { layer: "sdk", reason: "coverage-unproven" }])
    const definition = await fixture.session.request("textDocument/definition", {
      textDocument: { uri: fixture.uri }, position: positionAt(source, source.indexOf("setTimeout") + 1),
    })
    if (specifier.length <= 4096 || process.platform === "win32") {
      assert.equal(definition.error, undefined)
      assert.ok(definition.result.some(item => item.uri === pathToFileURL(fixture.runtimeFile).href))
    } else {
      assert.deepEqual(definition.error, { code: -32803, message: "Semantic query requires current workspace inputs" },
        "an unprovable oversized filesystem input retains the existing freshness rejection")
    }
    assert.equal(fixture.workerStarts(), 1)
  }
})

test("an explicit SDK declaration patch repairs partial inputs in the same session", { timeout: 30_000 }, async t => {
  const fixture = await openFixture(t, source, {
    "Missing.ets": 'import missing from "@ohos.missing"\nexport const result: number = missing.read()\n',
  })
  assert.equal(fixture.preparation.params.report.semanticState, "partial")
  const patch = 'declare module "@ohos.missing" { const value: { read(): number }; export default value }\n'
  const patchFile = path.join(fixture.workspace, "SdkCompatibility.d.ts")
  fs.writeFileSync(patchFile, patch)
  fixture.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
    params: { changes: [{ uri: pathToFileURL(patchFile).href, type: 1 }] } })
  const report = await fixture.session.request("arkts/semanticReadiness", {
    rootUri: pathToFileURL(fixture.workspace).href, prepare: true,
  }, { timeoutMs: 10_000 })
  assert.equal(report.error, undefined)
  assert.equal(report.result.semanticState, "ready", JSON.stringify(report))
  assert.equal(report.result.coverage.dependenciesComplete, true)
  assert.equal(report.result.inputIssues, undefined)
  const text = fs.readFileSync(path.join(fixture.workspace, "Missing.ets"), "utf8")
  const uri = pathToFileURL(path.join(fixture.workspace, "Missing.ets")).href
  fixture.session.openDocument({ uri, version: 1, text })
  const diagnostics = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === uri && message.params.version === 1, 20_000)
  assert.deepEqual(diagnostics.params.diagnostics, [])
  const response = await fixture.session.request("textDocument/definition", {
    textDocument: { uri }, position: positionAt(text, text.indexOf("read()") + 1),
  }, { timeoutMs: 10_000 })
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [{ uri: pathToFileURL(patchFile).href,
    range: rangeAt(patch, patch.indexOf("read()"), "read") }])
  assert.equal(fixture.workerStarts(), 1, "SDK type repair does not restart the semantic Worker")
})

test("SDK runtime signatures remain typed and do not introduce browser or Node globals", { timeout: 30_000 }, async t => {
  const text = [
    "export const invalidReturn: string = setTimeout(() => {}, 10)",
    "setTimeout(123, 10)",
    "settimeout(() => {}, 10)",
    "window.alert('not this runtime')",
    "process.nextTick(() => {})",
    "",
  ].join("\n")
  const fixture = await openFixture(t, text)
  const diagnostics = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === fixture.uri && message.params.version === 1, 20_000)
  const errors = diagnostics.params.diagnostics
  assert.ok(errors.some(item => item.code === 2322 && item.range.start.line === 0))
  assert.ok(errors.some(item => item.code === 2345 && item.range.start.line === 1))
  for (const line of [2, 3, 4]) assert.ok(errors.some(item => item.range.start.line === line
    && /Cannot find name/.test(item.message)), JSON.stringify(errors))
})

test("partial SDK loader options do not break healthy queries beside an unknown extension", { timeout: 30_000 }, async t => {
  const extension = "@UnknownExtension(Object)\nfunction extraStyle() {}\n"
  const fixture = await openFixture(t, source, { "Extension.ets": extension })
  const diagnostics = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === fixture.uri && message.params.version === 1, 20_000)
  assert.deepEqual(diagnostics.params.diagnostics, [])
  const definition = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.uri }, position: positionAt(source, source.indexOf("setTimeout") + 1),
  })
  assert.deepEqual(definition.result, [{ uri: pathToFileURL(fixture.runtimeFile).href,
    range: rangeAt(runtimeDeclarations, runtimeDeclarations.indexOf("setTimeout"), "setTimeout") }])
  const uri = pathToFileURL(path.join(fixture.workspace, "Extension.ets")).href
  fixture.session.openDocument({ uri, version: 1, text: extension })
  const unsupported = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === uri && message.params.version === 1, 20_000)
  assert.deepEqual(unsupported.params.diagnostics.map(item => item.code), [1206])
  assert.equal(fixture.workerStarts(), 1)
})

test("an explicit same-SDK configuration refresh observes repaired API declarations", { timeout: 30_000 }, async t => {
  const missing = 'import missing from "@ohos.missing"\nexport const result = missing.read()\n'
  const fixture = await openFixture(t, source, { "Missing.ets": missing })
  assert.equal(fixture.preparation.params.report.semanticState, "partial")
  const declaration = path.join(fixture.sdk, "ets", "api", "@ohos.missing.d.ts")
  const contents = "declare const value: { read(): number }; export default value\n"
  fs.mkdirSync(path.dirname(declaration), { recursive: true })
  fs.writeFileSync(declaration, contents)
  fixture.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
    params: { settings: { arkts: { sdk: { path: fixture.sdk } } } } })
  const prepared = await fixture.session.request("arkts/semanticReadiness", {
    rootUri: pathToFileURL(fixture.workspace).href, prepare: true,
  }, { timeoutMs: 10_000 })
  assert.equal(prepared.error, undefined)
  assert.equal(prepared.result.semanticState, "ready", JSON.stringify(prepared))
  const uri = pathToFileURL(path.join(fixture.workspace, "Missing.ets")).href
  fixture.session.openDocument({ uri, version: 1, text: missing })
  const response = await fixture.session.request("textDocument/definition", {
    textDocument: { uri }, position: positionAt(missing, missing.indexOf("read()") + 1),
  })
  assert.deepEqual(response.result, [{ uri: pathToFileURL(declaration).href,
    range: rangeAt(contents, contents.indexOf("read()"), "read") }])
  assert.equal(fixture.workerStarts(), 1)
})

test("a missing declaration inside the SDK is an SDK input issue, not service degradation", { timeout: 30_000 }, async t => {
  const fixture = await openFixture(t, source, {}, sdk => {
    fs.writeFileSync(path.join(sdk, "ets", "component", "index-full.d.ts"),
      '/// <reference path="../api/Absent.d.ts" />\n')
  })
  const report = fixture.preparation.params.report
  assert.equal(report.semanticState, "partial", JSON.stringify(report))
  assert.deepEqual(report.inputIssues, [{ layer: "sdk", reason: "declaration-not-found" }])
  assert.equal(report.unavailableInput, null,
    "skipLibCheck suppresses this compiler diagnostic; do not invent a diagnostic code")
  const definition = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.uri }, position: positionAt(source, source.indexOf("setTimeout") + 1),
  }, { timeoutMs: 10_000 })
  assert.equal(definition.error, undefined)
  assert.deepEqual(definition.result, [{ uri: pathToFileURL(fixture.runtimeFile).href,
    range: rangeAt(runtimeDeclarations, runtimeDeclarations.indexOf("setTimeout"), "setTimeout") }])
  assert.equal(fixture.workerStarts(), 1)
})

test("runtime-only SDK inputs remain usable without claiming complete ambient coverage", { timeout: 30_000 }, async t => {
  const fixture = await openFixture(t, source, {}, sdk => {
    fs.unlinkSync(path.join(sdk, "ets", "component", "index-full.d.ts"))
  })
  const report = fixture.preparation.params.report
  assert.equal(report.semanticState, "partial", JSON.stringify(report))
  assert.deepEqual(report.inputIssues, [{ layer: "sdk", reason: "coverage-unproven" }])
  assert.equal(report.inputIdentity, null)
  const diagnostics = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === fixture.uri && message.params.version === 1, 20_000)
  assert.deepEqual(diagnostics.params.diagnostics, [])
  const definition = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.uri }, position: positionAt(source, source.indexOf("setTimeout") + 1),
  })
  assert.deepEqual(definition.result, [{ uri: pathToFileURL(fixture.runtimeFile).href,
    range: rangeAt(runtimeDeclarations, runtimeDeclarations.indexOf("setTimeout"), "setTimeout") }])
  assert.equal(fixture.workerStarts(), 1)
})

test("declaration-only SDK component metadata preserves ArkUI builder syntax", { timeout: 30_000 }, async t => {
  const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "arkui-sdk-depth")
  const text = fs.readFileSync(path.join(fixtureRoot, "BuilderTail.ets"), "utf8")
  const declarations = fs.readFileSync(path.join(fixtureRoot, "sdk", "openharmony", "ets", "component", "arkui.d.ts"), "utf8")
    + "\ndeclare function Extend(component: Function): MethodDecorator;\n"
  const extension = "@Extend(Text)\nfunction extraStyle() {}\n"
  const fixture = await openFixture(t, text, { "Extension.ets": extension }, sdk => {
    fs.unlinkSync(path.join(sdk, "ets", "build-tools", "ets-loader", "tsconfig.json"))
    fs.writeFileSync(path.join(sdk, "ets", "component", "index-full.d.ts"), declarations)
    fs.writeFileSync(path.join(sdk, "ets", "component", "component_config.json"),
      JSON.stringify({ Column: {}, Text: {} }))
  })
  const diagnostics = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === fixture.uri && message.params.version === 1, 20_000)
  assert.deepEqual(diagnostics.params.diagnostics, [])
  const response = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.uri }, position: positionAt(text, text.indexOf('}.width') + 3),
  })
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [{ uri: pathToFileURL(path.join(fixture.sdk, "ets", "component", "index-full.d.ts")).href,
    range: rangeAt(declarations, declarations.indexOf("width(value:"), "width") }])
  const extensionUri = pathToFileURL(path.join(fixture.workspace, "Extension.ets")).href
  fixture.session.openDocument({ uri: extensionUri, version: 1, text: extension })
  const unsupported = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === extensionUri && message.params.version === 1, 20_000)
  assert.deepEqual(unsupported.params.diagnostics.map(item => item.code), [1206],
    "unknown extension configuration stays a local diagnostic; it must not fail Program construction")
})

async function openFixture(t, text, extras = {}, sdkSetup = () => {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-runtime-sdk-"))
  const workspace = path.join(directory, "project")
  const sdk = path.join(directory, "sdk", "openharmony")
  const runtimeFile = path.join(sdk, "ets", "build-tools", "ets-loader", "declarations", "global.d.ts")
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, value)
  }
  write(path.join(workspace, "Main.ets"), text)
  for (const [name, contents] of Object.entries(extras)) write(path.join(workspace, name), contents)
  write(path.join(sdk, "toolchains", ".keep"), "")
  write(path.join(sdk, "ets", "oh-uni-package.json"), JSON.stringify({
    path: "ets", apiVersion: "24", version: "6.1.1.125",
  }))
  write(path.join(sdk, "ets", "component", "index-full.d.ts"), "// SDK component declarations\n")
  write(path.join(sdk, "ets", "build-tools", "ets-loader", "tsconfig.json"), JSON.stringify({
    compilerOptions: { ets: { components: [], libs: [] } },
  }))
  write(runtimeFile, runtimeDeclarations)
  sdkSetup(sdk)
  const uri = pathToFileURL(path.join(workspace, "Main.ets")).href
  const session = new LspSession({
    command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: workspace, rootUri: pathToFileURL(workspace).href,
    capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: { ARKLINE_HARMONY_SDK_PATH: sdk, ARKTS_INDEX_CACHE_DIR: path.join(directory, "index"),
      ARKTS_LSP_LOG_DIR: path.join(directory, "logs") },
  })
  t.after(async () => {
    try { await session.close({ timeoutMs: 10_000 }) }
    finally { fs.rmSync(directory, { recursive: true, force: true }) }
  })
  await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
  const preparation = await session.transport.notification("arkts/semanticPreparation",
    message => ["complete", "failed"].includes(message.params.phase), 20_000)
  assert.equal(preparation.params.phase, "complete")
  session.openDocument({ uri, version: 1, text })
  const workerStarts = () => fs.readFileSync(path.join(directory, "logs", "server.log"), "utf8")
    .split("\n").filter(Boolean).map(line => JSON.parse(line)).filter(row => row.event === "semantic.worker.started").length
  return { session, uri, runtimeFile, sdk, workspace, directory, preparation, workerStarts }
}

function positionAt(text, offset) {
  const lines = text.slice(0, offset).split("\n")
  return { line: lines.length - 1, character: lines.at(-1).length }
}

function rangeAt(text, offset, token) {
  return { start: positionAt(text, offset), end: positionAt(text, offset + token.length) }
}
