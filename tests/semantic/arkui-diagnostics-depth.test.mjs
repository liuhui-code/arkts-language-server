import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildSync } from "esbuild"

import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "arkui-sdk-depth")
const sdkRoot = path.join(fixtureRoot, "sdk", "openharmony")

test("reports an exact missing-resource diagnostic only for an absent ArkUI key", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-arkui-missing-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const resourcePath = path.join(workspaceRoot, "resources", "base", "element", "string.json")
  fs.mkdirSync(path.dirname(resourcePath), { recursive: true })
  fs.writeFileSync(resourcePath, resourceJson("title"), "utf8")
  const documentPath = path.join(workspaceRoot, "Page.ets")
  const source = [
    "struct Page {",
    "  build() {",
    '    const face = "😀"; const ok = $r("app.string.title")',
    '    const missing = $r("app.string.missing_title")',
    "  }",
    "}",
    "",
  ].join("\n")
  const expectedRange = toSemanticRange(rangeInAnchor(source, "app.string.missing_title", "missing_title"))
  const { ArkUIResourceLanguageProvider } = buildProviderDriver(t)
  const provider = new ArkUIResourceLanguageProvider(workspaceRoot)
  t.after(() => provider.dispose())

  assert.deepEqual(provider.diagnostics({
    path: documentPath,
    line: 1,
    column: 1,
    documentVersion: 7,
    workspaceRoot,
  }, source), [{
    source: "language",
    severity: "error",
    code: "arkui.resource.not-found",
    path: documentPath,
    range: expectedRange,
    message: "ArkUI string resource 'app.string.missing_title' was not found.",
  }])
})

test("reuses and bounds ArkUI document facts by path, version, and content", (t) => {
  const { ArkUIResourceDocumentFactsCache } = buildFactsDriver(t)
  const cache = new ArkUIResourceDocumentFactsCache({ maxDocuments: 1, maxBytes: 4_096 })
  const firstPath = path.join(os.tmpdir(), "FactsOne.ets")
  const secondPath = path.join(os.tmpdir(), "FactsTwo.ets")
  const source = 'const title = $r("app.string.title")\n'
  const firstPosition = { path: firstPath, documentVersion: 1 }

  const first = cache.forDocument(firstPosition, source)
  assert.strictEqual(cache.forDocument(firstPosition, source), first)
  assert.deepEqual(first.literals.map(({ value }) => value), ["app.string.title"])

  const nextVersion = cache.forDocument({ ...firstPosition, documentVersion: 2 }, source)
  assert.notStrictEqual(nextVersion, first)
  const changedContent = cache.forDocument(
    { ...firstPosition, documentVersion: 2 },
    source.replace("app.string.title", "app.string.subtitle"),
  )
  assert.notStrictEqual(changedContent, nextVersion)
  assert.deepEqual(changedContent.literals.map(({ value }) => value), ["app.string.subtitle"])

  cache.forDocument({ path: secondPath, documentVersion: 1 }, source)
  const boundedState = cache.cacheState()
  assert.equal(boundedState.documents, 1)
  assert.ok(boundedState.bytes >= Buffer.byteLength(source))
  assert.ok(boundedState.bytes <= 4_096)
  assert.notStrictEqual(cache.forDocument(firstPosition, source), first)

  const overByteLimit = new ArkUIResourceDocumentFactsCache({
    maxDocuments: 1,
    maxBytes: 8,
  })
  const uncachedFirst = overByteLimit.forDocument(firstPosition, source)
  const uncachedSecond = overByteLimit.forDocument(firstPosition, source)
  assert.notStrictEqual(uncachedSecond, uncachedFirst)
  assert.deepEqual(overByteLimit.cacheState(), { documents: 0, bytes: 0 })
})

