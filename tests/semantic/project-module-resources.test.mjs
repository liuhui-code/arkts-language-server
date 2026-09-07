import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("resource definition respects non-default module srcPath instead of merging sibling modules", async (t) => {
  const fixture = await moduleSession(t)
  const response = await fixture.session.request("textDocument/definition", fixture.query("title"))
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [{
    uri: pathToFileURL(fixture.resourceA).href,
    range: rangeOf(fixture.resourceText, "title"),
  }])
})

test("uses the explicit product target resource directories, not another target or the default directory", async (t) => {
  let selectedResource
  const fixture = await moduleSession(t, { beforeStart: async ({ moduleA, profile, profilePath, resourceText }) => {
    profile.modules[0].targets = [{ name: "tablet", applyToProducts: ["default"] }]
    await fs.writeFile(profilePath, JSON.stringify(profile))
    selectedResource = path.join(moduleA, "src", "tablet", "resources", "base", "element", "string.json")
    await fs.mkdir(path.dirname(selectedResource), { recursive: true })
    await fs.writeFile(selectedResource, resourceText)
    await fs.writeFile(path.join(moduleA, "build-profile.json5"), JSON.stringify({
      apiType: "stageMode", targets: [
        { name: "other", resource: { directories: ["./src/main/resources"] } },
        { name: "tablet", resource: { directories: ["./src/tablet/resources"] } },
      ],
    }))
  } })
  const response = await fixture.session.request("textDocument/definition", fixture.query("title"))
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [{ uri: pathToFileURL(selectedResource).href, range: rangeOf(fixture.resourceText, "title") }])
})

test("changing module ownership invalidates warm resource definitions without editing the open source", async (t) => {
  const fixture = await moduleSession(t)
  const query = fixture.query("title")
  assert.equal((await fixture.session.request("textDocument/definition", query)).result.length, 1)
  fixture.profile.modules = fixture.profile.modules.slice(1)
  await fs.writeFile(fixture.profilePath, JSON.stringify(fixture.profile))
  watched(fixture.session, fixture.profilePath)
  const warm = await fixture.session.request("textDocument/definition", query)
  assert.equal(warm.error, undefined)
  assert.deepEqual(warm.result, [])
  const fresh = await fixture.startSession()
  assert.deepEqual((await fresh.request("textDocument/definition", query)).result, warm.result)
})

test("resolves a module's self-package source import from the selected target sourceRoots", async (t) => {
  let selectedSource
  const declaration = "// 😀 selected target\nexport function getName(): string { return 'tablet' }\n"
  const fixture = await moduleSession(t, { beforeStart: async ({ moduleA }) => {
    selectedSource = path.join(moduleA, "src", "tablet", "Test.ets")
    await fs.mkdir(path.dirname(selectedSource), { recursive: true })
    await fs.writeFile(selectedSource, declaration)
    await fs.writeFile(path.join(moduleA, "src", "main", "Test.ets"), "export function getName(): number { return 0 }\n")
    await fs.writeFile(path.join(moduleA, "oh-package.json5"), "{ name: 'alpha', dependencies: {} }")
    await fs.writeFile(path.join(moduleA, "build-profile.json5"), "{ targets: [{ name: 'default', source: { sourceRoots: ['./src/tablet'] } }] }")
  } })
  const source = "import { getName } from 'alpha/Test'\nconst name: string = getName()\n"
  fixture.session.changeDocument({ uri: fixture.uri, version: 2, text: source })
  const response = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.uri }, position: positionAt(source, source.lastIndexOf("getName") + 2),
  })
  assert.equal(response.error, undefined)
  const start = declaration.indexOf("getName")
  assert.deepEqual(response.result, [{ uri: pathToFileURL(selectedSource).href, range: {
    start: positionAt(declaration, start), end: positionAt(declaration, start + "getName".length),
  } }])
})

