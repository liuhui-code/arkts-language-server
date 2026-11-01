import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

// RED at 2972148759194fb12b9c2c05b49fa3801ccde203:
// pnpm build && node --test tests/semantic/hms-kit-resolution.test.mjs
test("HMS Kit exports resolve through their SDK declarations", { timeout: 30000 }, async t => {
  const { response, declaration } = await queryKit(t)
  assert.equal(response.error, undefined)
  assert.ok(response.result?.some(result => result.uri === pathToFileURL(declaration).href), JSON.stringify(response))
})

test("HMS relative declaration dependencies retain their component boundary", { timeout: 30000 }, async t => {
  const { response, declaration } = await queryKit(t, "relative")
  assert.equal(response.error, undefined)
  assert.ok(response.result?.some(result => result.uri === pathToFileURL(declaration).href), JSON.stringify(response))
})

test("extension namespace resolution follows SDK component metadata", { timeout: 30000 }, async t => {
  const fixture = await queryKit(t, "customPrefix")
  assert.equal(fixture.response.error, undefined)
  assert.ok(fixture.response.result?.some(result => result.uri === pathToFileURL(fixture.entry).href), JSON.stringify(fixture.response))
})

test("HMS Kit aliases can resolve a .d.ets declaration", { timeout: 30000 }, async t => {
  const fixture = await queryKit(t, "dets")
  assert.equal(fixture.response.error, undefined)
  assert.ok(fixture.response.result?.some(result => result.uri === pathToFileURL(fixture.entry).href), JSON.stringify(fixture.response))
})

test("HMS declarations cannot escape the SDK through a symlink", { timeout: 30000 }, async t => {
  const { response } = await queryKit(t, "escape")
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [])
})

test("an SDK nested in the workspace retains its component-relative import boundary", { timeout: 30000 }, async t => {
  const { response } = await queryKit(t, "nestedEscape")
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [])
})

test("an SDK nested in the workspace still resolves dependencies inside its component", { timeout: 30000 }, async t => {
  const { response, declaration } = await queryKit(t, "nestedRelative")
  assert.equal(response.error, undefined)
  assert.ok(response.result?.some(result => result.uri === pathToFileURL(declaration).href), JSON.stringify(response))
})

test("same-SDK refresh observes an HMS declaration created after a negative lookup", { timeout: 30000 }, async t => {
  const fixture = await queryKit(t, "missing")
  assert.deepEqual(fixture.response.result, [])
  await fs.writeFile(fixture.entry, "declare namespace pushService { function getToken(): string }\nexport default pushService;\n")
  fixture.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
    params: { settings: { arkts: { sdk: { path: fixture.sdk } } } } })
  const response = await fixture.session.request("textDocument/definition", fixture.params)
  assert.equal(response.error, undefined)
  assert.ok(response.result?.some(result => result.uri === pathToFileURL(fixture.entry).href), JSON.stringify(response))
})

test("same-SDK refresh replaces cached HMS declaration bytes", { timeout: 30000 }, async t => {
  const fixture = await queryKit(t)
  await fs.writeFile(fixture.entry, "// SDK update\ndeclare namespace pushService { function getToken(): number }\nexport default pushService;\n")
  fixture.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
    params: { settings: { arkts: { sdk: { path: fixture.sdk } } } } })
  const response = await fixture.session.request("textDocument/definition", fixture.params)
  assert.equal(response.error, undefined)
  const definition = response.result?.find(result => result.uri === pathToFileURL(fixture.entry).href)
  assert.equal(definition?.range.start.line, 1, JSON.stringify(response))
})

test("unknown HMS input is transported as partial while healthy Kit queries work", { timeout: 30000 }, async t => {
  const fixture = await queryKit(t, "unknown")
  const preparation = await fixture.session.transport.notification("arkts/semanticPreparation",
    message => message.params.phase === "complete", 15000)
  assert.equal(preparation.params.report.semanticState, "partial", JSON.stringify(preparation))
  assert.ok(preparation.params.report.inputIssues.some(issue => issue.specifier === "@hms.missing"), JSON.stringify(preparation))
  assert.ok(fixture.response.result?.some(result => result.uri === pathToFileURL(fixture.entry).href))
})

