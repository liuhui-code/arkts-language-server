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
import { buildDocumentStoreDriver } from "../support/build-document-store-driver.mjs"

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
  const undeclaredRoot = path.join(fixture.workspaceRoot, "ghost")
  const undeclaredPath = path.join(undeclaredRoot, "src", "main", "ets", "Ghost.ets")
  fs.mkdirSync(path.dirname(undeclaredPath), { recursive: true })
  fs.writeFileSync(undeclaredPath, "class GhostOnly {}\n")
  const nestedUndeclaredRoot = path.join(fixture.moduleRoot, "ghost")
  const nestedUndeclaredPath = path.join(nestedUndeclaredRoot, "src", "main", "ets", "Ghost.ets")
  fs.mkdirSync(path.dirname(nestedUndeclaredPath), { recursive: true })
  fs.writeFileSync(nestedUndeclaredPath, "class NestedGhostOnly {}\n")
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
      if (String(args[0]).startsWith(path.dirname(fixture.desktopPath))
        || String(args[0]).startsWith(undeclaredRoot)
        || String(args[0]).startsWith(nestedUndeclaredRoot)) {
        inactiveAccesses.push({ method, path: String(args[0]) })
      }
      return original(...args)
    })
  }
  const workspace = store.prepare({ path: fixture.mainPath, workspaceRoot: fixture.workspaceRoot, line: 1, column: 1 }, true)
  assert.equal(workspace.projectMembership.status, "complete")
  assert.equal(workspace.projectMembership.paths.includes(fixture.tabletPath), true)
  assert.equal(workspace.projectMembership.paths.includes(fixture.desktopPath), false)
  assert.equal(workspace.projectMembership.paths.includes(undeclaredPath), false)
  assert.equal(workspace.projectMembership.paths.includes(nestedUndeclaredPath), false)
  assert.deepEqual(inactiveAccesses, [])
})

test("project membership reaches a declared module nested beneath an inactive target", (t) => {
  const fixture = targetFixture(t)
  fs.writeFileSync(fixture.mainPath, "const value = TabletO\n")
  const nestedRoot = path.join(fixture.moduleRoot, "src", "desktop", "nested")
  const nestedPath = path.join(nestedRoot, "src", "main", "ets", "Nested.ets")
  fs.mkdirSync(path.dirname(nestedPath), { recursive: true })
  fs.writeFileSync(nestedPath, "export class NestedModuleClass {}\n")
  fs.writeFileSync(path.join(nestedRoot, "build-profile.json5"), "{ targets: [{ name: 'default' }] }")
  fixture.profile.modules.push({
    name: "nested",
    srcPath: "./features/alpha/src/desktop/nested",
    targets: [{ name: "default", applyToProducts: ["default"] }],
  })
  fs.writeFileSync(fixture.profilePath, JSON.stringify(fixture.profile))

  const driverPath = path.join(fixture.root, "nested-document-store-driver.cjs")
  buildSync({
    stdin: { contents: 'export { SemanticDocumentStore } from "./src/core/workspace/document-store.ts"', resolveDir: projectRoot },
    bundle: true, platform: "node", target: "node20", format: "cjs", outfile: driverPath,
  })
  const { SemanticDocumentStore } = createRequire(import.meta.url)(driverPath)
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose())

  const workspace = store.prepare({
    path: fixture.mainPath, workspaceRoot: fixture.workspaceRoot, line: 1, column: 1,
  }, true)
  assert.equal(workspace.projectMembership.status, "complete")
  assert.equal(workspace.projectMembership.paths.includes(nestedPath), true)
  assert.equal(workspace.projectMembership.paths.includes(fixture.desktopPath), false)
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

test("a complete membership refresh does not repeatedly canonicalize every regular source leaf", (t) => {
  const fixture = targetFixture(t)
  fs.writeFileSync(fixture.mainPath, "export const page = 1\n")
  for (let index = 0; index < 96; index++) {
    fs.writeFileSync(path.join(path.dirname(fixture.mainPath), `Source${index}.ets`),
      `export const source${index} = ${index}\n`)
  }
  const { SemanticDocumentStore } = buildDocumentStoreDriver(fixture.root)
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose())
  const position = { path: fixture.mainPath, workspaceRoot: fixture.workspaceRoot, line: 1, column: 1 }
  const baseline = store.prepare(position, true).projectMembership
  const members = new Set(baseline.paths)
  assert.equal(baseline.status, "complete")
  assert.equal(members.size, 99)
  const original = fs.realpathSync.native
  let leafLookups = 0
  t.mock.method(fs.realpathSync, "native", (candidate, ...args) => {
    if (members.has(path.resolve(candidate))) leafLookups++
    return original(candidate, ...args)
  })
  assert.deepEqual(store.refreshProjectMembership(fixture.workspaceRoot), { changed: false, removedPaths: [] })
  assert.deepEqual(store.prepare(position, true).projectMembership, baseline)
  assert.ok(leafLookups <= members.size,
    `complete ${members.size}-member refresh performed ${leafLookups} physical leaf lookups`)
})

