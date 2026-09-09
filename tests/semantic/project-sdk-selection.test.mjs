import assert from "node:assert/strict"
import { once } from "node:events"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { LspProcess, projectRoot, withTimeout } from "../support/lsp-process.mjs"

const EXCESS_PROPERTY_DIAGNOSTIC = 2322

test("Zed initialization SDK configuration overrides local.properties", async (t) => {
  const fixture = await sdkSession(t, { initializationSdk: "sdkB" })
  const response = await fixture.session.request(
    "textDocument/definition",
    fixture.query("ProjectApi"),
  )
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [{
    uri: pathToFileURL(fixture.sdkB.module).href,
    range: rangeOf(fixture.sdkB.moduleText, "ProjectApi"),
  }])
})

test("Zed runtime SDK configuration rebuilds semantics without losing the open overlay", async (t) => {
  const fixture = await sdkSession(t)
  const overlayText = `// unsaved overlay\n${fixture.text}const picked = api.se\n`
  fixture.session.changeDocument({ uri: fixture.uri, version: 2, text: overlayText })
  const refreshedDiagnostics = fixture.session.transport.notification(
    "textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri
      && message.params.version === 2
      && message.params.diagnostics.some((diagnostic) => diagnostic.code === EXCESS_PROPERTY_DIAGNOSTIC),
  )
  fixture.session.transport.send({
    jsonrpc: "2.0",
    method: "workspace/didChangeConfiguration",
    params: { settings: { arkts: { sdk: { path: fixture.sdkB.root } } } },
  })

  const response = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.uri },
    position: positionAt(overlayText, overlayText.lastIndexOf("ProjectApi") + 1),
  })
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [{
    uri: pathToFileURL(fixture.sdkB.module).href,
    range: rangeOf(fixture.sdkB.moduleText, "ProjectApi"),
  }])
  const completion = await fixture.session.request("textDocument/completion", {
    textDocument: { uri: fixture.uri },
    position: positionAt(overlayText, overlayText.lastIndexOf("api.se") + "api.se".length),
  })
  const items = Array.isArray(completion.result) ? completion.result : completion.result?.items ?? []
  assert.ok(items.some((item) => item.label === "secondOnly"))
  assert.ok(!items.some((item) => item.label === "projectOnly"))
  assert.ok((await refreshedDiagnostics).params.diagnostics.some((diagnostic) => (
    diagnostic.code === EXCESS_PROPERTY_DIAGNOSTIC
  )))
})

test("an invalid explicit Zed SDK fails closed with a stable configuration diagnostic", async (t) => {
  const fixture = await sdkSession(t, { initializationSdkPath: "relative/missing-sdk" })
  const diagnostics = await fixture.session.transport.notification(
    "textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1,
  )
  assert.ok(diagnostics.params.diagnostics.some((diagnostic) => (
    diagnostic.code === "arkts.sdk.configuration"
  )))
  const response = await fixture.session.request(
    "textDocument/definition",
    fixture.query("ProjectApi"),
  )
  assert.ok(!response.result?.some((definition) => (
    definition.uri.startsWith(pathToFileURL(fixture.sdkA.root).href)
    || definition.uri.startsWith(pathToFileURL(fixture.fallback.root).href)
  )))
})

test("clearing Zed SDK configuration restores local.properties selection", async (t) => {
  const fixture = await sdkSession(t, { initializationSdk: "sdkB" })
  const overridden = await fixture.session.request(
    "textDocument/definition",
    fixture.query("ProjectApi"),
  )
  assert.deepEqual(overridden.result, [{
    uri: pathToFileURL(fixture.sdkB.module).href,
    range: rangeOf(fixture.sdkB.moduleText, "ProjectApi"),
  }])

  fixture.session.transport.send({
    jsonrpc: "2.0",
    method: "workspace/didChangeConfiguration",
    params: { settings: { arkts: { sdk: {} } } },
  })
  const restored = await fixture.session.request(
    "textDocument/definition",
    fixture.query("ProjectApi"),
  )
  assert.deepEqual(restored.result, [{
    uri: pathToFileURL(fixture.sdkA.module).href,
    range: rangeOf(fixture.sdkA.moduleText, "ProjectApi"),
  }])
})

