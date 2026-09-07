import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildSync } from "esbuild"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("completion does not expose globals from an inactive target source directory", async (t) => {
  const fixture = targetFixture(t)
  const session = await fixture.start("const value = InactiveO\n")
  const items = await fixture.complete(session)
  assert.equal(items.some((item) => item.label === "InactiveOnly"), false,
    "the unselected desktop target must not join the active tablet program")
})

test("completion retains globals from the selected target source directory", async (t) => {
  const fixture = targetFixture(t)
  const session = await fixture.start("const value = TabletO\n")
  const items = await fixture.complete(session)
  assert.equal(items.some((item) => item.label === "TabletOnly"), true)
})

test("opening and querying an inactive overlay does not add its globals to active completion", async (t) => {
  const fixture = targetFixture(t)
  const session = await fixture.start("const value = InactiveO\n")
  const inactiveUri = pathToFileURL(fixture.desktopPath).href
  session.openDocument({ uri: inactiveUri, version: 1, text: "class InactiveOnly {}\n" })
  const hover = await session.request("textDocument/hover", {
    textDocument: { uri: inactiveUri }, position: { line: 0, character: 8 },
  })
  assert.equal(hover.error, undefined)
  const items = await fixture.complete(session)
  assert.equal(items.some((item) => item.label === "InactiveOnly"), false)
})

test("a watched file created in an inactive target does not join active membership", async (t) => {
  const fixture = targetFixture(t)
  const session = await fixture.start("const value = InactiveCre\n")
  assert.equal((await fixture.complete(session)).some((item) => item.label === "InactiveCreated"), false)
  const createdPath = path.join(path.dirname(fixture.desktopPath), "Created.ets")
  fs.writeFileSync(createdPath, "class InactiveCreated {}\n")
  session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
    changes: [{ uri: pathToFileURL(createdPath).href, type: 1 }],
  } })
  const items = await fixture.complete(session)
  assert.equal(items.some((item) => item.label === "InactiveCreated"), false)
})

test("ambiguous target selection does not merge target globals into the active program", async (t) => {
  const fixture = targetFixture(t)
  fixture.profile.modules[0].targets.push({ name: "desktop", applyToProducts: ["default"] })
  fs.writeFileSync(fixture.profilePath, JSON.stringify(fixture.profile))
  const session = await fixture.start("const value = TabletO\n")
  const items = await fixture.complete(session)
  assert.equal(items.some((item) => item.label === "TabletOnly"), false)
})

test("completion retains auto-import candidates from the selected target", async (t) => {
  const fixture = targetFixture(t)
  const session = await fixture.start("const value = SelectedAuto\n")
  const items = await fixture.complete(session)
  assert.equal(items.filter((item) => item.label === "SelectedAutoImport").length, 1)
})

test("a watched target switch replaces membership and matches a fresh session", async (t) => {
  const fixture = targetFixture(t)
  const session = await fixture.start("const value = TabletO\n")
  assert.equal((await fixture.complete(session)).some((item) => item.label === "TabletOnly"), true)
  fixture.profile.modules[0].targets[0].name = "desktop"
  fs.writeFileSync(fixture.profilePath, JSON.stringify(fixture.profile))
  session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
    changes: [{ uri: pathToFileURL(fixture.profilePath).href, type: 2 }],
  } })
  assert.equal((await fixture.complete(session)).some((item) => item.label === "TabletOnly"), false)
  const text = "const value = InactiveO\n"
  const warmItems = await fixture.complete(session, text)
  assert.equal(warmItems.some((item) => item.label === "InactiveOnly"), true)
  const fresh = await fixture.start(text)
  const freshItems = await fixture.complete(fresh)
  const comparable = (items) => items.map(({ label, kind, detail, textEdit, additionalTextEdits }) => ({
    label, kind, detail, textEdit, additionalTextEdits,
  })).sort((left, right) => left.label.localeCompare(right.label))
  assert.deepEqual(comparable(warmItems), comparable(freshItems))
})

test("project membership prunes inactive directories before enumeration or source reads", (t) => {
  const fixture = targetFixture(t)
  fs.writeFileSync(fixture.mainPath, "const value = TabletO\n")
  const driverPath = path.join(fixture.root, "document-store-driver.cjs")
  buildSync({
    stdin: { contents: 'export { SemanticDocumentStore } from "./src/core/workspace/document-store.ts"', resolveDir: projectRoot },
    bundle: true, platform: "node", target: "node20", format: "cjs", outfile: driverPath,
  })
  const { SemanticDocumentStore } = createRequire(import.meta.url)(driverPath)
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose())
  const inactiveAccesses = []
  for (const method of ["opendirSync", "readdirSync", "openSync", "readFileSync"]) {
    const original = fs[method]
    t.mock.method(fs, method, (...args) => {
      if (String(args[0]).startsWith(path.dirname(fixture.desktopPath))) {
        inactiveAccesses.push({ method, path: String(args[0]) })
      }
      return original(...args)
    })
  }
  const workspace = store.prepare({ path: fixture.mainPath, workspaceRoot: fixture.workspaceRoot, line: 1, column: 1 }, true)
  assert.equal(workspace.projectMembership.status, "complete")
  assert.equal(workspace.projectMembership.paths.includes(fixture.tabletPath), true)
  assert.equal(workspace.projectMembership.paths.includes(fixture.desktopPath), false)
  assert.deepEqual(inactiveAccesses, [])
})