test("self-package definition uses an alias overlay and restores the disk declaration after close", async (t) => {
  const declaration = "export function getName(): string { return 'disk' }\n"
  const overlay = `// 😀 unsaved target\n\n${declaration}`
  let targetPath
  let aliasPath
  const fixture = await moduleSession(t, { beforeStart: async ({ moduleA }) => {
    targetPath = path.join(moduleA, "src", "tablet", "Test.ets")
    aliasPath = path.join(moduleA, "src", "tablet", "TestAlias.ets")
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, declaration)
    await fs.symlink(targetPath, aliasPath, "file")
    await fs.writeFile(path.join(moduleA, "oh-package.json5"), "{ name: 'alpha', dependencies: {} }")
    await fs.writeFile(path.join(moduleA, "build-profile.json5"), "{ targets: [{ name: 'default', source: { sourceRoots: ['./src/tablet'] } }] }")
  } })
  const source = "import { getName } from 'alpha/Test'\nconst name = getName()\n"
  const aliasUri = pathToFileURL(aliasPath).href
  fixture.session.openDocument({ uri: aliasUri, version: 1, text: overlay })
  fixture.session.changeDocument({ uri: fixture.uri, version: 2, text: source })
  const query = {
    textDocument: { uri: fixture.uri }, position: positionAt(source, source.lastIndexOf("getName") + 2),
  }
  const open = await fixture.session.request("textDocument/definition", query)
  assert.equal(open.error, undefined)
  let offset = overlay.indexOf("getName")
  assert.deepEqual(open.result, [{ uri: aliasUri, range: {
    start: positionAt(overlay, offset), end: positionAt(overlay, offset + "getName".length),
  } }])
  fixture.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: {
    textDocument: { uri: aliasUri },
  } })
  const closed = await fixture.session.request("textDocument/definition", query)
  assert.equal(closed.error, undefined)
  offset = declaration.indexOf("getName")
  assert.deepEqual(closed.result, [{ uri: pathToFileURL(targetPath).href, range: {
    start: positionAt(declaration, offset), end: positionAt(declaration, offset + "getName".length),
  } }])
})

test("self-package definition admits a diskless target overlay within the selected source root", async (t) => {
  let targetPath
  const overlay = "// 😀 new unsaved source\nexport function getName(): string { return 'new' }\n"
  const fixture = await moduleSession(t, { beforeStart: async ({ moduleA }) => {
    targetPath = path.join(moduleA, "src", "tablet", "New.ets")
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(path.join(moduleA, "oh-package.json5"), "{ name: 'alpha', dependencies: {} }")
    await fs.writeFile(path.join(moduleA, "build-profile.json5"), "{ targets: [{ name: 'default', source: { sourceRoots: ['./src/tablet'] } }] }")
  } })
  await assert.rejects(fs.stat(targetPath), { code: "ENOENT" })
  const targetUri = pathToFileURL(targetPath).href
  fixture.session.openDocument({ uri: targetUri, version: 1, text: overlay })
  const source = "import { getName } from 'alpha/New'\nconst name = getName()\n"
  fixture.session.changeDocument({ uri: fixture.uri, version: 2, text: source })
  const response = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.uri }, position: positionAt(source, source.lastIndexOf("getName") + 2),
  })
  assert.equal(response.error, undefined)
  const start = overlay.indexOf("getName")
  assert.deepEqual(response.result, [{ uri: targetUri, range: {
    start: positionAt(overlay, start), end: positionAt(overlay, start + "getName".length),
  } }])
})

test("an explicit project selection disambiguates multiple targets without taking the first target", async (t) => {
  let selectedResource
  const fixture = await moduleSession(t, {
    selection: { product: "default", targets: { alpha: "tablet" } },
    beforeStart: async ({ moduleA, profile, profilePath, resourceText }) => {
      profile.modules[0].targets.push({ name: "tablet", applyToProducts: ["default"] })
      await fs.writeFile(profilePath, JSON.stringify(profile))
      selectedResource = path.join(moduleA, "src", "tablet", "resources", "base", "element", "string.json")
      await fs.mkdir(path.dirname(selectedResource), { recursive: true })
      await fs.writeFile(selectedResource, resourceText)
      await fs.writeFile(path.join(moduleA, "build-profile.json5"), JSON.stringify({ targets: [
        { name: "default" }, { name: "tablet", resource: { directories: ["./src/tablet/resources"] } },
      ] }))
    },
  })
  const response = await fixture.session.request("textDocument/definition", fixture.query("title"))
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [{ uri: pathToFileURL(selectedResource).href, range: rangeOf(fixture.resourceText, "title") }])
})