test("project sdk.dir overrides the process fallback for SDK module definitions", async (t) => {
  const fixture = await sdkSession(t)
  const response = await fixture.session.request("textDocument/definition", fixture.query("ProjectApi"))
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [{ uri: pathToFileURL(fixture.sdkA.module).href,
    range: rangeOf(fixture.sdkA.moduleText, "ProjectApi") }])
})

test("an ArkTS project prefers its ETS API declaration over a JS SDK twin", async (t) => {
  const fixture = await sdkSession(t, { beforeStart: async ({ sdkA }) => {
    const jsTwin = path.join(sdkA.root, "js", "api", "@ohos.projectApi.d.ts")
    await fs.mkdir(path.dirname(jsTwin), { recursive: true })
    await fs.writeFile(jsTwin, "export declare class ProjectApi { jsOnly: number }\n")
  } })
  const response = await fixture.session.request("textDocument/definition", fixture.query("ProjectApi"))
  assert.deepEqual(response.result, [{
    uri: pathToFileURL(fixture.sdkA.module).href,
    range: rangeOf(fixture.sdkA.moduleText, "ProjectApi"),
  }])
  const diagnostics = await fixture.session.transport.notification(
    "textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1,
  )
  assert.deepEqual(diagnostics.params.diagnostics, [])
})

test("SDK selection logs its API identity and unverified dialect boundary through the production logger", async (t) => {
  const fixture = await sdkSession(t, { beforeStart: async ({ sdkA }) => {
    await fs.writeFile(path.join(sdkA.root, "ets", "oh-uni-package.json"), JSON.stringify({
      path: "ets", apiVersion: "24", version: "6.1.1.125",
    }))
  } })
  await fixture.session.request("textDocument/definition", fixture.query("ProjectApi"))
  const logs = (await fs.readFile(path.join(fixture.root, "logs-0", "server.log"), "utf8"))
    .trim().split("\n").map((line) => JSON.parse(line))
  const selected = logs.filter((entry) => entry.event === "sdk.selected")
  assert.equal(selected.length, 1)
  assert.equal(selected[0].source, "project")
  assert.equal(selected[0].sdkPath, fixture.sdkA.root)
  assert.equal(selected[0].metadataStatus, "identified")
  assert.equal(selected[0].apiVersion, "24")
  assert.equal(selected[0].componentVersion, "6.1.1.125")
  assert.equal(selected[0].dialectCompatibility, "unverified")
  assert.equal(selected[0].declarationSupport, "typescript-compatible-only")
})

test("the project SDK supplies ambient declarations as well as imported modules", async (t) => {
  const fixture = await sdkSession(t)
  const response = await fixture.session.request("textDocument/definition", fixture.query("ProjectAmbient"))
  assert.deepEqual(response.result, [{ uri: pathToFileURL(fixture.sdkA.ambient).href,
    range: rangeOf(fixture.sdkA.ambientText, "ProjectAmbient") }])
  const diagnostics = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1)
  assert.deepEqual(diagnostics.params.diagnostics, [])
})

test("the SDK aggregate entry exposes declarations split across component files", async (t) => {
  const fixture = await sdkSession(t, { beforeStart: async ({ sdkA }) => {
    const componentDirectory = path.dirname(sdkA.ambient)
    const splitDeclaration = path.join(componentDirectory, "project-component.d.ts")
    await fs.writeFile(sdkA.ambient, "interface CommonOnly { value: number }\n")
    await fs.writeFile(splitDeclaration, sdkA.ambientText)
    await fs.writeFile(
      path.join(componentDirectory, "index-full.d.ts"),
      '/// <reference path="./common.d.ts" />\n'
        + '/// <reference path="./project-component.d.ts" />\n',
    )
    sdkA.ambient = splitDeclaration
  } })
  const response = await fixture.session.request(
    "textDocument/definition",
    fixture.query("ProjectAmbient"),
  )
  assert.deepEqual(response.result, [{
    uri: pathToFileURL(fixture.sdkA.ambient).href,
    range: rangeOf(fixture.sdkA.ambientText, "ProjectAmbient"),
  }])
  const diagnostics = await fixture.session.transport.notification(
    "textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1,
  )
  assert.deepEqual(diagnostics.params.diagnostics, [])
})