test("a directory retarget during enumeration cannot certify an inactive source member", (t) => {
  const fixture = targetFixture(t)
  fs.writeFileSync(fixture.mainPath, "export const page = 1\n")
  const sourceDirectory = path.dirname(fixture.mainPath)
  const originalDirectory = `${sourceDirectory}-original`
  const inactiveDirectory = path.dirname(fixture.desktopPath)
  fs.writeFileSync(path.join(inactiveDirectory, path.basename(fixture.mainPath)), "class InactiveRetarget {}\n")
  const { SemanticDocumentStore } = buildDocumentStoreDriver(fixture.root)
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose())
  const position = { path: fixture.tabletPath, workspaceRoot: fixture.workspaceRoot, line: 1, column: 1 }
  const baseline = store.prepare(position, true).projectMembership
  assert.equal(baseline.status, "complete")
  let retargeted = false
  const open = fs.opendirSync
  t.mock.method(fs, "opendirSync", (directory, ...args) => {
    const handle = open(directory, ...args)
    if (path.resolve(directory) !== sourceDirectory) return handle
    const read = handle.readSync.bind(handle)
    handle.readSync = () => {
      const entry = read()
      if (entry?.isFile() && !retargeted) {
        fs.renameSync(sourceDirectory, originalDirectory)
        fs.symlinkSync(inactiveDirectory, sourceDirectory, "dir")
        retargeted = true
      }
      return entry
    }
    return handle
  })
  store.refreshProjectMembership(fixture.workspaceRoot)
  const current = store.prepare(position, true).projectMembership
  assert.equal(retargeted, true)
  assert.ok(current.status === "partial" || !current.paths.includes(fixture.mainPath),
    "a complete catalog must not admit the old lexical path now pointing into an inactive target")
  fs.unlinkSync(sourceDirectory)
  fs.renameSync(originalDirectory, sourceDirectory)
  store.refreshProjectMembership(fixture.workspaceRoot)
  const recovered = store.prepare(position, true).projectMembership
  assert.equal(recovered.status, "complete")
  assert.deepEqual(recovered.paths, baseline.paths)
})

test("a source container retarget after its children close cannot certify the old membership", (t) => {
  const fixture = targetFixture(t)
  fs.writeFileSync(fixture.mainPath, "export const page = 1\n")
  const sourceContainer = path.join(fixture.moduleRoot, "src")
  const originalContainer = `${sourceContainer}-original`
  const undeclaredContainer = path.join(fixture.workspaceRoot, "ghost-source")
  fs.mkdirSync(undeclaredContainer)
  const { SemanticDocumentStore } = buildDocumentStoreDriver(fixture.root)
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose())
  const position = { path: fixture.mainPath, workspaceRoot: fixture.workspaceRoot, line: 1, column: 1 }
  const baseline = store.prepare(position, true).projectMembership
  let retargeted = false
  const open = fs.opendirSync
  t.mock.method(fs, "opendirSync", (directory, ...args) => {
    const handle = open(directory, ...args)
    if (path.resolve(directory) !== fixture.moduleRoot) return handle
    const close = handle.closeSync.bind(handle)
    handle.closeSync = () => {
      close()
      if (!retargeted) {
        fs.renameSync(sourceContainer, originalContainer)
        fs.symlinkSync(undeclaredContainer, sourceContainer, "dir")
        retargeted = true
      }
    }
    return handle
  })
  store.refreshProjectMembership(fixture.workspaceRoot)
  fs.unlinkSync(sourceContainer)
  fs.renameSync(originalContainer, sourceContainer)
  assert.equal(retargeted, true)
  const uncertain = store.prepare(position, true).projectMembership
  assert.equal(uncertain.status, "partial", "final container witnesses must reject a late retarget")
  store.refreshProjectMembership(fixture.workspaceRoot)
  const recovered = store.prepare(position, true).projectMembership
  assert.equal(recovered.status, "complete")
  assert.deepEqual(recovered.paths, baseline.paths)
})

test("a complete membership refresh bounds whole-directory resolution without dropping source directories", (t) => {
  const fixture = targetFixture(t)
  fs.writeFileSync(fixture.mainPath, "export const page = 1\n")
  for (let index = 0; index < 48; index++) {
    const source = path.join(path.dirname(fixture.mainPath), `group-${index}`, "Source.ets")
    fs.mkdirSync(path.dirname(source))
    fs.writeFileSync(source, `export const source${index} = ${index}\n`)
  }
  const { SemanticDocumentStore } = buildDocumentStoreDriver(fixture.root)
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose())
  const position = { path: fixture.mainPath, workspaceRoot: fixture.workspaceRoot, line: 1, column: 1 }
  const baseline = store.prepare(position, true).projectMembership
  assert.equal(baseline.status, "complete")
  assert.equal(baseline.paths.length, 51)
  const opened = new Set(), resolutions = new Map()
  const realpath = fs.realpathSync.native, open = fs.opendirSync
  t.mock.method(fs.realpathSync, "native", (candidate, ...args) => {
    const resolved = path.resolve(candidate)
    resolutions.set(resolved, (resolutions.get(resolved) ?? 0) + 1)
    return realpath(candidate, ...args)
  })
  t.mock.method(fs, "opendirSync", (directory, ...args) => {
    opened.add(path.resolve(directory))
    return open(directory, ...args)
  })
  assert.deepEqual(store.refreshProjectMembership(fixture.workspaceRoot), { changed: false, removedPaths: [] })
  const directoryResolutions = [...opened].reduce((total, directory) => total + (resolutions.get(directory) ?? 0), 0)
  assert.deepEqual(store.prepare(position, true).projectMembership, baseline)
  assert.ok(directoryResolutions <= opened.size + 6,
    `complete ${baseline.paths.length}-source refresh resolved ${opened.size} directories ${directoryResolutions} times`)
})

