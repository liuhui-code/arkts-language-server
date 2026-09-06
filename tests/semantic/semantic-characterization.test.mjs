import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import { CompletionItemKind } from "vscode-languageserver/node.js"

import { applyTextEdits } from "../support/lsp-edits.mjs"
import { LspSession } from "../support/lsp-session.mjs"
import { LspProcess, projectRoot } from "../support/lsp-process.mjs"
import { materializeConformanceWorkspace } from "../support/materialize-conformance-workspace.mjs"

test("returns the exact unopened definition range after an emoji prefix", async (t) => {
  const materialized = await materializeConformanceWorkspace()
  const reference = materialized.cases["profile.reference"]
  const target = materialized.cases["profile.definition"]
  const consumer = fs.readFileSync(fileURLToPath(reference.uri), "utf8")
  const profile = fs.readFileSync(fileURLToPath(target.uri), "utf8")
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  const referenceLine = consumer.split("\n")[reference.range.start.line]
  const prefix = referenceLine.slice(0, reference.range.start.character)
  assert.match(prefix, /😀/)
  assert.equal(
    prefix.length - Array.from(prefix).length,
    1,
    "the emoji before the reference must occupy two UTF-16 code units",
  )
  assert.equal(textInRange(consumer, reference.range), "Profile")

  await session.initialize()
  session.openDocument({
    uri: reference.uri,
    languageId: "arkts",
    version: 1,
    text: consumer,
  })
  const response = await session.request("textDocument/definition", {
    textDocument: { uri: reference.uri },
    position: midpoint(reference.range),
  })

  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const locations = response.result === null
    ? []
    : Array.isArray(response.result)
      ? response.result
      : [response.result]
  assert.equal(locations.length, 1)
  assert.equal(locations[0].uri, target.uri)
  assert.deepEqual(locations[0].range, target.range)
  assert.notDeepEqual(locations[0].range.start, locations[0].range.end)
  assert.equal(textInRange(profile, locations[0].range), "Profile")

  const overlayPrefix = "const overlayMarker = '😀'\n\nstruct OverlayPadding {}\n\n"
  const profileOverlay = `${overlayPrefix}${profile}`
  const overlayNameOffset = profileOverlay.indexOf("Profile", overlayPrefix.length)
  assert.notEqual(overlayNameOffset, -1)
  const overlayRange = {
    start: positionAt(profileOverlay, overlayNameOffset),
    end: positionAt(profileOverlay, overlayNameOffset + "Profile".length),
  }
  assert.equal(
    overlayPrefix.length - Array.from(overlayPrefix).length,
    1,
    "the target overlay prefix must contain a non-BMP UTF-16 character",
  )
  session.openDocument({
    uri: target.uri,
    languageId: "arkts",
    version: 1,
    text: profileOverlay,
  })
  const overlayResponse = await session.request("textDocument/definition", {
    textDocument: { uri: reference.uri },
    position: midpoint(reference.range),
  })

  assert.equal(overlayResponse.error, undefined, JSON.stringify(overlayResponse.error))
  const overlayLocations = overlayResponse.result === null
    ? []
    : Array.isArray(overlayResponse.result)
      ? overlayResponse.result
      : [overlayResponse.result]
  assert.deepEqual(overlayLocations, [{ uri: target.uri, range: overlayRange }])
  assert.notDeepEqual(overlayLocations[0].range.start, overlayLocations[0].range.end)
  assert.equal(textInRange(profileOverlay, overlayLocations[0].range), "Profile")
})

test("completes a one-character non-member local with an exact replacement", async (t) => {
  const materialized = await materializeConformanceWorkspace()
  const documentPath = path.join(
    materialized.workspaceRoot,
    "entry",
    "src",
    "main",
    "ets",
    "pages",
    "ShortPrefix.ets",
  )
  const documentUri = pathToFileURL(documentPath).href
  const source = [
    "class Hidden {",
    "  ghostMember: number = 0",
    "}",
    "",
    "function build(): void {",
    "  const genuineLocal = 1",
    "  const selected = g",
    "}",
  ].join("\n")
  await fs.promises.writeFile(documentPath, source, "utf8")
  const prefixEnd = source.lastIndexOf("g") + 1
  const replacementRange = {
    start: positionAt(source, prefixEnd - 1),
    end: positionAt(source, prefixEnd),
  }
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  await session.initialize()
  session.openDocument({
    uri: documentUri,
    languageId: "arkts",
    version: 1,
    text: source,
  })
  const response = await session.request("textDocument/completion", {
    textDocument: { uri: documentUri },
    position: replacementRange.end,
  })

  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  const locals = items.filter((item) => item.label === "genuineLocal")
  assert.equal(locals.length, 1, `Expected genuineLocal in ${JSON.stringify(items)}`)
  assert.equal(items.some((item) => item.label === "ghostMember"), false)
  assert.equal(items.some((item) => item.label === "Greeter"), false)
  assert.deepEqual(locals[0].textEdit, {
    range: replacementRange,
    newText: "genuineLocal",
  })
})

