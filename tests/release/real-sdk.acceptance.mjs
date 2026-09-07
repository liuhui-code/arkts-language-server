import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

const SDK_API_VERSION = "24"
const SDK_COMPONENT_VERSION = "6.1.1.125"

test("API 24 resolves the real ArkUI Text declaration through stdio", { timeout: 60_000 }, async (t) => {
  const source = 'const component = Text("Ready").fontColor("#ffffff")\n'
  const fixture = await sdkSession(t, source)
  const definition = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.uri }, position: rangeInAnchor(source, 'Text("Ready")', "Text").start,
  }, { timeoutMs: 30_000 })
  assert.equal(definition.error, undefined)
  assert.deepEqual(definition.result, [{
    uri: pathToFileURL(fixture.textDeclaration).href,
    range: rangeInAnchor(fixture.textDeclarationSource, "declare const Text: TextInterface;", "Text"),
  }, {
    uri: pathToFileURL(fixture.textDeclaration).href,
    range: rangeInAnchor(fixture.textDeclarationSource,
      "(content?: string | Resource, value?: TextOptions): TextAttribute;",
      "(content?: string | Resource, value?: TextOptions): TextAttribute;"),
  }])
})

test("API 24 completes and resolves the real ArkUI fontColor method", { timeout: 60_000 }, async (t) => {
  const source = 'const component = Text("Ready").fontColor("#ffffff")\nconst candidate = Text("Ready").fontC\n'
  const fixture = await sdkSession(t, source)
  const replacement = rangeInAnchor(source, 'candidate = Text("Ready").fontC', "fontC")
  const completion = await fixture.session.request("textDocument/completion", {
    textDocument: { uri: fixture.uri }, position: replacement.end, context: { triggerKind: 1 },
  }, { timeoutMs: 30_000 })
  assert.equal(completion.error, undefined)
  const items = Array.isArray(completion.result) ? completion.result : completion.result?.items ?? []
  assert.deepEqual(items.filter(({ label }) => label === "fontColor").map(({ label, kind, textEdit }) => ({ label, kind, textEdit })), [{
    label: "fontColor", kind: 2, textEdit: { range: replacement, newText: "fontColor" },
  }])
  const definition = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.uri }, position: rangeInAnchor(source, '.fontColor("#ffffff")', "fontColor").start,
  }, { timeoutMs: 30_000 })
  assert.equal(definition.error, undefined)
  assert.deepEqual(definition.result, [{
    uri: pathToFileURL(fixture.textDeclaration).href,
    range: rangeInAnchor(fixture.textDeclarationSource, "fontColor(value: ResourceColor): TextAttribute;", "fontColor"),
  }])
})

test("API 24 completes and resolves the real util TextEncoder method", { timeout: 60_000 }, async (t) => {
  const source = "import util from '@ohos.util'\nconst encoder = new util.TextEncoder()\nconst encoded = encoder.encodeInto('hello')\nconst candidate = encoder.encodeI\n"
  const fixture = await sdkSession(t, source)
  const replacement = rangeInAnchor(source, "candidate = encoder.encodeI", "encodeI")
  const completion = await fixture.session.request("textDocument/completion", {
    textDocument: { uri: fixture.uri }, position: replacement.end, context: { triggerKind: 1 },
  }, { timeoutMs: 30_000 })
  assert.equal(completion.error, undefined)
  const items = Array.isArray(completion.result) ? completion.result : completion.result?.items ?? []
  assert.deepEqual(items.filter(({ label }) => label === "encodeInto").map(({ label, kind, textEdit }) => ({ label, kind, textEdit })), [{
    label: "encodeInto", kind: 2, textEdit: { range: replacement, newText: "encodeInto" },
  }])
  const definition = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.uri }, position: rangeInAnchor(source, "encoder.encodeInto('hello')", "encodeInto").start,
  }, { timeoutMs: 30_000 })
  assert.equal(definition.error, undefined)
  const declaration = path.join(fixture.sdkRoot, "ets", "api", "@ohos.util.d.ts")
  const declarationSource = await fs.readFile(declaration, "utf8")
  assert.deepEqual(definition.result, [{
    uri: pathToFileURL(declaration).href,
    range: rangeInAnchor(declarationSource, "encodeInto(input?: string): Uint8Array;", "encodeInto"),
  }])
})