test("changing the project selection refreshes warm results and retains the unsaved source", async (t) => {
  const selection = { product: "default", targets: { alpha: "tablet" } }
  const fixture = await moduleSession(t, { selection, beforeStart: async ({ moduleA, profile, profilePath, resourceText }) => {
    profile.modules[0].targets.push({ name: "tablet", applyToProducts: ["default"] })
    await fs.writeFile(profilePath, JSON.stringify(profile))
    const resource = path.join(moduleA, "src", "tablet", "resources", "base", "element", "string.json")
    await fs.mkdir(path.dirname(resource), { recursive: true })
    await fs.writeFile(resource, resourceText)
    await fs.writeFile(path.join(moduleA, "build-profile.json5"), JSON.stringify({ targets: [
      { name: "default" }, { name: "tablet", resource: { directories: ["./src/tablet/resources"] } },
    ] }))
  } })
  const overlay = `// 😀 unsaved source\n${fixture.text}`
  fixture.session.changeDocument({ uri: fixture.uri, version: 2, text: overlay })
  const query = fixture.query("title", overlay)
  const before = await fixture.session.request("textDocument/definition", query)
  assert.match(before.result[0].uri, /\/tablet\//)
  selection.targets.alpha = "default"
  fixture.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration", params: {
    settings: { arkts: { project: selection } },
  } })
  const warm = await fixture.session.request("textDocument/definition", query)
  assert.equal(warm.error, undefined)
  assert.deepEqual(warm.result, [{ uri: pathToFileURL(fixture.resourceA).href, range: rangeOf(fixture.resourceText, "title") }])
  const fresh = await fixture.startSession(overlay)
  assert.deepEqual((await fresh.request("textDocument/definition", query)).result, warm.result)
})

test("a target resource directory does not have to be named resources", async (t) => {
  let customResource
  const fixture = await moduleSession(t, { beforeStart: async ({ moduleA, resourceText }) => {
    customResource = path.join(moduleA, "src", "main", "resources_tablet", "base", "element", "string.json")
    await fs.mkdir(path.dirname(customResource), { recursive: true })
    await fs.writeFile(customResource, resourceText)
    await fs.writeFile(path.join(moduleA, "build-profile.json5"), JSON.stringify({ targets: [
      { name: "default", resource: { directories: ["./src/main/resources_tablet"] } },
    ] }))
  } })
  const response = await fixture.session.request("textDocument/definition", fixture.query("title"))
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [{ uri: pathToFileURL(customResource).href, range: rangeOf(fixture.resourceText, "title") }])
})

test("custom resource edits refresh definitions and diagnostics without a source edit", async (t) => {
  let customResource
  const fixture = await moduleSession(t, { beforeStart: async ({ moduleA, resourceText }) => {
    customResource = path.join(moduleA, "src", "main", "resources_tablet", "base", "element", "string.json")
    await fs.mkdir(path.dirname(customResource), { recursive: true })
    await fs.writeFile(customResource, resourceText)
    await fs.writeFile(path.join(moduleA, "build-profile.json5"), JSON.stringify({ targets: [
      { name: "default", resource: { directories: ["./src/main/resources_tablet"] } },
    ] }))
  } })
  const query = fixture.query("title")
  assert.equal((await fixture.session.request("textDocument/definition", query)).result.length, 1)
  const changedText = JSON.stringify({ string: [{ name: "beta_only", value: "now local" }] })
  await fs.writeFile(customResource, changedText)
  watched(fixture.session, customResource)
  assert.deepEqual((await fixture.session.request("textDocument/definition", query)).result, [])
  const diagnostics = await fixture.session.transport.notification("textDocument/publishDiagnostics", ({ params }) => (
    params.uri === fixture.uri && params.version === 1
      && params.diagnostics.some(({ code, message }) => code === "arkui.resource.not-found" && message.includes("app.string.title"))
  ))
  const resourceErrors = diagnostics.params.diagnostics.filter(({ code }) => code === "arkui.resource.not-found")
  assert.equal(resourceErrors.length, 1)
  assert.match(resourceErrors[0].message, /app.string.title/)
})

test("sibling resources neither appear in completion nor mask a missing-resource diagnostic", async (t) => {
  const fixture = await moduleSession(t)
  const published = await fixture.session.transport.notification("textDocument/publishDiagnostics", ({ params }) => (
    params.uri === fixture.uri && params.version === 1
  ))
  const errors = published.params.diagnostics.filter(({ code }) => code === "arkui.resource.not-found")
  const start = fixture.text.indexOf("beta_only")
  assert.deepEqual(errors.map(({ range }) => range), [{ start: positionAt(fixture.text, start), end: positionAt(fixture.text, start + 9) }])
  const source = "const value = $r('app.string.')\n"
  fixture.session.changeDocument({ uri: fixture.uri, version: 2, text: source })
  const query = { textDocument: { uri: fixture.uri }, position: positionAt(source, source.indexOf("app.string.") + 11) }
  const before = await fixture.session.request("textDocument/completion", query)
  assert.equal(before.error, undefined)
  assert.deepEqual(before.result.items.map(({ label }) => label), ["title"])
  await fs.writeFile(fixture.resourceB, JSON.stringify({ string: [{ name: "foreign_new", value: "sibling" }] }))
  watched(fixture.session, fixture.resourceB)
  const after = await fixture.session.request("textDocument/completion", query)
  assert.deepEqual(after.result.items.map(({ label }) => label), ["title"])
})