test("filters a Unicode ArkTS identifier before the provider quota and replaces its exact UTF-16 prefix", async (t) => {
  const materialized = await materializeConformanceWorkspace()
  const documentPath = path.join(
    materialized.workspaceRoot,
    "entry",
    "src",
    "main",
    "ets",
    "pages",
    "UnicodePrefixCompletion.ets",
  )
  const documentUri = pathToFileURL(documentPath).href
  const source = [
    ...Array.from(
      { length: 180 },
      (_, index) => `class filler${String(index).padStart(3, "0")} {}`,
    ),
    "",
    "class 中文组件 {}",
    "",
    "const marker = '😀'; const selected = 中",
    "",
  ].join("\n")
  await fs.promises.writeFile(documentPath, source, "utf8")
  const prefixStart = source.lastIndexOf("中")
  const replacementRange = {
    start: positionAt(source, prefixStart),
    end: positionAt(source, prefixStart + "中".length),
  }
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  await session.initialize()
  session.openDocument({
    uri: documentUri,
    languageId: "arkts",
    version: 1,
    text: source,
  })
  const response = await session.request("textDocument/completion", {
    textDocument: { uri: documentUri },
    position: replacementRange.end,
    context: { triggerKind: 1 },
  })

  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(Array.isArray(response.result), false)
  assert.equal(response.result?.isIncomplete, false)
  const items = response.result?.items ?? []
  assert.deepEqual(items.map(({ label }) => label), ["中文组件"])
  assert.equal(items[0].kind, CompletionItemKind.Class)
  assert.deepEqual(items[0].textEdit, {
    range: replacementRange,
    newText: "中文组件",
  })
  const completed = applyTextEdits(source, [items[0].textEdit])
  assert.equal(completed.slice(prefixStart, prefixStart + "中文组件".length), "中文组件")
  assert.equal(completed.endsWith("中中文组件\n"), false)
})

test("completes contextual object properties without a prefix", async (t) => {
  const materialized = await materializeConformanceWorkspace()
  const documentPath = path.join(
    materialized.workspaceRoot,
    "entry",
    "src",
    "main",
    "ets",
    "pages",
    "ContextualCompletion.ets",
  )
  const documentUri = pathToFileURL(documentPath).href
  const source = [
    "interface Options {",
    "  title: string",
    "  count: number",
    "}",
    "",
    "class Receiver {",
    "  fieldValue: string = 'value'",
    "}",
    "",
    "function options(): Options {",
    "  return {  }",
    "}",
    "",
    "function computed(receiver: Receiver) {",
    "  return { [receiver.fi]: 'value' }",
    "}",
    "",
    "const unfinished: Options = { ti",
  ].join("\n")
  await fs.promises.writeFile(documentPath, source, "utf8")
  const cursorOffset = source.indexOf("{  }") + 2
  const computedPrefixStart = source.indexOf("receiver.fi") + "receiver.".length
  const unfinishedPrefixStart = source.lastIndexOf("ti")
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  await session.initialize()
  session.openDocument({
    uri: documentUri,
    languageId: "arkts",
    version: 1,
    text: source,
  })
  const response = await session.request("textDocument/completion", {
    textDocument: { uri: documentUri },
    position: positionAt(source, cursorOffset),
    context: { triggerKind: 1 },
  })

  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  const title = items.filter((item) => item.label === "title")
  const count = items.filter((item) => item.label === "count")
  assert.equal(title.length, 1, `Expected title in ${JSON.stringify(items)}`)
  assert.equal(count.length, 1, `Expected count in ${JSON.stringify(items)}`)
  assert.equal(title[0].kind, CompletionItemKind.Property)
  assert.equal(count[0].kind, CompletionItemKind.Property)
  assert.equal(
    items.some((item) => item.label === "Greeter"),
    false,
    "zero-prefix contextual completion must not enable workspace module exports",
  )

  const computedResponse = await session.request("textDocument/completion", {
    textDocument: { uri: documentUri },
    position: positionAt(source, computedPrefixStart + "fi".length),
    context: { triggerKind: 1 },
  })
  assert.equal(computedResponse.error, undefined, JSON.stringify(computedResponse.error))
  const computedItems = Array.isArray(computedResponse.result)
    ? computedResponse.result
    : computedResponse.result?.items ?? []
  const fieldValue = computedItems.filter((item) => item.label === "fieldValue")
  assert.equal(fieldValue.length, 1, `Expected fieldValue in ${JSON.stringify(computedItems)}`)
  assert.equal(fieldValue[0].kind, CompletionItemKind.Field)

  const unfinishedResponse = await session.request("textDocument/completion", {
    textDocument: { uri: documentUri },
    position: positionAt(source, unfinishedPrefixStart + "ti".length),
    context: { triggerKind: 1 },
  })
  assert.equal(unfinishedResponse.error, undefined, JSON.stringify(unfinishedResponse.error))
  const unfinishedItems = Array.isArray(unfinishedResponse.result)
    ? unfinishedResponse.result
    : unfinishedResponse.result?.items ?? []
  const unfinishedTitle = unfinishedItems.filter((item) => item.label === "title")
  assert.equal(
    unfinishedTitle.length,
    1,
    `Expected unfinished title in ${JSON.stringify(unfinishedItems)}`,
  )
  assert.equal(unfinishedTitle[0].kind, CompletionItemKind.Property)
})

