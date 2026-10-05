import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { materializeConformanceWorkspace } from "../support/materialize-conformance-workspace.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("a declared file dependency alias resolves a package subpath for definition and diagnostics", async (t) => {
  const fixture = await localAliasFixture(t, "export class DialogPage {}\n")
  const { sessions, declarationPath, consumerUri, consumer } = fixture

  const expectedDefinition = [{
    uri: pathToFileURL(declarationPath).href,
    range: { start: { line: 0, character: "export class ".length },
      end: { line: 0, character: "export class DialogPage".length } },
  }]
  const position = { line: 1, character: "const dialog = new ".length + 1 }
  const sidecarPath = path.join(projectRoot, "target", "release",
    process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar")
  const nativeSidecar = await fs.stat(sidecarPath).then((stat) => stat.isFile(), () => false)
  if (!nativeSidecar) t.diagnostic("native sidecar unavailable; default request may use a conservative fallback")

  const runs = {}
  for (const profile of ["legacy", "default"]) {
    const logDirectory = path.join(fixture.root, `${profile}-logs`)
    const session = new LspSession({
      command: process.execPath,
      args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
      cwd: projectRoot,
      env: {
        ARKLINE_HARMONY_SDK_PATH: path.join(fixture.corpusRoot, "sdk", "openharmony"),
        ARKTS_LSP_LOG_DIR: logDirectory,
        ARKTS_INDEX_CACHE_DIR: path.join(fixture.root, `${profile}-cache`),
        ...(nativeSidecar ? { ARKTS_INDEX_SIDECAR_PATH: sidecarPath } : {}),
        ARKTS_INDEX_CATALOG_TRACE: "1",
        ARKTS_REFERENCES_TRACE: "1",
        ...(profile === "legacy" ? { ARKTS_REFERENCES_STRATEGY: "legacy" } : {}),
      },
      rootUri: pathToFileURL(fixture.workspaceRoot).href,
      capabilities: {
        window: { workDoneProgress: true },
        textDocument: { publishDiagnostics: { versionSupport: true } },
      },
    })
    sessions.push(session)
    await session.initialize({ timeoutMs: 10_000 })
    if (nativeSidecar) {
      const create = await session.transport.serverRequest(
        "window/workDoneProgress/create", () => true, 10_000)
      session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
      await session.transport.progress(create.params.token,
        (message) => message.params.value.kind === "end", 20_000)
    }
    const publication = session.transport.notification("textDocument/publishDiagnostics",
      (message) => message.params.uri === consumerUri && message.params.version === 1, 10_000)
    session.openDocument({ uri: consumerUri, version: 1, text: consumer })
    const diagnostics = (await publication).params.diagnostics
    const definition = await session.request("textDocument/definition", {
      textDocument: { uri: consumerUri }, position,
    }, { timeoutMs: 10_000 })
    assert.equal(definition.error, undefined, JSON.stringify(definition))
    assert.deepEqual(definition.result, expectedDefinition, JSON.stringify({ profile, definition, diagnostics }))
    assert.deepEqual(diagnostics.filter((diagnostic) => diagnostic.code === 2307), [],
      JSON.stringify({ profile, diagnostics }))

    const references = {}
    for (const includeDeclaration of [false, true]) {
      const response = await session.request("textDocument/references", {
        textDocument: { uri: consumerUri }, position, context: { includeDeclaration },
      }, { timeoutMs: 30_000 })
      assert.equal(response.error, undefined, JSON.stringify({ profile, includeDeclaration, response }))
      references[includeDeclaration] = normalizedLocations(fixture.workspaceRoot, response.result)
    }
    runs[profile] = references
    await session.close({ timeoutMs: 10_000 })
    if (profile === "default") {
      const logs = (await fs.readFile(path.join(logDirectory, "server.log"), "utf8"))
        .split("\n").filter(Boolean).map(JSON.parse)
      const indexEvents = logs.filter((entry) => entry.event?.startsWith("references.index."))
      const catalogEvents = logs.filter((entry) => entry.event === "index.catalog.phase")
      const acceptedCount = indexEvents.filter((entry) => entry.event === "references.index.accepted").length
      const fallbackCount = indexEvents.filter((entry) => entry.event === "references.index.fallback").length
      if (nativeSidecar) {
        assert.equal(catalogEvents.some((entry) => entry.phase === "ready"), true,
          "native catalog must be ready before the indexed differential")
        assert.equal(acceptedCount, 2, "both declaration policies must accept the native index")
        assert.equal(fallbackCount, 0, "the indexed differential must not silently use fallback")
      }
      t.diagnostic(`default index: ${JSON.stringify({
        nativeSidecar, ready: catalogEvents.some((entry) => entry.phase === "ready"),
        acceptedCount, fallbacks: indexEvents.filter((entry) => entry.event === "references.index.fallback")
          .map((entry) => entry.reason),
      })}`)
    }
  }

  assert.deepEqual(runs.default, runs.legacy,
    "fresh legacy and default sessions must return identical URI/UTF-16 Location sets for both policies")
  t.diagnostic(`exact reference sets: ${JSON.stringify(runs.default)}`)
  const declarationLocation = locationTuple(fixture.workspaceRoot, expectedDefinition[0])
  const usage = locationTuple(fixture.workspaceRoot, {
    uri: consumerUri,
    range: { start: { line: 1, character: "const dialog = new ".length },
      end: { line: 1, character: "const dialog = new DialogPage".length } },
  })
  assert.ok(runs.default.true.some((location) => sameLocation(location, declarationLocation)),
    "references must include the target class declaration")
  assert.ok(runs.default.true.some((location) => sameLocation(location, usage)),
    "references must include the caller across the package alias")
  assert.ok(runs.default.false.some((location) => sameLocation(location, usage)),
    "references without declarations must retain the cross-module usage")
  assert.equal(runs.default.false.some((location) => sameLocation(location, declarationLocation)), false,
    "includeDeclaration=false must exclude the target class declaration")
})

