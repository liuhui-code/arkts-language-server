import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test, { after } from "node:test"

import { buildDocumentStoreDriver } from "./support/build-document-store-driver.mjs"

const driverRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-document-store-driver-"))
after(() => fs.rmSync(driverRoot, { recursive: true, force: true }))
const { SemanticDocumentStore } = buildDocumentStoreDriver(driverRoot)

test("reuses the bounded source-path set for an unchanged canonical workspace", (t) => {
  const workspace = createWorkspace(t, "reuse", {
    "Main.ets": "export const main = 1\n",
    "Other.ets": "export const other = 2\n",
  })
  const workspaceAlias = `${workspace}-alias`
  fs.symlinkSync(workspace, workspaceAlias, "dir")
  t.after(() => fs.rmSync(workspaceAlias, { force: true }))
  const mainPath = path.join(workspaceAlias, "Main.ets")
  const otherPath = path.join(workspaceAlias, "Other.ets")
  const enumerationRoots = []
  const originalReadDirectory = fs.readdirSync
  let defaultDirectoryReads = 0
  fs.readdirSync = (...args) => {
    defaultDirectoryReads += 1
    return originalReadDirectory(...args)
  }
  t.after(() => { fs.readdirSync = originalReadDirectory })

  const store = new SemanticDocumentStore({
    enumerateWorkspaceSources(rootPath) {
      enumerationRoots.push(rootPath)
      return [mainPath, otherPath]
    },
  })
  t.after(() => store.dispose?.())
  const position = syncPosition(store, workspaceAlias, mainPath)

  const first = store.prepare(position, true)
  const readsAfterFirst = defaultDirectoryReads
  const second = store.prepare({ ...position, workspaceRoot: workspace }, true)

  assert.deepEqual(documentPaths(first), [mainPath, otherPath].sort())
  assert.deepEqual(documentPaths(second), documentPaths(first))
  assert.equal(
    defaultDirectoryReads,
    readsAfterFirst,
    "the second prepare must not walk the workspace again",
  )
  assert.deepEqual(enumerationRoots, [path.resolve(workspaceAlias)])
})

test("invalidates only the requested workspace source-path set", (t) => {
  const firstRoot = createWorkspace(t, "invalidate-first", {
    "Main.ets": "export const first = 1\n",
  })
  const secondRoot = createWorkspace(t, "invalidate-second", {
    "Main.ets": "export const second = 2\n",
  })
  const enumerationCounts = new Map()
  const store = new SemanticDocumentStore({
    enumerateWorkspaceSources(rootPath) {
      const identity = fs.realpathSync(rootPath)
      enumerationCounts.set(identity, (enumerationCounts.get(identity) ?? 0) + 1)
      return [path.join(rootPath, "Main.ets")]
    },
  })
  t.after(() => store.dispose?.())
  const firstPosition = syncPosition(store, firstRoot, path.join(firstRoot, "Main.ets"))
  const secondPosition = syncPosition(store, secondRoot, path.join(secondRoot, "Main.ets"))

  store.prepare(firstPosition, true)
  store.prepare(secondPosition, true)
  store.invalidate(firstRoot)
  store.prepare(firstPosition, true)
  store.prepare(secondPosition, true)

  assert.equal(enumerationCounts.get(fs.realpathSync(firstRoot)), 2)
  assert.equal(enumerationCounts.get(fs.realpathSync(secondRoot)), 1)
})

test("adds a newly opened source overlay to an already cached workspace", (t) => {
  const workspace = createWorkspace(t, "opened-overlay", {
    "Main.ets": "export const main = 1\n",
  })
  const mainPath = path.join(workspace, "Main.ets")
  const openedPath = path.join(workspace, "Unsaved.ets")
  let enumerationCount = 0
  const store = new SemanticDocumentStore({
    enumerateWorkspaceSources() {
      enumerationCount += 1
      return [mainPath]
    },
  })
  t.after(() => store.dispose?.())
  const mainPosition = syncPosition(store, workspace, mainPath)
  store.prepare(mainPosition, true)

  store.sync({
    path: openedPath,
    content: "export const unsaved = 2\n",
    documentVersion: 1,
    workspaceRoot: workspace,
  })
  const second = store.prepare(mainPosition, true)

  assert.equal(enumerationCount, 1)
  assert.deepEqual(documentPaths(second), [mainPath, openedPath].sort())
})