test("malformed HMS configuration stays an SDK input issue", { timeout: 30000 }, async t => {
  const fixture = await queryKit(t, "invalid")
  const preparation = await fixture.session.transport.notification("arkts/semanticPreparation",
    message => message.params.phase === "complete", 15000)
  assert.equal(preparation.params.report.semanticState, "partial", JSON.stringify(preparation))
  assert.deepEqual(preparation.params.report.readyCapabilities, [])
  assert.ok(preparation.params.report.availableCapabilities.includes("definition"))
  assert.equal(fixture.response.error, undefined)
  assert.deepEqual(fixture.response.result, [])
})

test("an extension for another SDK API cannot qualify or supply declarations", { timeout: 30000 }, async t => {
  const fixture = await queryKit(t, "incompatible")
  assert.equal(fixture.response.error, undefined)
  assert.deepEqual(fixture.response.result, [])
  const preparation = await fixture.session.transport.notification("arkts/semanticPreparation",
    message => message.params.phase === "complete", 15000)
  assert.equal(preparation.params.report.semanticState, "partial")
})

test("project compile SDK mismatch is diagnosed without disabling healthy SDK queries", { timeout: 30000 }, async t => {
  const fixture = await queryKit(t, "mismatch")
  const published = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === fixture.params.textDocument.uri, 15000)
  assert.ok(published.params.diagnostics.some(diagnostic => diagnostic.code === "arkts.sdk.target"), JSON.stringify(published))
  assert.equal(fixture.response.error, undefined)
  assert.ok(fixture.response.result?.some(result => result.uri === pathToFileURL(fixture.entry).href))
})

test("SDK release aliases are interpreted by the selected distribution's version map", { timeout: 30000 }, async t => {
  const fixture = await queryKit(t, "aliases")
  const published = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === fixture.params.textDocument.uri, 15000)
  assert.ok(!published.params.diagnostics.some(diagnostic => diagnostic.code === "arkts.sdk.target"), JSON.stringify(published))
  assert.ok(fixture.response.result?.some(result => result.uri === pathToFileURL(fixture.entry).href))
})

test("SDK target below compatible version is diagnosed", { timeout: 30000 }, async t => {
  const fixture = await queryKit(t, "range")
  const published = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === fixture.params.textDocument.uri, 15000)
  assert.ok(published.params.diagnostics.some(diagnostic => diagnostic.code === "arkts.sdk.target"), JSON.stringify(published))
})

test("unknown SDK release alias cannot borrow its major number as an API level", { timeout: 30000 }, async t => {
  const fixture = await queryKit(t, "unknownAlias")
  const published = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === fixture.params.textDocument.uri, 15000)
  assert.ok(published.params.diagnostics.some(diagnostic => diagnostic.code === "arkts.sdk.target"
    && diagnostic.message.includes("cannot verify")), JSON.stringify(published))
  assert.ok(fixture.response.result?.some(result => result.uri === pathToFileURL(fixture.entry).href))
})

test("unsupported runtime OS is explicit while ordinary SDK queries stay available", { timeout: 30000 }, async t => {
  const fixture = await queryKit(t, "unknownOS")
  const published = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === fixture.params.textDocument.uri, 15000)
  assert.ok(published.params.diagnostics.some(diagnostic => diagnostic.code === "arkts.sdk.target"
    && diagnostic.message.includes("runtime OS")), JSON.stringify(published))
  assert.ok(fixture.response.result?.some(result => result.uri === pathToFileURL(fixture.entry).href))
})

test("OpenHarmony target does not inherit the installation's HMS extension", { timeout: 30000 }, async t => {
  const fixture = await queryKit(t, "openharmony")
  assert.equal(fixture.response.error, undefined)
  assert.deepEqual(fixture.response.result, [])
})