test("suppresses missing diagnostics when any resource input is incomplete", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-arkui-incomplete-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const { ArkUIResourceLanguageProvider } = buildProviderDriver(t)
  const source = 'const missing = $r("app.string.missing_title")\n'

  const malformedRoot = path.join(temporaryRoot, "malformed")
  writeResourceText(malformedRoot, "base", '{ "string": [')
  const malformed = new ArkUIResourceLanguageProvider(malformedRoot)
  t.after(() => malformed.dispose())
  assert.deepEqual(malformed.diagnostics(
    semanticDocument(malformedRoot, source),
    source,
  ), [])

  const limitedRoot = path.join(temporaryRoot, "limited")
  writeResourceText(limitedRoot, "base", resourceJson("title"))
  writeResourceText(limitedRoot, "en_US", resourceJson("subtitle"))
  const limited = new ArkUIResourceLanguageProvider(limitedRoot, { maxResourceFiles: 1 })
  t.after(() => limited.dispose())
  assert.deepEqual(limited.diagnostics(semanticDocument(limitedRoot, source), source), [])

  const unreadableRoot = path.join(temporaryRoot, "unreadable")
  writeResourceText(unreadableRoot, "base", resourceJson("title"))
  const unreadable = new ArkUIResourceLanguageProvider(unreadableRoot, {
    readResourceFile: () => null,
  })
  t.after(() => unreadable.dispose())
  assert.deepEqual(unreadable.diagnostics(semanticDocument(unreadableRoot, source), source), [])
})

test("returns immutable exact and ordered-prefix resource query snapshots", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-arkui-query-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  writeResourceText(workspaceRoot, "base", resourceJson("title"))
  writeResourceText(workspaceRoot, "en_US", resourceJson("title"))
  writeResourceText(workspaceRoot, "zh_CN", resourceJson("subtitle"))
  const { ArkUIResourceIndex } = buildIndexDriver(t)
  const index = new ArkUIResourceIndex(workspaceRoot)
  t.after(() => index.dispose())

  const exact = index.findExact("app.string.title")
  assert.equal(exact.status, "ready")
  assert.equal(exact.resources.length, 2)
  assert.ok(Object.isFrozen(exact))
  assert.ok(Object.isFrozen(exact.resources))
  assert.ok(Object.isFrozen(exact.resources[0]))
  assert.ok(Object.isFrozen(exact.resources[0].range))
  assert.throws(() => exact.resources.push(exact.resources[0]), TypeError)
  assert.throws(() => {
    exact.resources[0].name = "mutated"
  }, TypeError)

  const prefix = index.findByPrefix("app.string.")
  assert.ok(Object.isFrozen(prefix))
  assert.ok(Object.isFrozen(prefix.resources))
  assert.deepEqual(prefix.resources.map(({ name }) => name), ["subtitle", "title"])
  assert.deepEqual(
    index.findExact("app.string.title").resources.map(({ name }) => name),
    ["title", "title"],
  )
})

test("merges ArkUI and TypeScript diagnostics in stable source order", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-arkui-diagnostic-merge-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  writeResourceText(workspaceRoot, "base", resourceJson("title"))
  const documentPath = path.join(workspaceRoot, "Page.ets")
  const source = [
    "declare function $r(value: string): unknown",
    "const unknown = DefinitelyMissingSymbol",
    'const resource = $r("app.string.missing_title")',
    "",
  ].join("\n")
  fs.writeFileSync(documentPath, source, "utf8")
  const { SemanticTypeEngineRegistry } = buildTypeEngineDriver(t)
  const registry = new SemanticTypeEngineRegistry()
  t.after(() => registry.dispose())
  const context = registry.prepare(workspaceView(workspaceRoot, documentPath, source))
  const position = {
    path: documentPath,
    line: 1,
    column: 1,
    documentVersion: 1,
    workspaceRoot,
  }
  const relevant = () => context.diagnostics(position)
    .filter(({ code }) => code === 2304 || code === "arkui.resource.not-found")
    .map(({ code, range }) => ({ code, range }))
  const expected = [
    {
      code: 2304,
      range: toSemanticRange(rangeInAnchor(
        source,
        "unknown = DefinitelyMissingSymbol",
        "DefinitelyMissingSymbol",
      )),
    },
    {
      code: "arkui.resource.not-found",
      range: toSemanticRange(rangeInAnchor(
        source,
        "app.string.missing_title",
        "missing_title",
      )),
    },
  ]

  assert.deepEqual(relevant(), expected)
  assert.deepEqual(relevant(), expected)
  assert.deepEqual(context.codeActions(
    position,
    expected[1].range,
  ), [], "a string diagnostic code must not enter the numeric TypeScript quick-fix path")
})