test("SDK ambient globals do not crowd out an unopened workspace auto-import", async (t) => {
  const source = "const candidate = Sta\n"
  const fixture = await sdkSession(t, { source, beforeStart: async ({ workspaceRoot, sdkA }) => {
    await fs.writeFile(
      path.join(workspaceRoot, "entry", "src", "main", "ets", "Stale.ets"),
      "export class StaleType {}\n",
    )
    await fs.writeFile(
      path.join(sdkA.root, "ets", "component", "index-full.d.ts"),
      '/// <reference path="./common.d.ts" />\n'
        + Array.from({ length: 160 }, (_, index) => (
          `declare const SdkThingAlpha${String(index).padStart(3, "0")}: number\n`
        )).join(""),
    )
  } })

  const prefixStart = source.lastIndexOf("Sta")
  const replacementRange = {
    start: positionAt(source, prefixStart),
    end: positionAt(source, prefixStart + "Sta".length),
  }
  const response = await fixture.session.request("textDocument/completion", {
    textDocument: { uri: fixture.uri },
    position: replacementRange.end,
  })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  const staleTypes = items.filter((item) => item.label === "StaleType")
  assert.equal(
    staleTypes.length,
    1,
    `Expected one workspace auto-import StaleType in ${JSON.stringify(
      items.map(({ label, detail }) => ({ label, detail })),
    )}`,
  )
  assert.equal(staleTypes[0].detail, "./Stale")
  assert.deepEqual(staleTypes[0].textEdit, { range: replacementRange, newText: "StaleType" })
  assert.equal(items[0]?.label, "StaleType", "the strongest match must lead server result order")
  const firstWeakMatch = items.find(({ label }) => label.startsWith("SdkThingAlpha"))
  assert.ok(firstWeakMatch, "the fixture must retain at least one weak SDK match")
  assert.ok(
    staleTypes[0].sortText.localeCompare(firstWeakMatch.sortText) < 0,
    "LSP client sorting must keep the exact workspace class above weak SDK matches",
  )
  assert.ok(items.length <= 128, `Expected a bounded completion list, received ${items.length}`)
  assert.equal(response.result?.isIncomplete, true)
})

test("a project SDK kit re-export resolves through its transitive @ohos declaration", async (t) => {
  const source = "import { ProjectApi } from '@kit.ProjectKit'\nconst api = new ProjectApi()\nconst value = api.projectOnly\n"
  const fixture = await sdkSession(t, { source, beforeStart: async ({ sdkA }) => {
    const kitDeclaration = path.join(sdkA.root, "ets", "kits", "@kit.ProjectKit.d.ts")
    await fs.mkdir(path.dirname(kitDeclaration), { recursive: true })
    await fs.writeFile(kitDeclaration, "export { ProjectApi } from '@ohos.projectApi'\n")
  } })
  const response = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.uri },
    position: positionAt(source, source.lastIndexOf("projectOnly") + 1),
  })
  assert.deepEqual(response.result, [{
    uri: pathToFileURL(fixture.sdkA.module).href,
    range: rangeOf(fixture.sdkA.moduleText, "projectOnly"),
  }])
  const diagnostics = await fixture.session.transport.notification(
    "textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1,
  )
  assert.deepEqual(diagnostics.params.diagnostics, [])
})