test("ordinary configuration refresh clears a repaired SDK target mismatch", { timeout: 30000 }, async t => {
  const fixture = await queryKit(t, "mismatch")
  await fixture.session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === fixture.params.textDocument.uri, 15000)
  await fs.writeFile(path.join(fixture.workspace, "build-profile.json5"), JSON.stringify({
    app: { products: [{ name: "default", compileSdkVersion: 24 }] },
    modules: [{ name: "entry", srcPath: "./entry" }],
  }))
  fixture.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
    params: { settings: { arkts: { sdk: { path: fixture.sdk } } } } })
  fixture.session.changeDocument({ uri: fixture.params.textDocument.uri, version: 2, text: fixture.source })
  const published = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === fixture.params.textDocument.uri && message.params.version === 2, 15000)
  assert.ok(!published.params.diagnostics.some(diagnostic => diagnostic.code === "arkts.sdk.target"), JSON.stringify(published))
  const response = await fixture.session.request("textDocument/definition", fixture.params)
  assert.ok(response.result?.some(result => result.uri === pathToFileURL(fixture.entry).href))
})

for (const mode of ["autoimport", "autoimportDets"]) {
  test(`an unimported HMS symbol is completed and resolved through its public Kit (${mode})`, { timeout: 30000 }, async t => {
    const fixture = await queryKit(t, mode)
    const response = await fixture.session.request("textDocument/completion", {
      textDocument: fixture.params.textDocument,
      position: { line: 0, character: fixture.source.indexOf("pushS") + 5 },
    })
    assert.equal(response.error, undefined)
    const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
    const item = items.find(item => item.label === "pushService" && item.detail?.includes("@kit.PushKit"))
    assert.ok(item, JSON.stringify(response))
    const resolved = await fixture.session.request("completionItem/resolve", item)
    assert.equal(resolved.error, undefined)
    assert.ok(resolved.result.additionalTextEdits?.some(edit => /from ["']@kit\.PushKit["']/.test(edit.newText)), JSON.stringify(resolved))
  })
}

test("SDK export discovery survives more than 4096 unrelated ambient entries", { timeout: 30000 }, async t => {
  const fixture = await queryKit(t, "autoimportNoisy")
  const response = await fixture.session.request("textDocument/completion", {
    textDocument: fixture.params.textDocument,
    position: { line: 0, character: fixture.source.indexOf("pushS") + 5 },
  }, { timeoutMs: 15000 })
  assert.equal(response.error, undefined)
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  assert.ok(items.some(item => item.label === "pushService" && item.detail?.includes("@kit.PushKit")), JSON.stringify(response))
  assert.ok(items.length <= 128)
  assert.equal(response.result.isIncomplete, true)
})

test("SDK export handles reject changed declarations and refresh to new Kit exports", { timeout: 30000 }, async t => {
  const fixture = await queryKit(t, "autoimport")
  const request = (prefix) => fixture.session.request("textDocument/completion", {
    textDocument: fixture.params.textDocument, position: { line: 0, character: 14 + prefix.length },
  })
  const before = await request("pushS")
  const item = before.result.items.find(item => item.label === "pushService" && item.detail?.includes("@kit.PushKit"))
  assert.ok(item)
  await fs.writeFile(path.join(fixture.sdk, "hms", "ets", "kits", "@kit.PushKit.d.ts"),
    "import service from '@hms.core.push.pushService'; export { service as freshService };\n")
  const stale = await fixture.session.request("completionItem/resolve", item)
  assert.ok(!stale.result?.additionalTextEdits?.length, JSON.stringify(stale))
  fixture.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
    params: { settings: { arkts: { sdk: { path: fixture.sdk } } } } })
  fixture.session.changeDocument({ uri: fixture.params.textDocument.uri, version: 2, text: "const token = freshS\n" })
  const after = await request("freshS")
  assert.ok(after.result?.items.some(item => item.label === "freshService" && item.detail?.includes("@kit.PushKit")), JSON.stringify(after))
})

test("one LSP process isolates HMS export indexes for two workspace SDKs", { timeout: 30000 }, async t => {
  const first = await queryKit(t, "autoimport", { deferInitialize: true })
  const second = await queryKit(t, "autoimportSecond", { session: first.session, deferInitialize: true })
  await first.session.initialize({ workspaceFolders: [first, second].map((fixture, i) => ({
    uri: pathToFileURL(fixture.workspace).href, name: `workspace-${i}`,
  })) })
  for (const fixture of [first, second]) first.session.openDocument({
    uri: fixture.params.textDocument.uri, version: 1, text: fixture.source,
  })
  const complete = async (fixture, prefix) => {
    const response = await fixture.session.request("textDocument/completion", {
      textDocument: fixture.params.textDocument, position: { line: 0, character: 14 + prefix.length },
    })
    assert.equal(response.error, undefined)
    return response.result?.items ?? response.result ?? []
  }
  assert.ok((await complete(first, "pushS")).some(item => item.label === "pushService" && item.detail?.includes("@kit.PushKit")))
  assert.ok((await complete(second, "secondS")).some(item => item.label === "secondService" && item.detail?.includes("@kit.PushKit")))
  first.session.changeDocument({ uri: first.params.textDocument.uri, version: 2, text: "const token = secondS\n" })
  assert.ok(!(await complete(first, "secondS")).some(item => item.label === "secondService"))
})

const targetModes = {
  mismatch: { compileSdkVersion: 99 },
  aliases: { compileSdkVersion: "6.1.1(24)", compatibleSdkVersion: "5.0.0(12)", targetSdkVersion: "6.0.2(22)" },
  range: { compileSdkVersion: 24, compatibleSdkVersion: 24, targetSdkVersion: 22 },
  unknownAlias: { compileSdkVersion: "24.0.0" },
  unknownOS: { compileSdkVersion: 24, runtimeOS: "UnsupportedOS" },
  openharmony: { compileSdkVersion: 24, runtimeOS: "OpenHarmony" },
}

async function queryKit(t, mode = "direct", { session: existingSession, deferInitialize = false } = {}) {
  const target = targetModes[mode]
  const prefix = mode === "customPrefix" ? "@vendor" : "@hms"
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-hms-kit-"))
  const workspace = path.join(root, "workspace")
  const sdk = path.join(mode.startsWith("nested") ? workspace : root, "sdk")
  const oh = path.join(sdk, "openharmony")
  const hms = path.join(sdk, "hms", "ets")
  for (const directory of [workspace, path.join(oh, "ets", "component"), path.join(oh, "toolchains"),
    path.join(hms, "api"), path.join(hms, "kits")]) await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(oh, "ets", "oh-uni-package.json"), JSON.stringify({ path: "ets", apiVersion: "24", version: "6.1.1" }))
  await fs.writeFile(path.join(oh, "ets", "component", "common.d.ts"), "interface SdkGlobal {}\n")
  if (mode === "autoimportNoisy") await fs.writeFile(path.join(oh, "ets", "component", "common.d.ts"),
    Array.from({ length: 5000 }, (_, i) => `declare class AmbientNoise${i} {}`).join("\n"))
  await fs.writeFile(path.join(hms, "uni-package.json"), JSON.stringify({ path: "ets", apiVersion: mode === "incompatible" ? "25" : "24", version: "6.1.1" }))
  await fs.writeFile(path.join(hms, "sdkConfig.json"), JSON.stringify({ apiPath: ["./api", "./kits"], prefix, osName: "HarmonyOS" }))
  await fs.writeFile(path.join(hms, "kits", "@kit.PushKit.d.ts"), mode === "autoimportSecond"
    ? `import service from '${prefix}.core.push.pushService'; export { service as secondService };\n`
    : `import pushService from '${prefix}.core.push.pushService'; export { pushService };\n`)
  const entry = path.join(hms, "api", `${prefix}.core.push.pushService.d.${["dets", "autoimportDets"].includes(mode) ? "ets" : "ts"}`)
  const declaration = target || mode.startsWith("autoimport") || ["direct", "unknown", "dets", "invalid", "customPrefix", "incompatible"].includes(mode) ? entry : path.join(mode === "nestedEscape" ? workspace : ["relative", "nestedRelative"].includes(mode) ? path.dirname(entry) : root, "service.d.ts")
  await fs.writeFile(declaration, "declare namespace pushService { function getToken(): string }\nexport default pushService;\n")
  if (["relative", "nestedRelative"].includes(mode)) await fs.writeFile(entry, "export { default } from './service';\n")
  if (mode === "nestedEscape") await fs.writeFile(entry, "export { default } from '../../../../service';\n")
  if (mode === "escape") {
    if (process.platform === "win32") {
      const outside = path.join(root, "outside-api")
      await fs.mkdir(outside)
      await fs.copyFile(declaration, path.join(outside, path.basename(entry)))
      await fs.rmdir(path.dirname(entry))
      await fs.symlink(outside, path.dirname(entry), "junction")
    } else await fs.symlink(declaration, entry)
  }
  if (mode === "missing") await fs.rm(declaration)
  if (mode === "invalid") await fs.writeFile(path.join(hms, "sdkConfig.json"), "{")
  await fs.writeFile(path.join(workspace, "local.properties"), `sdk.dir=${sdk.replaceAll("\\", "\\\\")}\n`)
  if (target) await fs.writeFile(path.join(workspace, "build-profile.json5"), JSON.stringify({
    app: { products: [{ name: "default", ...target }] },
    modules: [{ name: "entry", srcPath: "./entry" }],
  }))
  if (target) {
    await fs.mkdir(path.join(workspace, "entry", "src", "main", "ets"), { recursive: true })
    await fs.writeFile(path.join(workspace, "entry", "build-profile.json5"), "{ targets: [{ name: 'default' }] }")
    await fs.writeFile(path.join(workspace, "entry", "oh-package.json5"), "{ name: 'entry' }")
    const mapDirectory = path.join(hms, "build-tools", "ts-checker-hooks")
    await fs.mkdir(mapDirectory, { recursive: true })
    await fs.writeFile(path.join(mapDirectory, "sdkApiVersionMap.json"), JSON.stringify({
      "12": ["5.0.0(12)"], "22": ["6.0.2(22)"], "24": ["6.1.1(24)"],
    }))
  }
  const document = path.join(workspace, ...(target ? ["entry", "src", "main", "ets"] : []), "Page.ets")
  const source = (mode === "autoimportSecond" ? "const token = secondS\n" : mode.startsWith("autoimport") ? "const token = pushS\n" : mode === "dets"
    ? "import { pushService as push } from '@kit.PushKit'\nconst token = push.getToken()\n"
    : "import { pushService } from '@kit.PushKit'\nconst token = pushService.getToken()\n")
    + (mode === "unknown" ? "import missing from '@hms.missing'; export { missing };\n" : "")
  await fs.writeFile(document, source)
  const uri = pathToFileURL(document).href
  const session = existingSession ?? new LspSession({ command: process.execPath, args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    capabilities: { workspace: { workspaceFolders: true } },
    rootUri: pathToFileURL(workspace).href, env: { ARKTS_LSP_LOG_DIR: path.join(root, "logs"), ARKTS_INDEX_CACHE_DIR: path.join(root, "cache") } })
  t.after(async () => { await session.close(); await fs.rm(root, { recursive: true, force: true }) })
  const params = {
    textDocument: { uri }, position: { line: 1, character: source.split("\n")[1].indexOf("getToken") + 1 },
  }
  let response
  if (!deferInitialize) {
    await session.initialize()
    session.openDocument({ uri, version: 1, text: source })
    response = await session.request("textDocument/definition", params, { timeoutMs: 15000 })
  }
  return { response, declaration, entry, session, sdk, params, workspace, source }
}