test("maps enum and module completion families to their LSP kinds", async (t) => {
  const materialized = await materializeConformanceWorkspace()
  const documentPath = path.join(
    materialized.workspaceRoot,
    "entry",
    "src",
    "main",
    "ets",
    "pages",
    "CompletionKinds.ets",
  )
  const ambientModulePath = path.join(path.dirname(documentPath), "AmbientModules.d.ts")
  const documentUri = pathToFileURL(documentPath).href
  const source = [
    "enum RenderingMode { Compact, Expanded }",
    "namespace LayoutTools { export const width = 1 }",
    "const selected = RenderingMo",
    "const member = RenderingMode.Com",
    "const tools = LayoutTo",
    "import { value } from 'lay'",
    "",
  ].join("\n")
  await fs.promises.writeFile(
    ambientModulePath,
    "declare module 'layout-tools' { export const value: number }\n",
    "utf8",
  )
  await fs.promises.writeFile(documentPath, source, "utf8")
  const prefixStart = source.indexOf("RenderingMo", source.indexOf("const selected"))
  const memberPrefixStart = source.lastIndexOf("Com")
  const modulePrefixStart = source.lastIndexOf("LayoutTo")
  const externalModulePrefixStart = source.lastIndexOf("lay")
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  await session.initialize()
  session.openDocument({
    uri: documentUri,
    languageId: "arkts",
    version: 1,
    text: source,
  })
  const response = await session.request("textDocument/completion", {
    textDocument: { uri: documentUri },
    position: positionAt(source, prefixStart + "RenderingMo".length),
  })

  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  const renderingMode = items.filter((item) => item.label === "RenderingMode")
  assert.equal(renderingMode.length, 1, `Expected RenderingMode in ${JSON.stringify(items)}`)
  assert.equal(renderingMode[0].kind, CompletionItemKind.Enum)

  const memberResponse = await session.request("textDocument/completion", {
    textDocument: { uri: documentUri },
    position: positionAt(source, memberPrefixStart + "Com".length),
  })
  assert.equal(memberResponse.error, undefined, JSON.stringify(memberResponse.error))
  const memberItems = Array.isArray(memberResponse.result)
    ? memberResponse.result
    : memberResponse.result?.items ?? []
  const compact = memberItems.filter((item) => item.label === "Compact")
  assert.equal(compact.length, 1, `Expected Compact in ${JSON.stringify(memberItems)}`)
  assert.equal(compact[0].kind, CompletionItemKind.EnumMember)

  const moduleResponse = await session.request("textDocument/completion", {
    textDocument: { uri: documentUri },
    position: positionAt(source, modulePrefixStart + "LayoutTo".length),
  })
  assert.equal(moduleResponse.error, undefined, JSON.stringify(moduleResponse.error))
  const moduleItems = Array.isArray(moduleResponse.result)
    ? moduleResponse.result
    : moduleResponse.result?.items ?? []
  const layoutTools = moduleItems.filter((item) => item.label === "LayoutTools")
  assert.equal(layoutTools.length, 1, `Expected LayoutTools in ${JSON.stringify(moduleItems)}`)
  assert.equal(layoutTools[0].kind, CompletionItemKind.Module)

  const externalModuleResponse = await session.request("textDocument/completion", {
    textDocument: { uri: documentUri },
    position: positionAt(source, externalModulePrefixStart + "lay".length),
  })
  assert.equal(
    externalModuleResponse.error,
    undefined,
    JSON.stringify(externalModuleResponse.error),
  )
  const externalModuleItems = Array.isArray(externalModuleResponse.result)
    ? externalModuleResponse.result
    : externalModuleResponse.result?.items ?? []
  const layoutModule = externalModuleItems.filter((item) => item.label === "layout-tools")
  assert.equal(
    layoutModule.length,
    1,
    `Expected layout-tools in ${JSON.stringify(externalModuleItems)}`,
  )
  assert.equal(layoutModule[0].kind, CompletionItemKind.Module)
})