test("project SDK @system and @arkts namespaces resolve from their ETS roots", async (t) => {
  const source = [
    "import { ProjectSystem } from '@system.projectSystem'",
    "import ProjectArkts from '@arkts.projectArkts'",
    "const system = new ProjectSystem()",
    "const arkts = new ProjectArkts()",
    "const systemValue = system.systemOnly",
    "const arktsValue = arkts.arktsOnly",
    "",
  ].join("\n")
  let systemDeclaration
  let arktsDeclaration
  const systemText = "export declare class ProjectSystem { systemOnly: number }\n"
  const arktsText = "export default class ProjectArkts { arktsOnly: number }\n"
  const fixture = await sdkSession(t, { source, beforeStart: async ({ sdkA }) => {
    systemDeclaration = path.join(sdkA.root, "ets", "api", "@system.projectSystem.d.ts")
    arktsDeclaration = path.join(sdkA.root, "ets", "arkts", "@arkts.projectArkts.d.ets")
    await fs.mkdir(path.dirname(systemDeclaration), { recursive: true })
    await fs.mkdir(path.dirname(arktsDeclaration), { recursive: true })
    await fs.writeFile(systemDeclaration, systemText)
    await fs.writeFile(arktsDeclaration, arktsText)
  } })
  for (const [name, declaration, declarationText] of [
    ["systemOnly", systemDeclaration, systemText],
    ["arktsOnly", arktsDeclaration, arktsText],
  ]) {
    const response = await fixture.session.request("textDocument/definition", {
      textDocument: { uri: fixture.uri },
      position: positionAt(source, source.lastIndexOf(name) + 1),
    })
    assert.deepEqual(response.result, [{
      uri: pathToFileURL(declaration).href,
      range: rangeOf(declarationText, name),
    }])
  }
  const diagnostics = await fixture.session.transport.notification(
    "textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1,
  )
  assert.deepEqual(diagnostics.params.diagnostics, [])
})

test("a dotted relative SDK import resolves its declaration suffix", async (t) => {
  const source = "import { ProjectApi } from '@ohos.projectApi'\nconst api = new ProjectApi()\nconst value = api.projectOnly\n"
  let baseDeclaration
  const baseText = "export declare class ProjectBase { projectOnly: number }\n"
  const fixture = await sdkSession(t, { source, beforeStart: async ({ sdkA }) => {
    baseDeclaration = path.join(sdkA.root, "ets", "api", "@ohos.projectBase.d.ts")
    await fs.writeFile(baseDeclaration, baseText)
    await fs.writeFile(
      sdkA.module,
      "import { ProjectBase } from './@ohos.projectBase'\n"
        + "export declare class ProjectApi extends ProjectBase {}\n",
    )
  } })
  const response = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.uri },
    position: positionAt(source, source.lastIndexOf("projectOnly") + 1),
  })
  assert.deepEqual(response.result, [{
    uri: pathToFileURL(baseDeclaration).href,
    range: rangeOf(baseText, "projectOnly"),
  }])
  const diagnostics = await fixture.session.transport.notification(
    "textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1,
  )
  assert.deepEqual(diagnostics.params.diagnostics, [])
})

test("a selected SDK ancestor does not widen relative imports beyond the workspace", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-project-sdk-boundary-"))
  const sdkRoot = path.join(root, "sdk")
  const workspaceRoot = path.join(sdkRoot, "workspace")
  const documentPath = path.join(workspaceRoot, "Page.ets")
  const outsidePath = path.join(sdkRoot, "Secret.ets")
  const source = [
    "import { Secret } from '../Secret'",
    "const secret = new Secret()",
    "const value = secret.outsideOnly",
    "",
  ].join("\n")
  const outsideSource = "export class Secret { outsideOnly: number = 1 }\n"
  await fs.mkdir(path.join(sdkRoot, "ets"), { recursive: true })
  await fs.mkdir(path.join(sdkRoot, "toolchains"), { recursive: true })
  await fs.mkdir(workspaceRoot, { recursive: true })
  await fs.writeFile(path.join(workspaceRoot, "local.properties"), sdkProperty(sdkRoot))
  await fs.writeFile(documentPath, source)
  await fs.writeFile(outsidePath, outsideSource)
  const uri = pathToFileURL(documentPath).href
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    env: {
      ARKTS_LSP_LOG_DIR: path.join(root, "logs"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
    },
    rootUri: pathToFileURL(workspaceRoot).href,
  })
  t.after(async () => {
    try { await session.close() }
    finally { await fs.rm(root, { recursive: true, force: true }) }
  })
  await session.initialize()
  session.openDocument({ uri, version: 1, text: source })

  const response = await session.request("textDocument/definition", {
    textDocument: { uri },
    position: positionAt(source, source.lastIndexOf("outsideOnly") + 1),
  })

  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(
    response.result,
    [],
    "the selected SDK root must not become the source boundary for a workspace importer",
  )
})