test("hard-bounds cached source paths per workspace", (t) => {
  const workspace = createWorkspace(t, "path-limit", {
    "Main.ets": "export const main = 1\n",
    "One.ets": "export const one = 1\n",
    "Two.ets": "export const two = 2\n",
  })
  const mainPath = path.join(workspace, "Main.ets")
  const onePath = path.join(workspace, "One.ets")
  const twoPath = path.join(workspace, "Two.ets")
  const store = new SemanticDocumentStore({
    enumerateWorkspaceSources: () => [mainPath, onePath, twoPath],
    projectFileSetLimits: { maxPaths: 2 },
  })
  t.after(() => store.dispose?.())

  const view = store.prepare(syncPosition(store, workspace, mainPath), true)

  assert.deepEqual(documentPaths(view), [mainPath, onePath].sort())
})

test("hard-bounds cached source-path bytes per workspace", (t) => {
  const workspace = createWorkspace(t, "byte-limit", {
    "Main.ets": "export const main = 1\n",
    "Other.ets": "export const other = 2\n",
  })
  const mainPath = path.join(workspace, "Main.ets")
  const otherPath = path.join(workspace, "Other.ets")
  const store = new SemanticDocumentStore({
    enumerateWorkspaceSources: () => [mainPath, otherPath],
    projectFileSetLimits: {
      maxPaths: 2,
      maxPathBytes: Buffer.byteLength(mainPath),
    },
  })
  t.after(() => store.dispose?.())

  const view = store.prepare(syncPosition(store, workspace, mainPath), true)

  assert.deepEqual(documentPaths(view), [mainPath])
})

test("hard-bounds cached workspace roots with least-recently-used eviction", (t) => {
  const roots = ["first", "second", "third"].map((name) => createWorkspace(t, `root-${name}`, {
    "Main.ets": `export const ${name} = 1\n`,
  }))
  const enumerationCounts = new Map()
  const store = new SemanticDocumentStore({
    enumerateWorkspaceSources(rootPath) {
      const identity = fs.realpathSync(rootPath)
      enumerationCounts.set(identity, (enumerationCounts.get(identity) ?? 0) + 1)
      return [path.join(rootPath, "Main.ets")]
    },
    projectFileSetLimits: { maxRoots: 2 },
  })
  t.after(() => store.dispose?.())
  const positions = roots.map((root) => (
    syncPosition(store, root, path.join(root, "Main.ets"))
  ))

  for (const position of positions) store.prepare(position, true)
  store.prepare(positions[0], true)

  assert.deepEqual(
    roots.map((root) => enumerationCounts.get(fs.realpathSync(root))),
    [2, 1, 1],
  )
})

test("dispose clears cached workspace source-path sets", (t) => {
  const workspace = createWorkspace(t, "dispose", {
    "Main.ets": "export const main = 1\n",
  })
  const mainPath = path.join(workspace, "Main.ets")
  let enumerationCount = 0
  const store = new SemanticDocumentStore({
    enumerateWorkspaceSources() {
      enumerationCount += 1
      return [mainPath]
    },
  })
  t.after(() => store.dispose?.())

  let position = syncPosition(store, workspace, mainPath)
  store.prepare(position, true)
  store.prepare(position, true)
  assert.equal(enumerationCount, 1)

  store.dispose()
  position = syncPosition(store, workspace, mainPath)
  store.prepare(position, true)

  assert.equal(enumerationCount, 2)
})

function createWorkspace(t, name, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `arkts-project-set-${name}-`))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, "utf8")
  }
  return root
}

function syncPosition(store, workspaceRoot, documentPath, version = 1) {
  const content = fs.readFileSync(documentPath, "utf8")
  store.sync({
    path: documentPath,
    content,
    documentVersion: version,
    workspaceRoot,
  })
  return {
    path: documentPath,
    line: 1,
    column: 1,
    documentVersion: version,
    workspaceRoot,
  }
}

function documentPaths(view) {
  return view.documents.map((document) => document.path).sort()
}