test("publishes method snippets only to snippet-capable clients", async (t) => {
  const materialized = await materializeConformanceWorkspace()
  const documentPath = path.join(
    materialized.workspaceRoot,
    "entry",
    "src",
    "main",
    "ets",
    "pages",
    "SnippetCompletion.ets",
  )
  const documentUri = pathToFileURL(documentPath).href
  const source = [
    "interface Shape { area(value: number): string }",
    "class Circle implements Shape {",
    "  ar",
    "}",
  ].join("\n")
  await fs.promises.writeFile(documentPath, source, "utf8")
  const cursorOffset = source.lastIndexOf("ar") + 2
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
    capabilities: {
      general: { positionEncodings: ["utf-16"] },
      textDocument: { completion: { completionItem: { snippetSupport: true } } },
    },
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  await session.initialize()
  session.openDocument({ uri: documentUri, languageId: "arkts", version: 1, text: source })
  const response = await session.request("textDocument/completion", {
    textDocument: { uri: documentUri },
    position: positionAt(source, cursorOffset),
  })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  const area = items.find((item) => item.label === "area")
  assert.ok(area, `Expected area in ${JSON.stringify(items)}`)
  assert.equal(area.insertTextFormat, 2)
  assert.match(area.insertText, /\$0/)
  const resolved = await session.request("completionItem/resolve", area)
  assert.equal(resolved.error, undefined, JSON.stringify(resolved.error))
  assert.equal(resolved.result.insertTextFormat, 2)
  assert.match(resolved.result.insertText, /\$0/)
})

test("replaces the complete identifier when completion is accepted mid-token", async (t) => {
  const materialized = await materializeConformanceWorkspace()
  const documentPath = path.join(
    materialized.workspaceRoot,
    "entry",
    "src",
    "main",
    "ets",
    "pages",
    "MidTokenCompletion.ets",
  )
  const documentUri = pathToFileURL(documentPath).href
  const source = [
    "class MidTokenCompletion {",
    "  method(): void {}",
    "",
    "  use(): void {",
    "    const face = '😀'; this.method",
    "  }",
    "}",
    "",
  ].join("\n")
  await fs.promises.writeFile(documentPath, source, "utf8")
  const identifierStart = source.lastIndexOf("method")
  const identifierEnd = identifierStart + "method".length
  const cursorOffset = identifierStart + "meth".length
  const replacementRange = {
    start: positionAt(source, identifierStart),
    end: positionAt(source, identifierEnd),
  }
  const insertRange = {
    start: replacementRange.start,
    end: positionAt(source, cursorOffset),
  }
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
    capabilities: {
      general: { positionEncodings: ["utf-16"] },
      textDocument: {
        completion: {
          completionItem: {
            commitCharactersSupport: true,
            insertReplaceSupport: true,
          },
        },
      },
    },
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  await session.initialize()
  session.openDocument({
    uri: documentUri,
    languageId: "arkts",
    version: 1,
    text: source,
  })
  const response = await session.request("textDocument/completion", {
    textDocument: { uri: documentUri },
    position: positionAt(source, cursorOffset),
    context: { triggerKind: 1 },
  })

  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  const methods = items.filter((item) => item.label === "method")
  assert.equal(methods.length, 1, `Expected method in ${JSON.stringify(items)}`)
  assert.equal(methods[0].kind, CompletionItemKind.Method)
  assert.deepEqual(methods[0].commitCharacters, [".", ",", ";"])
  assert.deepEqual(methods[0].textEdit, {
    insert: insertRange,
    replace: replacementRange,
    newText: "method",
  })
  assert.equal(applyTextEdits(source, [methods[0].textEdit]), source)

  const resolved = await session.request("completionItem/resolve", methods[0])
  assert.equal(resolved.error, undefined, JSON.stringify(resolved.error))
  assert.deepEqual(resolved.result.commitCharacters, methods[0].commitCharacters)
  assert.deepEqual(resolved.result.textEdit, methods[0].textEdit)
})

test("completes an unopened class from a two-character prefix", async (t) => {
  const materialized = await materializeConformanceWorkspace()
  const completion = materialized.cases["completion.unicode"]
  const home = fs.readFileSync(fileURLToPath(completion.uri), "utf8")
  const shortRange = {
    start: completion.range.start,
    end: {
      line: completion.range.start.line,
      character: completion.range.start.character + 2,
    },
  }
  const homeWithShortPrefix = applyTextEdits(home, [{
    range: completion.range,
    newText: "Gr",
  }])
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  assert.equal(textInRange(homeWithShortPrefix, shortRange), "Gr")
  await session.initialize()
  session.openDocument({
    uri: completion.uri,
    languageId: "arkts",
    version: 1,
    text: homeWithShortPrefix,
  })
  const response = await session.request("textDocument/completion", {
    textDocument: { uri: completion.uri },
    position: shortRange.end,
  })

  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  const greeters = items.filter((item) => item.label === "Greeter")
  assert.equal(greeters.length, 1, `Expected one Greeter in ${JSON.stringify(items)}`)
  assert.equal(greeters[0].kind, CompletionItemKind.Class)
  assert.deepEqual(greeters[0].textEdit, {
    range: shortRange,
    newText: "Greeter",
  })
})