test("a lexical workspace symlink cannot inherit its SDK target boundary", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-project-sdk-symlink-boundary-"))
  const sdkRoot = path.join(root, "sdk")
  const workspaceRoot = path.join(root, "workspace")
  const physicalDocumentPath = path.join(sdkRoot, "Api.ets")
  const documentPath = path.join(workspaceRoot, "Link.ets")
  const outsidePath = path.join(sdkRoot, "Secret.ets")
  const source = [
    "import { Secret } from '../sdk/Secret'",
    "const secret = new Secret()",
    "const value = secret.outsideOnly",
    "",
  ].join("\n")
  const outsideSource = "export class Secret { outsideOnly: number = 1 }\n"
  await fs.mkdir(path.join(sdkRoot, "ets"), { recursive: true })
  await fs.mkdir(path.join(sdkRoot, "toolchains"), { recursive: true })
  await fs.mkdir(workspaceRoot, { recursive: true })
  await fs.writeFile(path.join(workspaceRoot, "local.properties"), sdkProperty(sdkRoot))
  await fs.writeFile(physicalDocumentPath, source)
  await fs.writeFile(outsidePath, outsideSource)
  await fs.symlink(physicalDocumentPath, documentPath, "file")
  const uri = pathToFileURL(documentPath).href
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    env: {
      ARKTS_LSP_LOG_DIR: path.join(root, "logs"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
    },
    rootUri: pathToFileURL(workspaceRoot).href,
  })
  t.after(async () => {
    try { await session.close() }
    finally { await fs.rm(root, { recursive: true, force: true }) }
  })
  await session.initialize()
  session.openDocument({ uri, version: 1, text: source })

  const response = await session.request("textDocument/definition", {
    textDocument: { uri },
    position: positionAt(source, source.lastIndexOf("outsideOnly") + 1),
  })

  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(
    response.result,
    [],
    "lexical workspace ownership must not fall through to the selected SDK boundary",
  )
})

test("changing project sdk.dir refreshes module and ambient diagnostics to the same result as a fresh process", async (t) => {
  const fixture = await sdkSession(t)
  const initial = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1)
  assert.deepEqual(initial.params.diagnostics, [])
  await fixture.session.request("textDocument/definition", fixture.query("ProjectApi"))
  const refreshed = fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1
      && message.params.diagnostics.some((diagnostic) => diagnostic.code === EXCESS_PROPERTY_DIAGNOSTIC))
  await fs.writeFile(fixture.configPath, sdkProperty(fixture.sdkB.root))
  fixture.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
    changes: [{ uri: pathToFileURL(fixture.configPath).href, type: 2 }],
  } })
  const warmDiagnostics = (await refreshed).params.diagnostics
  const fresh = await fixture.startSession()
  const freshDiagnostics = await fresh.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1)
  assert.deepEqual(warmDiagnostics, freshDiagnostics.params.diagnostics)
  for (const [name, declaration, content] of [["ProjectApi", fixture.sdkB.module, fixture.sdkB.moduleText],
    ["ProjectAmbient", fixture.sdkB.ambient, fixture.sdkB.ambientText]]) {
    const warm = await fixture.session.request("textDocument/definition", fixture.query(name))
    const cold = await fresh.request("textDocument/definition", fixture.query(name))
    assert.deepEqual(warm.result, cold.result)
    assert.deepEqual(warm.result, [{ uri: pathToFileURL(declaration).href, range: rangeOf(content, name) }])
  }
})

test("an invalid explicit project SDK reports unresolved declarations instead of silently using fallback", async (t) => {
  const fixture = await sdkSession(t, { beforeStart: async ({ configPath }) => {
    await fs.writeFile(configPath, "sdk.dir=/missing-explicit-project-sdk\n")
  } })
  const diagnostics = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1)
  assert.ok(diagnostics.params.diagnostics.some((diagnostic) => diagnostic.code === 2307))
  assert.ok(diagnostics.params.diagnostics.some((diagnostic) => diagnostic.code === 2304))
  for (const name of ["ProjectApi", "ProjectAmbient"]) {
    const response = await fixture.session.request("textDocument/definition", fixture.query(name))
    assert.ok(!response.result?.some((definition) => definition.uri.startsWith(pathToFileURL(fixture.fallback.root).href)))
  }
})