test("API 24 diagnoses invalid SDK arguments and clears fixed diagnostics with the selected identity", { timeout: 60_000 }, async (t) => {
  const source = "import util from '@ohos.util'\nconst encoder = new util.TextEncoder()\nconst encoded = encoder.encodeInto('hello')\nconst component = Text('Ready').fontColor('#ffffff')\n"
  const fixture = await sdkSession(t, source)
  const diagnostics = (version) => fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === version, 30_000)
  assert.deepEqual((await diagnostics(1)).params.diagnostics, [])

  const invalid = source.replace("encodeInto('hello')", "encodeInto(123)")
  fixture.session.changeDocument({ uri: fixture.uri, version: 2, text: invalid })
  assert.deepEqual((await diagnostics(2)).params.diagnostics.map(({ code, severity, range }) => ({ code, severity, range })), [{
    code: 2345, severity: 1, range: rangeInAnchor(invalid, "encodeInto(123)", "123"),
  }])

  fixture.session.changeDocument({ uri: fixture.uri, version: 3, text: source })
  assert.deepEqual((await diagnostics(3)).params.diagnostics, [])
  const logs = (await fs.readFile(fixture.logFile, "utf8")).trim().split("\n").map((line) => JSON.parse(line))
  const selected = logs.filter(({ event }) => event === "sdk.selected")
  assert.equal(selected.length, 1)
  assert.deepEqual(selected.map(({ source: selectionSource, sdkPath, metadataStatus, apiVersion, componentVersion }) => ({
    source: selectionSource, sdkPath, metadataStatus, apiVersion, componentVersion,
  })), [{
    source: "project", sdkPath: fixture.sdkRoot, metadataStatus: "identified",
    apiVersion: SDK_API_VERSION, componentVersion: SDK_COMPONENT_VERSION,
  }])
})

test("API 24 excludes browser DOM globals from diagnostics and completion", { timeout: 60_000 }, async (t) => {
  const source = "const browserDocument = document\n"
  const fixture = await sdkSession(t, source)
  const documentRange = rangeInAnchor(source, "= document", "document")
  const diagnostics = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1, 30_000)
  assert.deepEqual(diagnostics.params.diagnostics.map(({ code, severity, range }) => ({ code, severity, range })), [{
    code: 2584, severity: 1, range: documentRange,
  }])
  const completion = await fixture.session.request("textDocument/completion", {
    textDocument: { uri: fixture.uri }, position: documentRange.end, context: { triggerKind: 1 },
  }, { timeoutMs: 30_000 })
  assert.equal(completion.error, undefined)
  const items = Array.isArray(completion.result) ? completion.result : completion.result?.items ?? []
  assert.deepEqual(items.filter(({ label }) => label === "document"), [])
})

test("API 24 resolves official Kit exports for hilog completion definition and diagnostics", { timeout: 60_000 }, async (t) => {
  const source = "import { hilog } from '@kit.PerformanceAnalysisKit'\nhilog.info(0, 'test', 'ready')\n"
  const fixture = await sdkSession(t, source)
  const kitDeclaration = path.join(fixture.sdkRoot, "ets", "kits", "@kit.PerformanceAnalysisKit.d.ts")
  const kitSource = await fs.readFile(kitDeclaration, "utf8")
  rangeInAnchor(kitSource, "import hilog from '@ohos.hilog';", "hilog")
  const diagnostics = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1, 30_000)
  assert.deepEqual(diagnostics.params.diagnostics, [])

  const usage = rangeInAnchor(source, "hilog.info(0, 'test', 'ready')", "info")
  const completion = await fixture.session.request("textDocument/completion", {
    textDocument: { uri: fixture.uri }, position: usage.end, context: { triggerKind: 1 },
  }, { timeoutMs: 30_000 })
  assert.equal(completion.error, undefined)
  const items = Array.isArray(completion.result) ? completion.result : completion.result?.items ?? []
  assert.deepEqual(items.filter(({ label }) => label === "info").map(({ label, kind, textEdit }) => ({ label, kind, textEdit })), [{
    label: "info", kind: 3, textEdit: { range: usage, newText: "info" },
  }])
  const definition = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.uri }, position: usage.start,
  }, { timeoutMs: 30_000 })
  assert.equal(definition.error, undefined)
  const declaration = path.join(fixture.sdkRoot, "ets", "api", "@ohos.hilog.d.ts")
  const declarationSource = await fs.readFile(declaration, "utf8")
  assert.deepEqual(definition.result, [{
    uri: pathToFileURL(declaration).href,
    range: rangeInAnchor(declarationSource, "function info(domain: number, tag: string, format: string, ...args: any[]): void;", "info"),
  }])
})