test("resolves and applies an unopened class auto-import through the production server", async (t) => {
  const materialized = await materializeConformanceWorkspace()
  const completion = materialized.cases["completion.unicode"]
  const definition = materialized.cases["greeter.definition"]
  const home = fs.readFileSync(fileURLToPath(completion.uri), "utf8")
  const greeterSource = fs.readFileSync(fileURLToPath(definition.uri), "utf8")
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  assert.equal(textInRange(home, completion.range), "Gree")
  const initialized = await session.initialize()
  assert.equal(initialized.result.capabilities.completionProvider.resolveProvider, true)
  session.openDocument({
    uri: completion.uri,
    languageId: "arkts",
    version: 1,
    text: home,
  })
  const response = await session.request("textDocument/completion", {
    textDocument: { uri: completion.uri },
    position: completion.position,
  })

  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  const greeters = items.filter((item) => item.label === "Greeter")
  assert.equal(greeters.length, 1, `Expected one Greeter in ${JSON.stringify(items)}`)
  const [greeter] = greeters
  assert.equal(greeter.kind, CompletionItemKind.Class)
  assert.deepEqual(greeter.textEdit, {
    range: completion.range,
    newText: "Greeter",
  })
  assert.deepEqual(Object.keys(greeter.data ?? {}), ["arktsCompletionId"])
  assert.match(greeter.data.arktsCompletionId, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/)

  const resolvedResponse = await session.request("completionItem/resolve", greeter)
  assert.equal(resolvedResponse.error, undefined, JSON.stringify(resolvedResponse.error))
  const resolved = resolvedResponse.result
  assert.deepEqual(resolved.data, greeter.data)
  assert.match(resolved.detail, /class Greeter/)
  assert.equal(
    resolved.documentation,
    "Builds a deterministic greeting for the supplied name.",
  )
  assert.deepEqual(resolved.textEdit, greeter.textEdit)
  assert.equal(resolved.additionalTextEdits.length, 1)
  assert.deepEqual(resolved.additionalTextEdits[0].range, {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 },
  })
  assert.equal(
    resolved.additionalTextEdits[0].newText,
    'import { Greeter } from "../services/Greeter.ets";\n\n',
  )

  const updatedHome = applyTextEdits(home, [
    resolved.textEdit,
    ...resolved.additionalTextEdits,
  ])
  assert.match(updatedHome, /^import \{ Greeter \} from "\.\.\/services\/Greeter\.ets";\n\n/)
  assert.match(updatedHome, /const face = '😀'; const value = Greeter/)

  const diagnosticsV2 = session.transport.notification(
    "textDocument/publishDiagnostics",
    (message) => message.params.uri === completion.uri && message.params.version === 2,
    5_000,
  )
  session.changeDocument({
    uri: completion.uri,
    version: 2,
    text: updatedHome,
  })
  const diagnostics = await diagnosticsV2
  assert.deepEqual(diagnostics.params.diagnostics, [])

  const usageOffset = updatedHome.lastIndexOf("Greeter")
  assert.notEqual(usageOffset, -1)
  const definitionResponse = await session.request("textDocument/definition", {
    textDocument: { uri: completion.uri },
    position: positionAt(updatedHome, usageOffset + 1),
  })
  assert.equal(definitionResponse.error, undefined, JSON.stringify(definitionResponse.error))
  const locations = Array.isArray(definitionResponse.result)
    ? definitionResponse.result
    : [definitionResponse.result]
  assert.equal(locations.length, 1)
  assert.deepEqual(locations[0], { uri: definition.uri, range: definition.range })
  assert.equal(textInRange(greeterSource, locations[0].range), "Greeter")
})

test("completes inherited fields and methods after this dot", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "inherited-this")
  const documentPath = path.join(fixtureRoot, "Derived.ets")
  const documentUri = pathToFileURL(documentPath).href

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: documentUri,
        languageId: "arkts",
        version: 1,
        text: fs.readFileSync(documentPath, "utf8"),
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/completion",
    params: {
      textDocument: { uri: documentUri },
      position: { line: 4, character: 9 },
    },
  })

  const response = await server.response(2)
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  const labels = items.map((item) => item.label)
  assert.ok(labels.includes("inheritedTitle"), `Expected inheritedTitle in ${JSON.stringify(labels)}`)
  assert.ok(labels.includes("inheritedRefresh"), `Expected inheritedRefresh in ${JSON.stringify(labels)}`)
})