test("removing local.properties restores process fallback for both module and ambient declarations", async (t) => {
  const fixture = await sdkSession(t)
  const initial = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1)
  assert.deepEqual(initial.params.diagnostics, [])
  const refreshed = fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.diagnostics.some((diagnostic) => diagnostic.code === EXCESS_PROPERTY_DIAGNOSTIC))
  await fs.rm(fixture.configPath)
  fixture.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
    changes: [{ uri: pathToFileURL(fixture.configPath).href, type: 3 }],
  } })
  await refreshed
  for (const [name, declaration, content] of [["ProjectApi", fixture.fallback.module, fixture.fallback.moduleText],
    ["ProjectAmbient", fixture.fallback.ambient, fixture.fallback.ambientText]]) {
    const response = await fixture.session.request("textDocument/definition", fixture.query(name))
    assert.deepEqual(response.result, [{ uri: pathToFileURL(declaration).href, range: rangeOf(content, name) }])
  }
})

test("a workspace-local symlink to shared SDK configuration refreshes through its lexical watched URI", async (t) => {
  let sharedConfiguration
  const fixture = await sdkSession(t, { beforeStart: async ({ root, configPath, sdkA }) => {
    sharedConfiguration = path.join(root, "shared.properties")
    await fs.writeFile(sharedConfiguration, sdkProperty(sdkA.root))
    await fs.rm(configPath)
    await fs.symlink(sharedConfiguration, configPath, "file")
  } })
  const initial = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1)
  assert.deepEqual(initial.params.diagnostics, [])
  const refreshed = fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.diagnostics.some((diagnostic) => diagnostic.code === EXCESS_PROPERTY_DIAGNOSTIC))
  await fs.writeFile(sharedConfiguration, sdkProperty(fixture.sdkB.root))
  fixture.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
    changes: [{ uri: pathToFileURL(fixture.configPath).href, type: 2 }],
  } })
  await refreshed
  for (const [name, declaration, content] of [["ProjectApi", fixture.sdkB.module, fixture.sdkB.moduleText],
    ["ProjectAmbient", fixture.sdkB.ambient, fixture.sdkB.ambientText]]) {
    const response = await fixture.session.request("textDocument/definition", fixture.query(name))
    assert.deepEqual(response.result, [{ uri: pathToFileURL(declaration).href, range: rangeOf(content, name) }])
  }
})

test("two workspace SDK selections remain isolated in one language-server process", async (t) => {
  const fixture = await sdkSession(t)
  const secondRoot = path.join(fixture.root, "second-workspace")
  await fs.mkdir(secondRoot)
  await fs.writeFile(path.join(secondRoot, "local.properties"), sdkProperty(fixture.sdkB.root))
  const secondSource = path.join(secondRoot, "Second.ets")
  await fs.writeFile(secondSource, fixture.text)
  const secondUri = pathToFileURL(secondSource).href
  const transport = new LspProcess({ env: {
    ARKLINE_HARMONY_SDK_PATH: fixture.fallback.root,
    ARKTS_LSP_LOG_DIR: path.join(fixture.root, "multi-logs"),
    ARKTS_INDEX_CACHE_DIR: path.join(fixture.root, "multi-cache"),
  } })
  let nextId = 1
  const request = async (method, params) => {
    const id = nextId++
    transport.send({ jsonrpc: "2.0", id, method, params })
    return transport.response(id)
  }
  fixture.trackSession({ close: async () => {
    const shutdown = await request("shutdown", null)
    assert.equal(shutdown.error, undefined)
    const exited = once(transport.child, "exit")
    transport.send({ jsonrpc: "2.0", method: "exit", params: null })
    await withTimeout(exited, 5000, "multi-root SDK server did not exit")
  } })
  await request("initialize", { processId: process.pid, rootUri: pathToFileURL(fixture.workspaceRoot).href, capabilities: {},
    workspaceFolders: [fixture.workspaceRoot, secondRoot].map((root) => ({ name: path.basename(root), uri: pathToFileURL(root).href })) })
  transport.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  for (const uri of [fixture.uri, secondUri]) transport.send({ jsonrpc: "2.0", method: "textDocument/didOpen",
    params: { textDocument: { uri, languageId: "arkts", version: 1, text: fixture.text } } })
  for (const [uri, sdk] of [[fixture.uri, fixture.sdkA], [secondUri, fixture.sdkB], [fixture.uri, fixture.sdkA]]) {
    for (const [name, declaration, content] of [["ProjectApi", sdk.module, sdk.moduleText], ["ProjectAmbient", sdk.ambient, sdk.ambientText]]) {
      const response = await request("textDocument/definition", { ...fixture.query(name), textDocument: { uri } })
      assert.deepEqual(response.result, [{ uri: pathToFileURL(declaration).href, range: rangeOf(content, name) }])
    }
  }
})