test("replacing a source directory at the same physical path cannot certify an omitted new member", (t) => {
  const fixture = targetFixture(t)
  fs.writeFileSync(fixture.mainPath, "export const page = 1\n")
  const sourceDirectory = path.dirname(fixture.mainPath), originalDirectory = path.join(fixture.root, "original-source-directory")
  const newSource = path.join(sourceDirectory, "NewCaller.ets")
  const { SemanticDocumentStore } = buildDocumentStoreDriver(fixture.root)
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose())
  const position = { path: fixture.tabletPath, workspaceRoot: fixture.workspaceRoot, line: 1, column: 1 }
  const baseline = store.prepare(position, true).projectMembership
  const open = fs.opendirSync
  let replaced = false
  t.mock.method(fs, "opendirSync", (directory, ...args) => {
    const handle = open(directory, ...args)
    if (path.resolve(directory) !== sourceDirectory) return handle
    const read = handle.readSync.bind(handle)
    handle.readSync = () => {
      const entry = read()
      if (entry?.isFile() && !replaced) {
        fs.renameSync(sourceDirectory, originalDirectory)
        fs.mkdirSync(sourceDirectory)
        fs.writeFileSync(fixture.mainPath, "export const page = 1\n")
        fs.writeFileSync(newSource, "export const newCaller = 1\n")
        replaced = true
      }
      return entry
    }
    return handle
  })
  store.refreshProjectMembership(fixture.workspaceRoot)
  const uncertain = store.prepare(position, true).projectMembership
  assert.equal(replaced, true)
  assert.equal(uncertain.status, "partial", "the old open directory cannot certify a complete new tree")
  store.refreshProjectMembership(fixture.workspaceRoot)
  const recovered = store.prepare(position, true).projectMembership
  assert.equal(recovered.status, "complete")
  assert.deepEqual(recovered.paths, [...baseline.paths, newSource].sort())
})

test("a complete membership refresh bounds repeated rooted path comparisons without changing its members", (t) => {
  const fixture = targetFixture(t)
  fs.writeFileSync(fixture.mainPath, "export const page = 1\n")
  for (let index = 0; index < 96; index++) {
    fs.writeFileSync(path.join(path.dirname(fixture.mainPath), `Source${index}.ets`),
      `export const source${index} = ${index}\n`)
  }
  const { SemanticDocumentStore } = buildDocumentStoreDriver(fixture.root)
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose())
  const position = { path: fixture.mainPath, workspaceRoot: fixture.workspaceRoot, line: 1, column: 1 }
  const baseline = store.prepare(position, true).projectMembership
  assert.equal(baseline.status, "complete")
  assert.equal(baseline.paths.length, 99)
  const relative = path.relative
  let comparisons = 0
  t.mock.method(path, "relative", (...args) => { comparisons++; return relative(...args) })
  assert.deepEqual(store.refreshProjectMembership(fixture.workspaceRoot), { changed: false, removedPaths: [] })
  const refreshComparisons = comparisons
  assert.deepEqual(store.prepare(position, true).projectMembership, baseline)
  assert.ok(refreshComparisons <= baseline.paths.length * 3 + 32,
    `complete ${baseline.paths.length}-source refresh compared ${refreshComparisons} rooted path pairs`)
})

test("a source directory sharing only an active root name prefix remains outside membership", (t) => {
  const fixture = targetFixture(t)
  fs.writeFileSync(fixture.mainPath, "export const page = 1\n")
  const shadowRoot = path.join(fixture.moduleRoot, "src", "main-shadow")
  const shadowPath = path.join(shadowRoot, "Shadow.ets")
  fs.mkdirSync(shadowRoot)
  fs.writeFileSync(shadowPath, "class OutsidePrefix {}\n")
  const { SemanticDocumentStore } = buildDocumentStoreDriver(fixture.root)
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose())
  const membership = store.prepare({ path: fixture.mainPath, workspaceRoot: fixture.workspaceRoot,
    line: 1, column: 1 }, true).projectMembership
  assert.equal(membership.status, "complete")
  assert.equal(membership.paths.length, 3)
  assert.equal(membership.paths.includes(fixture.mainPath), true)
  assert.equal(membership.paths.includes(fixture.tabletPath), true)
  assert.equal(membership.paths.includes(shadowPath), false)
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