test("an explicit constructor through a local package alias keeps complete references on conservative fallback", async (t) => {
  const fixture = await localAliasFixture(t,
    "export class DialogPage {\n  constructor() {}\n}\n")
  const { sessions, consumerUri, consumer } = fixture
  const position = { line: 1, character: "const dialog = new ".length + 1 }
  const sidecarPath = path.join(projectRoot, "target", "release",
    process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar")
  const nativeSidecar = await fs.stat(sidecarPath).then((stat) => stat.isFile(), () => false)
  if (!nativeSidecar) t.diagnostic("native sidecar unavailable; conservative fallback cannot be traced")
  const runs = {}

  for (const profile of ["legacy", "default"]) {
    const logDirectory = path.join(fixture.root, `${profile}-explicit-logs`)
    const session = new LspSession({
      command: process.execPath,
      args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
      cwd: projectRoot,
      env: {
        ARKLINE_HARMONY_SDK_PATH: path.join(fixture.corpusRoot, "sdk", "openharmony"),
        ARKTS_LSP_LOG_DIR: logDirectory,
        ARKTS_INDEX_CACHE_DIR: path.join(fixture.root, `${profile}-explicit-cache`),
        ...(nativeSidecar ? { ARKTS_INDEX_SIDECAR_PATH: sidecarPath } : {}),
        ARKTS_INDEX_CATALOG_TRACE: "1",
        ARKTS_REFERENCES_TRACE: "1",
        ...(profile === "legacy" ? { ARKTS_REFERENCES_STRATEGY: "legacy" } : {}),
      },
      rootUri: pathToFileURL(fixture.workspaceRoot).href,
      capabilities: {
        window: { workDoneProgress: true },
        textDocument: { publishDiagnostics: { versionSupport: true } },
      },
    })
    sessions.push(session)
    await session.initialize({ timeoutMs: 10_000 })
    if (nativeSidecar) {
      const create = await session.transport.serverRequest(
        "window/workDoneProgress/create", () => true, 10_000)
      session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
      await session.transport.progress(create.params.token,
        (message) => message.params.value.kind === "end", 20_000)
    }
    const publication = session.transport.notification("textDocument/publishDiagnostics",
      (message) => message.params.uri === consumerUri && message.params.version === 1, 10_000)
    session.openDocument({ uri: consumerUri, version: 1, text: consumer })
    const diagnostics = (await publication).params.diagnostics
    assert.deepEqual(diagnostics.filter((diagnostic) => diagnostic.code === 2307), [],
      JSON.stringify({ profile, diagnostics }))

    const references = {}
    for (const includeDeclaration of [false, true]) {
      const response = await session.request("textDocument/references", {
        textDocument: { uri: consumerUri }, position, context: { includeDeclaration },
      }, { timeoutMs: 30_000 })
      assert.equal(response.error, undefined, JSON.stringify({ profile, includeDeclaration, response }))
      references[includeDeclaration] = normalizedLocations(fixture.workspaceRoot, response.result)
    }
    runs[profile] = references
    await session.close({ timeoutMs: 10_000 })
    if (profile === "default" && nativeSidecar) {
      const logs = (await fs.readFile(path.join(logDirectory, "server.log"), "utf8"))
        .split("\n").filter(Boolean).map(JSON.parse)
      const catalogReady = logs.some((entry) => entry.event === "index.catalog.phase" && entry.phase === "ready")
      const fallbacks = logs.filter((entry) => entry.event === "references.index.fallback")
      const acceptedCount = logs.filter((entry) => entry.event === "references.index.accepted").length
      t.diagnostic(`explicit constructor index: ${JSON.stringify({ catalogReady, acceptedCount,
        fallbacks: fallbacks.map((entry) => entry.reason) })}`)
      assert.equal(catalogReady, true, "native catalog must be ready before the fallback characterization")
      assert.ok(fallbacks.some((entry) => entry.reason === "candidate-ineligible"),
        "unknown explicit-constructor identity must fall back, not narrow an incomplete answer")
      assert.equal(acceptedCount, 0, "explicit constructor must not be admitted as an indexed proof")
    }
  }

  assert.deepEqual(runs.default, runs.legacy,
    "fresh legacy and default sessions must return identical explicit-constructor Location sets")
  t.diagnostic(`explicit constructor exact reference sets: ${JSON.stringify(runs.default)}`)
  const usage = locationTuple(fixture.workspaceRoot, {
    uri: consumerUri,
    range: { start: { line: 1, character: "const dialog = new ".length },
      end: { line: 1, character: "const dialog = new DialogPage".length } },
  })
  assert.ok(runs.default.true.some((location) => sameLocation(location, usage)),
    "references must include the cross-module constructor call")
  assert.ok(runs.default.false.some((location) => sameLocation(location, usage)),
    "includeDeclaration=false must retain the cross-module constructor call")
  const constructorDeclaration = locationTuple(fixture.workspaceRoot, {
    uri: pathToFileURL(fixture.declarationPath).href,
    range: { start: { line: 1, character: 2 }, end: { line: 1, character: 13 } },
  })
  assert.ok(runs.default.true.some((location) => sameLocation(location, constructorDeclaration)),
    "includeDeclaration=true must include the explicit constructor declaration")
  assert.equal(runs.default.false.some((location) => sameLocation(location, constructorDeclaration)), false,
    "includeDeclaration=false must exclude the explicit constructor declaration")
})

async function localAliasFixture(t, declaration) {
  const fixture = await materializeConformanceWorkspace()
  const sessions = []
  t.after(async () => {
    try { await Promise.all(sessions.map((session) => session.close().catch(() => {}))) }
    finally { await fs.rm(fixture.root, { recursive: true, force: true }) }
  })

  const packageRoot = path.join(fixture.workspaceRoot, "uikit")
  const declarationPath = path.join(packageRoot, "src", "main", "ets", "menus", "Menu.ets")
  const consumerPath = path.join(fixture.workspaceRoot, "entry", "src", "main", "ets", "AliasConsumer.ets")
  const consumer = [
    "import { DialogPage } from '@ohos/settings.uikit/src/main/ets/menus/Menu'",
    "const dialog = new DialogPage()",
    "",
  ].join("\n")
  await fs.mkdir(path.dirname(declarationPath), { recursive: true })
  await fs.writeFile(declarationPath, declaration)
  await fs.writeFile(path.join(packageRoot, "Index.ets"), "export { DialogPage } from './src/main/ets/menus/Menu'\n")
  await fs.writeFile(path.join(packageRoot, "oh-package.json5"), "{ name: 'uikit', main: 'Index.ets' }\n")
  await fs.writeFile(path.join(packageRoot, "build-profile.json5"), "{ targets: [{ name: 'default' }] }\n")
  await fs.writeFile(path.join(packageRoot, "src", "main", "module.json5"),
    "{ module: { name: 'uikit', type: 'har', deviceTypes: ['phone'] } }\n")
  await fs.writeFile(path.join(fixture.workspaceRoot, "entry", "oh-package.json5"),
    "{ name: 'entry', dependencies: { shared: 'file:../shared', '@ohos/settings.uikit': 'file:../uikit' } }\n")
  await fs.writeFile(path.join(fixture.workspaceRoot, "build-profile.json5"), JSON.stringify({
    app: { products: [{ name: "default" }] },
    modules: ["entry", "shared", "uikit"].map((name) => ({
      name, srcPath: `./${name}`, targets: [{ name: "default", applyToProducts: ["default"] }],
    })),
  }))
  await fs.writeFile(consumerPath, consumer)
  return { ...fixture, sessions, declarationPath, consumerUri: pathToFileURL(consumerPath).href, consumer }
}

function normalizedLocations(workspaceRoot, locations) {
  assert.ok(Array.isArray(locations), "references must return a complete Location array")
  const normalized = locations.map((location) => locationTuple(workspaceRoot, location))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  assert.equal(new Set(normalized.map(JSON.stringify)).size, normalized.length,
    "references must not contain duplicate Locations")
  return normalized
}

function locationTuple(workspaceRoot, location) {
  const relative = path.relative(workspaceRoot, fileURLToPath(location.uri))
  assert.ok(relative && relative !== ".." && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative), `reference must be inside the workspace: ${location.uri}`)
  return {
    file: relative.split(path.sep).join("/"),
    start: location.range.start,
    end: location.range.end,
  }
}

function sameLocation(left, right) {
  return left.file === right.file && left.start.line === right.start.line
    && left.start.character === right.start.character && left.end.line === right.end.line
    && left.end.character === right.end.character
}