async function sdkSession(t, {
  beforeStart,
  initializationSdk,
  initializationSdkPath,
  source,
} = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-project-sdk-"))
  const workspaceRoot = path.join(root, "workspace")
  const documentPath = path.join(workspaceRoot, "entry", "src", "main", "ets", "Page.ets")
  const text = source
    ?? "import { ProjectApi } from '@ohos.projectApi'\nconst api = new ProjectApi()\nconst ambient: ProjectAmbient = { projectOnly: 1 }\n"
  const sdkA = await writeSdk(root, "sdk-a", "projectOnly")
  const sdkB = await writeSdk(root, "sdk-b", "secondOnly")
  const fallback = await writeSdk(root, "sdk-fallback", "fallbackOnly")
  await fs.mkdir(path.dirname(documentPath), { recursive: true })
  await fs.writeFile(documentPath, text)
  const configPath = path.join(workspaceRoot, "local.properties")
  await fs.writeFile(configPath, sdkProperty(sdkA.root))
  const sessions = []
  t.after(async () => {
    await Promise.all(sessions.map((session) => session.close()))
    await fs.rm(root, { recursive: true, force: true })
  })
  const uri = pathToFileURL(documentPath).href
  const fixture = { root, workspaceRoot, documentPath, uri, text, sdkA, sdkB, fallback, configPath }
  await beforeStart?.(fixture)
  async function startSession() {
    const session = new LspSession({
      command: process.execPath,
      args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
      env: {
        ARKLINE_HARMONY_SDK_PATH: fallback.root,
        ARKTS_LSP_LOG_DIR: path.join(root, `logs-${sessions.length}`),
        ARKTS_INDEX_CACHE_DIR: path.join(root, `cache-${sessions.length}`),
      },
      rootUri: pathToFileURL(workspaceRoot).href,
      capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
    })
    sessions.push(session)
    await session.initialize({
      initializationOptions: initializationSdk || initializationSdkPath
        ? { sdk: { path: initializationSdkPath ?? fixture[initializationSdk].root } }
        : undefined,
    })
    session.openDocument({ uri, version: 1, text })
    return session
  }
  return { ...fixture, startSession, trackSession: (session) => sessions.push(session), session: await startSession(), query: (name) => ({
    textDocument: { uri }, position: positionAt(text, text.lastIndexOf(name) + 1),
  }) }
}

async function writeSdk(parent, name, field) {
  const root = path.join(parent, name)
  const module = path.join(root, "ets", "api", "@ohos.projectApi.d.ts")
  const moduleText = `export declare class ProjectApi { ${field}: number }\n`
  const ambient = path.join(root, "ets", "component", "common.d.ts")
  const ambientText = `interface ProjectAmbient { ${field}: number }\n`
  await fs.mkdir(path.dirname(module), { recursive: true })
  await fs.mkdir(path.dirname(ambient), { recursive: true })
  await fs.mkdir(path.join(root, "toolchains"), { recursive: true })
  await fs.writeFile(module, moduleText)
  await fs.writeFile(ambient, ambientText)
  return { root, module, moduleText, ambient, ambientText }
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  return { line: prefix.split("\n").length - 1, character: offset - prefix.lastIndexOf("\n") - 1 }
}

function rangeOf(source, token) {
  const start = source.indexOf(token)
  return { start: positionAt(source, start), end: positionAt(source, start + token.length) }
}

function sdkProperty(sdkRoot) {
  return `sdk.dir=${sdkRoot.replaceAll("\\", "\\\\")}\n`
}