test("module-root entries and installed package dependency closures remain available", async (t) => {
  const fixture = targetFixture(t)
  const moduleEntry = path.join(fixture.moduleRoot, "Index.ets")
  const installedRoot = path.join(fixture.moduleRoot, "oh_modules", "@example", "shared")
  const installedEntry = path.join(installedRoot, "Index.ets")
  fs.mkdirSync(installedRoot, { recursive: true })
  fs.writeFileSync(moduleEntry, "export class ModuleRootClass {}\n")
  fs.writeFileSync(installedEntry, "export class PackageClass {}\n")
  fs.writeFileSync(path.join(installedRoot, "oh-package.json5"), "{ main: 'Index.ets' }")
  fs.writeFileSync(path.join(fixture.moduleRoot, "oh-package.json5"), "{ dependencies: { '@example/shared': '^1.0.0' } }")
  const source = [
    "import { ModuleRootClass } from '../../../Index'",
    "import { PackageClass } from '@example/shared'",
    "const first = ModuleRootClass",
    "const second = PackageClass",
    "",
  ].join("\n")
  const session = await fixture.start(source)
  for (const [name, line, expectedPath] of [["ModuleRootClass", 2, moduleEntry], ["PackageClass", 3, installedEntry]]) {
    const response = await session.request("textDocument/definition", {
      textDocument: { uri: fixture.uri },
      position: { line, character: source.split("\n")[line].indexOf(name) + 1 },
    })
    assert.equal(response.error, undefined)
    assert.equal(response.result?.length, 1)
    assert.equal(response.result[0].uri, pathToFileURL(expectedPath).href)
  }
})

function targetFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-target-membership-"))
  const workspaceRoot = path.join(root, "workspace")
  const moduleRoot = path.join(workspaceRoot, "features", "alpha")
  const mainPath = path.join(moduleRoot, "src", "main", "ets", "Page.ets")
  const tabletPath = path.join(moduleRoot, "src", "tablet", "Tablet.ets")
  const desktopPath = path.join(moduleRoot, "src", "desktop", "Desktop.ets")
  for (const filePath of [mainPath, tabletPath, desktopPath]) fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(tabletPath, "class TabletOnly {}\n")
  fs.writeFileSync(desktopPath, "class InactiveOnly {}\n")
  fs.writeFileSync(path.join(moduleRoot, "src", "tablet", "Auto.ets"), "export class SelectedAutoImport {}\n")
  const profilePath = path.join(workspaceRoot, "build-profile.json5")
  const profile = {
    app: { products: [{ name: "default" }] },
    modules: [{ name: "alpha", srcPath: "./features/alpha", targets: [{ name: "tablet", applyToProducts: ["default"] }] }],
  }
  fs.writeFileSync(profilePath, JSON.stringify(profile))
  fs.writeFileSync(path.join(moduleRoot, "build-profile.json5"), JSON.stringify({
    targets: [
      { name: "tablet", source: { sourceRoots: ["./src/tablet"] } },
      { name: "desktop", source: { sourceRoots: ["./src/desktop"] } },
    ],
  }))
  const uri = pathToFileURL(mainPath).href
  const sessions = []
  const texts = new Map()
  t.after(async () => {
    await Promise.all(sessions.map((session) => session.close()))
    fs.rmSync(root, { recursive: true, force: true })
  })
  return {
    root, workspaceRoot, moduleRoot, mainPath, tabletPath, desktopPath, profilePath, profile, uri,
    async start(text) {
      fs.writeFileSync(mainPath, text)
      const session = new LspSession({
        command: process.execPath,
        args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
        rootUri: pathToFileURL(workspaceRoot).href,
        env: {
          ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
          ARKTS_LSP_LOG_DIR: path.join(root, `logs-${sessions.length}`),
          ARKTS_LSP_CACHE_DIR: path.join(root, `cache-${sessions.length}`),
        },
      })
      sessions.push(session)
      await session.initialize()
      session.openDocument({ uri, version: 1, text })
      texts.set(session, { text, version: 1 })
      return session
    },
    async complete(session, text) {
      let state = texts.get(session)
      if (text !== undefined) {
        state = { text, version: state.version + 1 }
        texts.set(session, state)
        session.changeDocument({ uri, ...state })
      }
      const response = await session.request("textDocument/completion", {
        textDocument: { uri }, position: { line: 0, character: state.text.indexOf("\n") },
      })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      return Array.isArray(response.result) ? response.result : response.result?.items ?? []
    },
  }
}