test("API 24 resolves real ArkTS collections declarations and Map members", { timeout: 60_000 }, async (t) => {
  const source = "import collections from '@arkts.collections'\nconst values = new collections.Map<string, number>()\nvalues.set('key', 1)\nconst result = values.get('key')\n"
  const fixture = await sdkSession(t, source)
  const diagnostics = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1, 30_000)
  assert.deepEqual(diagnostics.params.diagnostics, [])
  const usage = rangeInAnchor(source, "values.get('key')", "get")
  const completion = await fixture.session.request("textDocument/completion", {
    textDocument: { uri: fixture.uri }, position: usage.end, context: { triggerKind: 1 },
  }, { timeoutMs: 30_000 })
  assert.equal(completion.error, undefined)
  const items = Array.isArray(completion.result) ? completion.result : completion.result?.items ?? []
  assert.deepEqual(items.filter(({ label }) => label === "get").map(({ label, kind, textEdit }) => ({ label, kind, textEdit })), [{
    label: "get", kind: 2, textEdit: { range: usage, newText: "get" },
  }])
  const definition = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.uri }, position: usage.start,
  }, { timeoutMs: 30_000 })
  assert.equal(definition.error, undefined)
  const declaration = path.join(fixture.sdkRoot, "ets", "arkts", "@arkts.collections.d.ets")
  const declarationSource = await fs.readFile(declaration, "utf8")
  assert.deepEqual(definition.result, [{
    uri: pathToFileURL(declaration).href,
    range: rangeInAnchor(declarationSource, "get(key: K): V | undefined;", "get"),
  }])
})

test("API 24 resolves the shipped system router clear declaration", { timeout: 60_000 }, async (t) => {
  const source = "import router from '@system.router'\nrouter.clear()\n"
  const fixture = await sdkSession(t, source)
  const diagnostics = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1, 30_000)
  assert.deepEqual(diagnostics.params.diagnostics, [])
  const usage = rangeInAnchor(source, "router.clear()", "clear")
  const completion = await fixture.session.request("textDocument/completion", {
    textDocument: { uri: fixture.uri }, position: usage.end, context: { triggerKind: 1 },
  }, { timeoutMs: 30_000 })
  assert.equal(completion.error, undefined)
  const items = Array.isArray(completion.result) ? completion.result : completion.result?.items ?? []
  assert.deepEqual(items.filter(({ label }) => label === "clear").map(({ label, kind, textEdit }) => ({ label, kind, textEdit })), [{
    label: "clear", kind: 2, textEdit: { range: usage, newText: "clear" },
  }])
  const definition = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.uri }, position: usage.start,
  }, { timeoutMs: 30_000 })
  assert.equal(definition.error, undefined)
  const declaration = path.join(fixture.sdkRoot, "ets", "api", "@system.router.d.ts")
  const declarationSource = await fs.readFile(declaration, "utf8")
  assert.deepEqual(definition.result, [{
    uri: pathToFileURL(declaration).href,
    range: rangeInAnchor(declarationSource, "static clear(): void;", "clear"),
  }])
})

test("API 24 follows dotted relative SDK declarations for router callback members", { timeout: 60_000 }, async (t) => {
  const source = "import router from '@ohos.router'\nrouter.pushUrl({ url: 'pages/Index' }, (err) => {\n  const result = err.code\n})\n"
  const fixture = await sdkSession(t, source)
  const diagnostics = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1, 30_000)
  assert.deepEqual(diagnostics.params.diagnostics, [])
  const usage = rangeInAnchor(source, "err.code", "code")
  const completion = await fixture.session.request("textDocument/completion", {
    textDocument: { uri: fixture.uri }, position: usage.end, context: { triggerKind: 1 },
  }, { timeoutMs: 30_000 })
  assert.equal(completion.error, undefined)
  const items = Array.isArray(completion.result) ? completion.result : completion.result?.items ?? []
  assert.deepEqual(items.filter(({ label }) => label === "code").map(({ label, kind, textEdit }) => ({ label, kind, textEdit })), [{
    label: "code", kind: 5, textEdit: { range: usage, newText: "code" },
  }])
  const definition = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.uri }, position: usage.start,
  }, { timeoutMs: 30_000 })
  assert.equal(definition.error, undefined)
  const declaration = path.join(fixture.sdkRoot, "ets", "api", "@ohos.base.d.ts")
  const declarationSource = await fs.readFile(declaration, "utf8")
  assert.deepEqual(definition.result, [{
    uri: pathToFileURL(declaration).href,
    range: rangeInAnchor(declarationSource, "code: number;", "code"),
  }])
})