test("refreshes missing-resource diagnostics after narrow resource invalidation", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-arkui-diagnostic-watch-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const resourcePath = writeResourceText(workspaceRoot, "base", resourceJson("title"))
  const documentPath = path.join(workspaceRoot, "Page.ets")
  const source = 'declare function $r(value: string): unknown\n$r("app.string.subtitle")\n'
  fs.writeFileSync(documentPath, source, "utf8")
  const { SemanticTypeEngineRegistry } = buildTypeEngineDriver(t)
  const registry = new SemanticTypeEngineRegistry()
  t.after(() => registry.dispose())
  const position = {
    path: documentPath,
    line: 1,
    column: 1,
    documentVersion: 1,
    workspaceRoot,
  }
  const first = registry.prepare(workspaceView(workspaceRoot, documentPath, source))
  assert.deepEqual(
    first.diagnostics(position).filter(({ code }) => code === "arkui.resource.not-found").length,
    1,
  )
  fs.writeFileSync(resourcePath, resourceJson("subtitle"), "utf8")

  registry.invalidateArkUIResources(workspaceRoot)
  const refreshed = registry.prepare(workspaceView(workspaceRoot, documentPath, source))

  assert.deepEqual(
    refreshed.diagnostics(position).filter(({ code }) => code === "arkui.resource.not-found"),
    [],
  )
  assert.equal(refreshed.state.generation, first.state.generation)
})

test("publishes TS2552 for a misspelled ArkUI decorator at its exact UTF-16 range", async (t) => {
  const opened = await openDiagnosticDocument(t, "MisspelledDecorator.ets", 3)
  const expectedRange = rangeInAnchor(opened.text, "/* 😀 */ @Componet", "Componet")
  const line = opened.text.split("\n")[expectedRange.start.line]
  const prefix = line.slice(0, expectedRange.start.character)
  assert.match(prefix, /😀/)
  assert.equal(prefix.length - Array.from(prefix).length, 1)

  const published = await opened.diagnostics
  assert.deepEqual(
    published.params.diagnostics
      .filter(({ code }) => code === 2552)
      .map(({ code, severity, source, range }) => ({ code, severity, source, range })),
    [{ code: 2552, severity: 1, source: "arkts", range: expectedRange }],
  )
})

test("publishes a stable diagnostic for a missing ArkUI string resource key", async (t) => {
  const opened = await openDiagnosticDocument(t, "MissingResource.ets", 5)
  const expectedRange = rangeInAnchor(
    opened.text,
    'app.string.missing_title"',
    "missing_title",
  )
  const line = opened.text.split("\n")[expectedRange.start.line]
  const prefix = line.slice(0, expectedRange.start.character)
  assert.match(prefix, /😀/)
  assert.equal(prefix.length - Array.from(prefix).length, 1)

  const published = await opened.diagnostics
  assert.deepEqual(
    published.params.diagnostics
      .filter(({ code }) => code === "arkui.resource.not-found")
      .map(({ code, severity, source, range, message }) => ({
        code,
        severity,
        source,
        range,
        message,
      })),
    [{
      code: "arkui.resource.not-found",
      severity: 1,
      source: "arkts",
      range: expectedRange,
      message: "ArkUI string resource 'app.string.missing_title' was not found.",
    }],
  )
})

test("preserves real non-builder TypeScript syntax and unknown-name diagnostics", async (t) => {
  const opened = await openDiagnosticDocument(t, "TypeScriptGuard.ets", 7)
  const unknownNameRange = rangeInAnchor(
    opened.text,
    "missing = DefinitelyMissingSymbol",
    "DefinitelyMissingSymbol",
  )
  const finalBraceOffset = opened.text.lastIndexOf("}")
  assert.notEqual(finalBraceOffset, -1)
  const syntaxRange = {
    start: positionAt(opened.text, finalBraceOffset),
    end: positionAt(opened.text, finalBraceOffset + 1),
  }

  const published = await opened.diagnostics
  const protectedDiagnostics = published.params.diagnostics
    .filter(({ code }) => code === 1128 || code === 2304)
    .map(({ code, severity, source, range }) => ({ code, severity, source, range }))
    .sort((left, right) => left.code - right.code)
  assert.deepEqual(protectedDiagnostics, [
    { code: 1128, severity: 1, source: "arkts", range: syntaxRange },
    { code: 2304, severity: 1, source: "arkts", range: unknownNameRange },
  ])
})