test("invalid target selection is reported as a configuration diagnostic, not a missing resource", async (t) => {
  const fixture = await moduleSession(t, { selection: { targets: { alpha: "unknown" } } })
  const published = await fixture.session.transport.notification("textDocument/publishDiagnostics", ({ params }) => (
    params.uri === fixture.uri && params.version === 1
  ))
  assert.equal(published.params.diagnostics.some(({ code }) => code === "arkts.project.configuration"), true)
  assert.equal(published.params.diagnostics.some(({ code }) => code === "arkui.resource.not-found"), false)
})

async function moduleSession(t, { beforeStart, selection } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-module-model-"))
  const workspaceRoot = path.join(root, "workspace")
  const moduleA = path.join(workspaceRoot, "features", "alpha")
  const moduleB = path.join(workspaceRoot, "packages", "beta")
  const documentPath = path.join(moduleA, "src", "main", "ets", "Page.ets")
  const text = "const title = $r('app.string.title')\nconst other = $r('app.string.beta_only')\n"
  const resourceA = path.join(moduleA, "src", "main", "resources", "base", "element", "string.json")
  const resourceB = path.join(moduleB, "src", "main", "resources", "base", "element", "string.json")
  const resourceText = JSON.stringify({ string: [{ name: "title", value: "Alpha" }] }, null, 2)
  const profilePath = path.join(workspaceRoot, "build-profile.json5")
  const profile = {
    app: { products: [{ name: "default" }] },
    modules: [
      { name: "alpha", srcPath: "./features/alpha", targets: [{ name: "default", applyToProducts: ["default"] }] },
      { name: "beta", srcPath: "./packages/beta", targets: [{ name: "default", applyToProducts: ["default"] }] },
    ],
  }
  for (const resource of [resourceA, resourceB]) await fs.mkdir(path.dirname(resource), { recursive: true })
  await fs.mkdir(path.dirname(documentPath), { recursive: true })
  await fs.writeFile(documentPath, text)
  await fs.writeFile(resourceA, resourceText)
  await fs.writeFile(resourceB, JSON.stringify({ string: [{ name: "title", value: "Beta" }, { name: "beta_only", value: "Beta only" }] }))
  await fs.writeFile(profilePath, JSON.stringify(profile))
  for (const moduleRoot of [moduleA, moduleB]) {
    await fs.writeFile(path.join(moduleRoot, "build-profile.json5"), "{ apiType: 'stageMode', targets: [{ name: 'default' }] }")
  }
  const sessions = []
  t.after(async () => {
    await Promise.all(sessions.map((session) => session.close()))
    await fs.rm(root, { recursive: true, force: true })
  })
  const uri = pathToFileURL(documentPath).href
  const fixture = { root, workspaceRoot, moduleA, moduleB, documentPath, uri, text, resourceA, resourceB, resourceText, profilePath, profile }
  await beforeStart?.(fixture)
  async function startSession(source = text) {
    const session = new LspSession({
      command: process.execPath,
      args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
      env: {
        ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
        ARKTS_LSP_LOG_DIR: path.join(root, `logs-${sessions.length}`),
        ARKTS_LSP_CACHE_DIR: path.join(root, `cache-${sessions.length}`),
      },
      rootUri: pathToFileURL(workspaceRoot).href,
      capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
    })
    sessions.push(session)
    if (selection === undefined) await session.initialize()
    else {
      const id = session.nextRequestId++
      session.transport.send({ jsonrpc: "2.0", id, method: "initialize", params: {
        processId: process.pid, rootUri: session.rootUri, capabilities: session.capabilities,
        initializationOptions: { project: selection },
      } })
      const initialized = await session.transport.response(id)
      assert.equal(initialized.error, undefined)
      session.transport.send({ jsonrpc: "2.0", method: "initialized", params: {} })
      session.initialized = true
    }
    session.openDocument({ uri, version: 1, text: source })
    return session
  }
  return { ...fixture, startSession, session: await startSession(), query: (name, source = text) => ({
    textDocument: { uri }, position: positionAt(source, source.indexOf(`app.string.${name}`) + "app.string.".length + 1),
  }) }
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  return { line: prefix.split("\n").length - 1, character: offset - prefix.lastIndexOf("\n") - 1 }
}

function rangeOf(source, token) {
  const start = source.indexOf(`"${token}"`) + 1
  return { start: positionAt(source, start), end: positionAt(source, start + token.length) }
}

function watched(session, filePath, type = 2) {
  session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
    changes: [{ uri: pathToFileURL(filePath).href, type }],
  } })
}