test("completes imported receiver fields and methods with exact kinds and UTF-16 range", async (t) => {
  const materialized = await materializeConformanceWorkspace()
  const sourceDirectory = path.join(
    materialized.workspaceRoot,
    "entry",
    "src",
    "main",
    "ets",
    "pages",
  )
  const receiverPath = path.join(sourceDirectory, "ImportedReceiver.ets")
  const consumerPath = path.join(sourceDirectory, "ImportedReceiverConsumer.ets")
  const receiverSource = [
    "export class ImportedReceiver {",
    "  memberField: number = 1",
    "  memberMethod(): string { return 'ready' }",
    "}",
    "",
  ].join("\n")
  const prefix = "m"
  const consumerSource = [
    'import { ImportedReceiver } from "./ImportedReceiver.ets"',
    "const receiver = new ImportedReceiver()",
    `const face = '😀'; const selected = receiver.${prefix}`,
    "",
  ].join("\n")
  await fs.promises.writeFile(receiverPath, receiverSource, "utf8")
  await fs.promises.writeFile(consumerPath, consumerSource, "utf8")
  const consumerUri = pathToFileURL(consumerPath).href
  const prefixEnd = consumerSource.lastIndexOf(prefix) + prefix.length
  const replacementRange = {
    start: positionAt(consumerSource, prefixEnd - prefix.length),
    end: positionAt(consumerSource, prefixEnd),
  }
  const linePrefix = consumerSource.split("\n")[replacementRange.start.line]
    .slice(0, replacementRange.start.character)
  assert.equal(
    linePrefix.length - Array.from(linePrefix).length,
    1,
    "the receiver completion must be positioned in UTF-16 after an emoji",
  )
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  await session.initialize()
  session.openDocument({
    uri: consumerUri,
    languageId: "arkts",
    version: 1,
    text: consumerSource,
  })
  const response = await session.request("textDocument/completion", {
    textDocument: { uri: consumerUri },
    position: replacementRange.end,
  })

  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  const field = items.filter((item) => item.label === "memberField")
  const method = items.filter((item) => item.label === "memberMethod")
  assert.equal(field.length, 1, `Expected memberField in ${JSON.stringify(items)}`)
  assert.equal(method.length, 1, `Expected memberMethod in ${JSON.stringify(items)}`)
  assert.equal(field[0].kind, CompletionItemKind.Field)
  assert.equal(method[0].kind, CompletionItemKind.Method)
  assert.equal(Object.hasOwn(method[0], "commitCharacters"), false)
  assert.deepEqual(field[0].textEdit, { range: replacementRange, newText: "memberField" })
  assert.deepEqual(method[0].textEdit, { range: replacementRange, newText: "memberMethod" })
  const resolvedMethod = await session.request("completionItem/resolve", method[0])
  assert.equal(resolvedMethod.error, undefined, JSON.stringify(resolvedMethod.error))
  assert.equal(Object.hasOwn(resolvedMethod.result, "commitCharacters"), false)
})

test("keeps a camel-subsequence member beyond the raw provider quota", async (t) => {
  const materialized = await materializeConformanceWorkspace()
  const documentPath = path.join(
    materialized.workspaceRoot,
    "entry",
    "src",
    "main",
    "ets",
    "pages",
    "FuzzyMemberCompletion.ets",
  )
  const documentUri = pathToFileURL(documentPath).href
  const source = [
    "class FuzzyReceiver {",
    ...Array.from(
      { length: 129 },
      (_, index) => `  alpha${String(index).padStart(3, "0")}(): void {}`,
    ),
    ...Array.from(
      { length: 129 },
      (_, index) => `  alphaMethod${String(index).padStart(3, "0")}(): void {}`,
    ),
    "  memberTarget(): void {}",
    "  zebraZoneQuery(): void {}",
    "}",
    "",
    "function use(receiver: FuzzyReceiver): void {",
    "  const marker = '😀'; receiver.zzq",
    "  receiver.me",
    "}",
    "",
  ].join("\n")
  await fs.promises.writeFile(documentPath, source, "utf8")
  const prefixStart = source.lastIndexOf("zzq")
  const replacementRange = {
    start: positionAt(source, prefixStart),
    end: positionAt(source, prefixStart + "zzq".length),
  }
  const strongPrefixStart = source.lastIndexOf("receiver.me") + "receiver.".length
  const strongReplacementRange = {
    start: positionAt(source, strongPrefixStart),
    end: positionAt(source, strongPrefixStart + "me".length),
  }
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  await session.initialize()
  session.openDocument({
    uri: documentUri,
    languageId: "arkts",
    version: 1,
    text: source,
  })
  const response = await session.request("textDocument/completion", {
    textDocument: { uri: documentUri },
    position: replacementRange.end,
  })

  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(Array.isArray(response.result), false)
  assert.equal(response.result?.isIncomplete, false)
  const items = response.result?.items ?? []
  assert.deepEqual(items.map(({ label }) => label), ["zebraZoneQuery"])
  assert.equal(items[0].kind, CompletionItemKind.Method)
  assert.equal(typeof items[0].sortText, "string")
  assert.deepEqual(items[0].textEdit, {
    range: replacementRange,
    newText: "zebraZoneQuery",
  })
  const completed = applyTextEdits(source, [items[0].textEdit])
  assert.match(completed, /receiver\.zebraZoneQuery\n/)

  const strongResponse = await session.request("textDocument/completion", {
    textDocument: { uri: documentUri },
    position: strongReplacementRange.end,
  })
  assert.equal(strongResponse.error, undefined, JSON.stringify(strongResponse.error))
  assert.equal(strongResponse.result?.isIncomplete, true)
  const strongItems = strongResponse.result?.items ?? []
  assert.equal(strongItems.length, 128)
  assert.deepEqual(
    strongItems.slice(0, 127).map(({ label }) => label),
    Array.from(
      { length: 127 },
      (_, index) => `alphaMethod${String(index).padStart(3, "0")}`,
    ),
  )
  assert.equal(strongItems.at(-1).label, "memberTarget")
  assert.deepEqual(strongItems.at(-1).textEdit, {
    range: strongReplacementRange,
    newText: "memberTarget",
  })
})