test("API 24 globals do not crowd out an unopened workspace class completion", { timeout: 60_000 }, async (t) => {
  const source = "const candidate = Sta\n"
  const fixture = await sdkSession(t, source, {
    "Stale.ets": "export class StaleType {}\n",
  })
  const replacement = rangeInAnchor(source, "candidate = Sta", "Sta")
  const completion = await fixture.session.request("textDocument/completion", {
    textDocument: { uri: fixture.uri }, position: replacement.end, context: { triggerKind: 1 },
  }, { timeoutMs: 30_000 })
  assert.equal(completion.error, undefined)
  const items = Array.isArray(completion.result) ? completion.result : completion.result?.items ?? []
  assert.deepEqual(
    items.filter(({ label }) => label === "StaleType").map(({ label, kind, detail, textEdit }) => ({
      label, kind, detail, textEdit,
    })),
    [{
      label: "StaleType",
      kind: 7,
      detail: "./Stale",
      textEdit: { range: replacement, newText: "StaleType" },
    }],
  )
  assert.ok(items.length <= 128, `expected at most 128 completion items, received ${items.length}`)
  assert.equal(completion.result?.isIncomplete, true)
})

async function sdkSession(t, source, workspaceFiles = {}) {
  const configured = process.env.ARKTS_REAL_SDK_PATH
  assert.ok(configured?.trim(), "ARKTS_REAL_SDK_PATH is required; set it to the API 24 / ETS 6.1.1.125 SDK root")
  assert.equal(path.isAbsolute(configured), true, "ARKTS_REAL_SDK_PATH must be absolute")
  const sdkRoot = await fs.realpath(configured)
  const metadata = JSON.parse(await fs.readFile(path.join(sdkRoot, "ets", "oh-uni-package.json"), "utf8"))
  assert.equal(metadata.path, "ets", "expected ETS SDK component metadata")
  assert.equal(metadata.apiVersion, SDK_API_VERSION, "real SDK API baseline changed")
  assert.equal(metadata.version, SDK_COMPONENT_VERSION, "real SDK component baseline changed")
  const textDeclaration = path.join(sdkRoot, "ets", "component", "text.d.ts")
  const textDeclarationSource = await fs.readFile(textDeclaration, "utf8")
  rangeInAnchor(textDeclarationSource, "declare const Text: TextInterface;", "Text")

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-real-sdk-"))
  let session
  t.after(async () => {
    try { await session?.close({ timeoutMs: 5_000 }) }
    finally { await fs.rm(root, { recursive: true, force: true }) }
  })
  const workspace = path.join(root, "workspace")
  await fs.mkdir(workspace)
  await fs.writeFile(path.join(workspace, "local.properties"), `sdk.dir=${sdkRoot.replaceAll("\\", "\\\\")}\n`)
  for (const [relativePath, content] of Object.entries(workspaceFiles)) {
    const filePath = path.join(workspace, relativePath)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content)
  }
  const documentPath = path.join(workspace, "Page.ets")
  await fs.writeFile(documentPath, source)
  const uri = pathToFileURL(documentPath).href
  session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    rootUri: pathToFileURL(workspace).href,
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-process-fallback"),
      ARKTS_LSP_LOG_DIR: path.join(root, "logs"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "index-cache"),
    },
    capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
  })
  await session.initialize({ timeoutMs: 30_000 })
  session.openDocument({ uri, version: 1, text: source })
  return { session, uri, sdkRoot, textDeclaration, textDeclarationSource, logFile: path.join(root, "logs", "server.log") }
}

function rangeInAnchor(source, anchor, token) {
  const anchorOffset = source.indexOf(anchor)
  assert.notEqual(anchorOffset, -1, `expected source anchor: ${anchor}`)
  assert.equal(source.indexOf(anchor, anchorOffset + 1), -1, `source anchor must be unique: ${anchor}`)
  const tokenOffset = anchor.indexOf(token)
  assert.notEqual(tokenOffset, -1, `expected ${token} inside ${anchor}`)
  const offset = anchorOffset + tokenOffset
  return { start: positionAt(source, offset), end: positionAt(source, offset + token.length) }
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  return { line: prefix.split("\n").length - 1, character: offset - prefix.lastIndexOf("\n") - 1 }
}