async function openDiagnosticDocument(t, fileName, version) {
  const documentPath = path.join(fixtureRoot, fileName)
  const documentUri = pathToFileURL(documentPath).href
  const text = fs.readFileSync(documentPath, "utf8")
  const server = new LspProcess({ env: { ARKLINE_HARMONY_SDK_PATH: sdkRoot } })
  t.after(async () => server.close())
  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: {
        general: { positionEncodings: ["utf-16"] },
        textDocument: { publishDiagnostics: { versionSupport: true } },
      },
    },
  })
  const initialized = await server.response(1)
  assert.equal(initialized.error, undefined, JSON.stringify(initialized.error))
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  const diagnostics = server.notification(
    "textDocument/publishDiagnostics",
    ({ params }) => params.uri === documentUri && params.version === version,
  )
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: { uri: documentUri, languageId: "arkts", version, text },
    },
  })
  return { diagnostics, documentUri, server, text }
}

function rangeInAnchor(text, anchor, token) {
  const anchorOffset = text.indexOf(anchor)
  assert.notEqual(anchorOffset, -1, `missing anchor: ${anchor}`)
  const tokenOffset = anchor.indexOf(token)
  assert.notEqual(tokenOffset, -1, `${token} is absent from ${anchor}`)
  const start = anchorOffset + tokenOffset
  return { start: positionAt(text, start), end: positionAt(text, start + token.length) }
}

function positionAt(text, offset) {
  const prefix = text.slice(0, offset)
  return {
    line: prefix.split("\n").length - 1,
    character: offset - (prefix.lastIndexOf("\n") + 1),
  }
}

function buildProviderDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-arkui-provider-driver-"))
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  const outfile = path.join(outputRoot, "resource-language-provider.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "core", "arkui", "resource-language-provider.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
  })
  return createRequire(import.meta.url)(outfile)
}

function buildFactsDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-arkui-facts-driver-"))
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  const outfile = path.join(outputRoot, "resource-document-facts.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "core", "arkui", "resource-document-facts.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
  })
  return createRequire(import.meta.url)(outfile)
}

function buildIndexDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-arkui-index-driver-"))
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  const outfile = path.join(outputRoot, "resource-index.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "core", "arkui", "resource-index.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
  })
  return createRequire(import.meta.url)(outfile)
}

function buildTypeEngineDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-arkui-type-driver-"))
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  const outfile = path.join(outputRoot, "type-engine.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "core", "types", "type-engine.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
  })
  return createRequire(import.meta.url)(outfile)
}

function resourceJson(name) {
  return `${JSON.stringify({ string: [{ name, value: name }] }, null, 2)}\n`
}

function writeResourceText(workspaceRoot, qualifier, content) {
  const resourcePath = path.join(
    workspaceRoot,
    "resources",
    qualifier,
    "element",
    "string.json",
  )
  fs.mkdirSync(path.dirname(resourcePath), { recursive: true })
  fs.writeFileSync(resourcePath, content, "utf8")
  return resourcePath
}

function semanticDocument(workspaceRoot, source) {
  const documentPath = path.join(workspaceRoot, "Page.ets")
  fs.writeFileSync(documentPath, source, "utf8")
  return {
    path: documentPath,
    line: 1,
    column: 1,
    documentVersion: 1,
    workspaceRoot,
  }
}

function workspaceView(workspaceRoot, documentPath, source) {
  return {
    rootPath: workspaceRoot,
    documents: [{ path: documentPath, content: source, documentVersion: 1, overlay: true }],
    projectMembership: {
      status: "complete",
      paths: [documentPath],
      revision: 1,
    },
    removedPaths: [],
    changedPaths: [],
    contentRevision: 1,
    resetTypeEngine: false,
    state: {
      path: documentPath,
      contentGeneration: 1,
      documentVersion: 1,
      dependencyGeneration: 1,
      documentCacheHit: false,
      dependencyClosureCacheHit: false,
      queryCacheHit: false,
      loadedDocumentCount: 1,
      syntaxReady: true,
    },
  }
}

function toSemanticRange(range) {
  return {
    startLine: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLine: range.end.line + 1,
    endColumn: range.end.character + 1,
  }
}