test("reports an incomplete ordered completion list when TypeScript has more than 128 members", async (t) => {
  const materialized = await materializeConformanceWorkspace()
  const sourceDirectory = path.join(
    materialized.workspaceRoot,
    "entry",
    "src",
    "main",
    "ets",
    "pages",
  )
  const documentPath = path.join(sourceDirectory, "ManyMemberCompletions.ets")
  const expectedLabels = Array.from(
    { length: 128 },
    (_, index) => `member${String(index).padStart(3, "0")}`,
  )
  const source = [
    "class ManyMemberCompletions {",
    ...Array.from(
      { length: 129 },
      (_, index) => `  member${String(index).padStart(3, "0")}(): void {}`,
    ),
    "",
    "  complete(): void {",
    "    this.mem",
    "  }",
    "}",
    "",
  ].join("\n")
  await fs.promises.writeFile(documentPath, source, "utf8")
  const documentUri = pathToFileURL(documentPath).href
  const completionOffset = source.lastIndexOf("this.mem") + "this.mem".length
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  await session.initialize()
  session.openDocument({
    uri: documentUri,
    languageId: "arkts",
    version: 1,
    text: source,
  })
  const response = await session.request("textDocument/completion", {
    textDocument: { uri: documentUri },
    position: positionAt(source, completionOffset),
  })

  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(Array.isArray(response.result), false)
  assert.equal(response.result.items.length, 128)
  assert.deepEqual(
    response.result.items.map(({ label }) => label),
    expectedLabels,
    "the bounded LSP response must preserve TypeScript provider order",
  )
  assert.equal(response.result.isIncomplete, true)
})

test("ranks local completion first and distinguishes stable same-name auto-import sources", async (t) => {
  const materialized = await materializeConformanceWorkspace()
  const sourceDirectory = path.join(
    materialized.workspaceRoot,
    "entry",
    "src",
    "main",
    "ets",
    "pages",
  )
  await Promise.all([
    fs.promises.writeFile(
      path.join(sourceDirectory, "RankedAlpha.ets"),
      "export class RankedChoice { readonly origin: string = 'alpha' }\n",
      "utf8",
    ),
    fs.promises.writeFile(
      path.join(sourceDirectory, "RankedBeta.ets"),
      "export class RankedChoice { readonly origin: string = 'beta' }\n",
      "utf8",
    ),
  ])
  const consumerPath = path.join(sourceDirectory, "RankedConsumer.ets")
  const prefix = "Rank"
  const source = [
    "const RankLocal = 1",
    `const selected = ${prefix}`,
    "",
  ].join("\n")
  await fs.promises.writeFile(consumerPath, source, "utf8")
  const uri = pathToFileURL(consumerPath).href
  const prefixEnd = source.lastIndexOf(prefix) + prefix.length
  const position = positionAt(source, prefixEnd)
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  await session.initialize()
  session.openDocument({ uri, languageId: "arkts", version: 1, text: source })
  const complete = async () => {
    const response = await session.request("textDocument/completion", {
      textDocument: { uri },
      position,
    })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
    return items.filter((item) => item.label.startsWith(prefix))
  }
  const first = await complete()
  const second = await complete()
  const localIndex = first.findIndex((item) => item.label === "RankLocal")
  const choices = first.filter((item) => item.label === "RankedChoice")

  assert.notEqual(localIndex, -1, JSON.stringify(first))
  assert.equal(choices.length, 2, JSON.stringify(first))
  assert.ok(localIndex < first.indexOf(choices[0]), "local completion must rank before auto-imports")
  assert.deepEqual(
    choices.map((item) => item.detail).sort(),
    ["./RankedAlpha", "./RankedBeta"],
    "same-name auto-imports must identify their distinct module sources",
  )
  assert.deepEqual(
    first.map(withoutOpaqueCompletionData),
    second.map(withoutOpaqueCompletionData),
    "repeated completion requests must preserve stable order and sort metadata",
  )
})

test("maps a definition in a rewritten ArkTS struct back to source coordinates", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "struct-source-map")
  const documentPath = path.join(fixtureRoot, "Panel.ets")
  const documentUri = pathToFileURL(documentPath).href

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: documentUri,
        languageId: "arkts",
        version: 1,
        text: fs.readFileSync(documentPath, "utf8"),
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 3,
    method: "textDocument/definition",
    params: {
      textDocument: { uri: documentUri },
      position: { line: 6, character: 11 },
    },
  })

  const response = await server.response(3)
  const locations = Array.isArray(response.result) ? response.result : [response.result]
  assert.equal(locations.length, 1)
  assert.equal(locations[0].uri, documentUri)
  assert.deepEqual(locations[0].range.start, { line: 3, character: 2 })
})

test("resolves a definition through an import alias and barrel export", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "alias-barrel")
  const documentPath = path.join(fixtureRoot, "Main.ets")
  const targetPath = path.join(fixtureRoot, "models", "Profile.ets")
  const targetSource = fs.readFileSync(targetPath, "utf8")
  const targetName = "displayName"
  const targetNameOffset = targetSource.indexOf(targetName)
  assert.notEqual(targetNameOffset, -1)
  const targetRange = {
    start: positionAt(targetSource, targetNameOffset),
    end: positionAt(targetSource, targetNameOffset + targetName.length),
  }
  const documentUri = pathToFileURL(documentPath).href

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: documentUri,
        languageId: "arkts",
        version: 1,
        text: fs.readFileSync(documentPath, "utf8"),
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 4,
    method: "textDocument/definition",
    params: {
      textDocument: { uri: documentUri },
      position: { line: 3, character: 10 },
    },
  })

  const response = await server.response(4)
  const locations = Array.isArray(response.result) ? response.result : [response.result]
  assert.equal(locations.length, 1)
  assert.equal(locations[0].uri, pathToFileURL(targetPath).href)
  assert.deepEqual(locations[0].range, targetRange)
  assert.notDeepEqual(locations[0].range.start, locations[0].range.end)
  assert.equal(textInRange(targetSource, locations[0].range), targetName)
})

test("resolves an exact unopened definition across Harmony modules", async (t) => {
  const materialized = await materializeConformanceWorkspace()
  const reference = materialized.cases["cross-module.reference"]
  const target = materialized.cases["cross-module.definition"]
  const consumer = fs.readFileSync(fileURLToPath(reference.uri), "utf8")
  const targetSource = fs.readFileSync(fileURLToPath(target.uri), "utf8")
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  assert.equal(textInRange(consumer, reference.range), "SharedProfile")
  assert.equal(textInRange(targetSource, target.range), "SharedProfile")
  for (const [source, range] of [
    [consumer, reference.range],
    [targetSource, target.range],
  ]) {
    const line = source.split("\n")[range.start.line]
    const prefix = line.slice(0, range.start.character)
    assert.match(prefix, /😀/)
    assert.equal(
      prefix.length - Array.from(prefix).length,
      1,
      "the cross-module marker prefix must use JavaScript UTF-16 code units",
    )
  }
  await session.initialize()
  session.openDocument({
    uri: reference.uri,
    languageId: "arkts",
    version: 1,
    text: consumer,
  })
  const response = await session.request("textDocument/definition", {
    textDocument: { uri: reference.uri },
    position: midpoint(reference.range),
  })

  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const locations = response.result === null
    ? []
    : Array.isArray(response.result)
      ? response.result
      : [response.result]
  assert.deepEqual(locations, [{ uri: target.uri, range: target.range }])
  assert.notDeepEqual(locations[0].range.start, locations[0].range.end)
})

function midpoint(range) {
  assert.equal(range.start.line, range.end.line, "the query marker must be single-line")
  return {
    line: range.start.line,
    character: range.start.character
      + Math.floor((range.end.character - range.start.character) / 2),
  }
}

function positionAt(source, offset) {
  const before = source.slice(0, offset)
  const line = before.split("\n").length - 1
  const lineStart = before.lastIndexOf("\n") + 1
  return { line, character: offset - lineStart }
}

function textInRange(source, range) {
  const lines = source.split("\n")
  assert.equal(range.start.line, range.end.line, "this semantic slice uses single-line ranges")
  return lines[range.start.line].slice(range.start.character, range.end.character)
}

function withoutOpaqueCompletionData(item) {
  const { data: _data, ...stable } = item
  return stable
}
