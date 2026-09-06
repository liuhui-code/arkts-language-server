import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test, { after } from "node:test"

import { buildDocumentStoreDriver } from "./support/build-document-store-driver.mjs"

const driverRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-document-store-driver-"))
after(() => fs.rmSync(driverRoot, { recursive: true, force: true }))
const { SemanticDocumentStore } = buildDocumentStoreDriver(driverRoot)

test("reports complete project membership independently from the bounded document snapshot", (t) => {
  const files = Object.fromEntries(Array.from({ length: 300 }, (_value, index) => [
    `Source${String(index).padStart(3, "0")}.ets`,
    `export const source${index} = ${index}\n`,
  ]))
  files["Main.ets"] = "export const main = 1\n"
  const workspace = createWorkspace(t, "membership-complete", files)
  const mainPath = path.join(workspace, "Main.ets")
  const originalReadDirectory = fs.readdirSync
  const originalOpenDirectory = fs.opendirSync
  let directoryReads = 0
  fs.readdirSync = (...args) => {
    directoryReads += 1
    return originalReadDirectory(...args)
  }
  fs.opendirSync = (...args) => {
    directoryReads += 1
    return originalOpenDirectory(...args)
  }
  t.after(() => {
    fs.readdirSync = originalReadDirectory
    fs.opendirSync = originalOpenDirectory
  })
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  const position = syncPosition(store, workspace, mainPath)

  const first = store.prepare(position, true)
  const readsAfterFirst = directoryReads
  const second = store.prepare(position, true)

  assert.equal(first.projectMembership.status, "complete")
  assert.equal(first.projectMembership.paths.length, 301)
  assert.ok(first.projectMembership.paths.includes(mainPath))
  assert.equal(first.documents.length, 256)
  assert.ok(
    first.documents.reduce((total, document) => total + Buffer.byteLength(document.content), 0)
      <= 8 * 1024 * 1024,
  )
  assert.deepEqual(second.projectMembership, first.projectMembership)
  assert.equal(directoryReads, readsAfterFirst, "unchanged membership must not rescan")
  assert.ok(Number.isSafeInteger(first.projectMembership.revision))
  assert.ok(first.projectMembership.revision > 0)
})

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

test("refreshes membership identities without invalidating an unchanged warm cache", (t) => {
  const workspace = createWorkspace(t, "refresh-identity", {
    "Main.ets": "export const main = 1\n",
    "Other.ets": "export const other = 2\n",
  })
  const mainPath = path.join(workspace, "Main.ets")
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  const position = syncPosition(store, workspace, mainPath)
  const first = store.prepare(position, true)

  assert.deepEqual(store.refreshProjectMembership(workspace), {
    changed: false,
    removedPaths: [],
  })
  const second = store.prepare(position, true)
  assert.equal(second.projectMembership.revision, first.projectMembership.revision)
  assert.equal(second.state.documentCacheHit, true)
  assert.equal(second.resetTypeEngine, false)
})

test("does not infer removals from a partial membership refresh", (t) => {
  const workspace = createWorkspace(t, "refresh-partial", {
    "Main.ets": "export const main = 1\n",
    "Other.ets": "export const other = 2\n",
  })
  const mainPath = path.join(workspace, "Main.ets")
  const otherPath = path.join(workspace, "Other.ets")
  let partial = false
  const store = new SemanticDocumentStore({
    enumerateWorkspaceSources: function* enumerate() {
      yield mainPath
      if (partial) throw new Error("partial refresh")
      yield otherPath
    },
  })
  t.after(() => store.dispose?.())
  const position = syncPosition(store, workspace, mainPath)
  store.prepare(position, true)

  partial = true
  assert.deepEqual(store.refreshProjectMembership(workspace), {
    changed: true,
    removedPaths: [],
  })
  const refreshed = store.prepare(position, true)
  assert.equal(refreshed.projectMembership.status, "partial")
  assert.equal(refreshed.projectMembership.reason, "enumeration-error")
  assert.deepEqual(refreshed.removedPaths, [])
})

test("batches changed-source invalidation across dependency closures", (t) => {
  const workspace = createWorkspace(t, "refresh-batched-invalidation", {
    "Main.ets": "export const main = 1\n",
    "First.ets": "export const first = 1\n",
    "Second.ets": "export const second = 2\n",
  })
  const mainPath = path.join(workspace, "Main.ets")
  const firstPath = path.join(workspace, "First.ets")
  const secondPath = path.join(workspace, "Second.ets")
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  store.prepare(syncPosition(store, workspace, mainPath), true)

  let closureScans = 0
  for (let index = 0; index < 3; index += 1) {
    const paths = [path.join(workspace, `Unchanged${index}.ets`)]
    const originalIncludes = paths.includes
    const originalSome = paths.some
    paths.includes = function includes(...args) {
      closureScans += 1
      return originalIncludes.apply(this, args)
    }
    paths.some = function some(...args) {
      closureScans += 1
      return originalSome.apply(this, args)
    }
    store.dependencyClosures.set(path.join(workspace, `Owner${index}.ets`), {
      contentGeneration: 1,
      paths,
    })
  }
  fs.writeFileSync(firstPath, "export const first = 100\n", "utf8")
  fs.writeFileSync(secondPath, "export const second = 200\n", "utf8")

  store.refreshProjectMembership(workspace)

  assert.equal(
    closureScans,
    3,
    "one refresh batch must inspect each dependency closure at most once",
  )
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

test("advances membership revision across invalidation and watched membership changes", (t) => {
  const workspace = createWorkspace(t, "membership-revision", {
    "Main.ets": "export const main = 1\n",
    "Old.ets": "export const oldValue = 1\n",
  })
  const mainPath = path.join(workspace, "Main.ets")
  const oldPath = path.join(workspace, "Old.ets")
  const createdPath = path.join(workspace, "Created.ets")
  const rootDirtyPath = path.join(workspace, "RootDirty.ets")
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  const position = syncPosition(store, workspace, mainPath)

  const initial = store.prepare(position, true).projectMembership
  assert.equal(store.prepare(position, true).projectMembership.revision, initial.revision)

  store.invalidate(workspace)
  const invalidated = store.prepare(position, true).projectMembership
  assert.ok(invalidated.revision > initial.revision)

  fs.writeFileSync(createdPath, "export const created = 1\n", "utf8")
  store.workspaceFilesChanged({
    rootPath: workspace,
    rootDirty: false,
    changes: [{ path: createdPath, kind: "created" }],
  })
  const created = store.prepare(position, true).projectMembership
  assert.ok(created.revision > invalidated.revision)
  assert.ok(created.paths.includes(createdPath))

  fs.unlinkSync(oldPath)
  store.workspaceFilesChanged({
    rootPath: workspace,
    rootDirty: false,
    changes: [{ path: oldPath, kind: "deleted" }],
  })
  const deleted = store.prepare(position, true).projectMembership
  assert.ok(deleted.revision > created.revision)
  assert.ok(!deleted.paths.includes(oldPath))

  fs.writeFileSync(rootDirtyPath, "export const rootDirty = 1\n", "utf8")
  store.workspaceFilesChanged({ rootPath: workspace, rootDirty: true, changes: [] })
  const rebuilt = store.prepare(position, true).projectMembership
  assert.ok(rebuilt.revision > deleted.revision)
  assert.equal(rebuilt.status, "complete")
  assert.ok(rebuilt.paths.includes(rootDirtyPath), "root-dirty must not expose the old snapshot")
})

test("keeps membership revision stable when repeated deltas do not change its truth", (t) => {
  const workspace = createWorkspace(t, "membership-no-op-revision", {
    "Main.ets": "export const main = 1\n",
  })
  const mainPath = path.join(workspace, "Main.ets")
  const createdPath = path.join(workspace, "Created.ets")
  const unknownPath = path.join(workspace, "Unknown.ets")
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  const position = syncPosition(store, workspace, mainPath)
  const initial = store.prepare(position, true).projectMembership

  store.workspaceFilesChanged({
    rootPath: workspace,
    rootDirty: false,
    changes: [{ path: mainPath, kind: "created" }],
  })
  assert.equal(store.prepare(position, true).projectMembership.revision, initial.revision)

  fs.writeFileSync(createdPath, "export const created = 1\n", "utf8")
  store.workspaceFilesChanged({
    rootPath: workspace,
    rootDirty: false,
    changes: [{ path: createdPath, kind: "created" }],
  })
  const created = store.prepare(position, true).projectMembership
  assert.ok(created.revision > initial.revision)

  store.workspaceFilesChanged({
    rootPath: workspace,
    rootDirty: false,
    changes: [
      { path: createdPath, kind: "created" },
      { path: unknownPath, kind: "deleted" },
    ],
  })
  assert.equal(store.prepare(position, true).projectMembership.revision, created.revision)
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

test("prepares exact disk snapshot bytes without promoting them to an open overlay", (t) => {
  const firstTarget = "export function target(): string { return 'first' }\n"
  const secondTarget = "export function target(): string { return 'second' }\n"
  const workspace = createWorkspace(t, "exact-disk-snapshot", {
    "Main.ets": "export const main = 1\n",
    "Target.ets": firstTarget,
  })
  const mainPath = path.join(workspace, "Main.ets")
  const targetPath = path.join(workspace, "Target.ets")
  const store = new SemanticDocumentStore({ enumerateWorkspaceSources: () => [] })
  t.after(() => store.dispose?.())

  const authorityBytes = fs.readFileSync(targetPath, "utf8")
  fs.writeFileSync(targetPath, secondTarget, "utf8")
  const targetPosition = {
    path: targetPath,
    line: 1,
    column: 1,
    workspaceRoot: workspace,
  }
  const first = store.prepareDiskSnapshot(
    targetPosition,
    authorityBytes,
  )

  assert.equal(documentContent(first, targetPath), firstTarget)
  assert.equal(first.documents.find((document) => document.path === targetPath)?.overlay, false)
  assert.equal(
    first.documents.find((document) => document.path === targetPath)?.documentVersion,
    undefined,
  )

  const unrelated = store.prepare(
    { path: mainPath, line: 1, column: 1, workspaceRoot: workspace },
    false,
  )
  assert.equal(
    unrelated.documents.some((document) => document.path === targetPath),
    false,
    "a disk snapshot must not be retained as an open overlay",
  )

  const second = store.prepareDiskSnapshot(
    targetPosition,
    fs.readFileSync(targetPath, "utf8"),
  )
  assert.equal(documentContent(second, targetPath), secondTarget)
  assert.ok(second.state.contentGeneration > first.state.contentGeneration)

  const repeated = store.prepareDiskSnapshot(targetPosition, secondTarget)
  assert.equal(repeated.state.contentGeneration, second.state.contentGeneration)
  assert.equal(repeated.state.documentCacheHit, true)
})

test("rejects a disk snapshot above the single-file byte budget", (t) => {
  const workspace = createWorkspace(t, "disk-snapshot-byte-limit", {
    "Target.ets": "export const target = 1\n",
  })
  const targetPath = path.join(workspace, "Target.ets")
  const store = new SemanticDocumentStore({ enumerateWorkspaceSources: () => [] })
  t.after(() => store.dispose?.())

  assert.throws(
    () => store.prepareDiskSnapshot(
      { path: targetPath, line: 1, column: 1, workspaceRoot: workspace },
      "x".repeat(4 * 1024 * 1024 + 1),
    ),
    /Disk snapshot exceeds 4194304 bytes/,
  )
})

test("prepares every open overlay beyond the bounded disk snapshot window", (t) => {
  const fileCount = 260
  const files = Object.fromEntries(Array.from({ length: fileCount }, (_value, index) => [
    `Source${String(index).padStart(3, "0")}.ets`,
    `export const source${index} = "disk-${index}"\n`,
  ]))
  const workspace = createWorkspace(t, "pinned-overlays", files)
  const store = new SemanticDocumentStore({ enumerateWorkspaceSources: () => [] })
  t.after(() => store.dispose?.())
  const expected = new Map()

  for (let index = 0; index < fileCount; index += 1) {
    const documentPath = path.join(workspace, `Source${String(index).padStart(3, "0")}.ets`)
    const content = `export const source${index} = "overlay-${index}"\n`
    expected.set(documentPath, content)
    store.sync({
      path: documentPath,
      content,
      documentVersion: 1,
      workspaceRoot: workspace,
    })
  }

  const currentPath = path.join(workspace, "Source259.ets")
  const view = store.prepare(viewPathPosition(workspace, currentPath), false)
  const prepared = new Map(view.documents.map((document) => [document.path, document.content]))

  assert.equal(prepared.size, fileCount)
  assert.deepEqual(prepared, expected)
})

test("keeps open overlays pinned while another workspace is prepared", (t) => {
  const overlayCount = 513
  const overlayWorkspace = createWorkspace(t, "cross-root-overlays", {})
  const activeWorkspace = createWorkspace(t, "cross-root-active", {
    "Main.ets": "export const main = 1\n",
  })
  const activePath = path.join(activeWorkspace, "Main.ets")
  const store = new SemanticDocumentStore({ enumerateWorkspaceSources: () => [] })
  t.after(() => store.dispose?.())

  for (let index = 0; index < overlayCount; index += 1) {
    store.sync({
      path: path.join(overlayWorkspace, `Overlay${String(index).padStart(3, "0")}.ets`),
      content: `export const overlay${index} = ${index}\n`,
      documentVersion: 1,
      workspaceRoot: overlayWorkspace,
    })
  }
  const overlayCurrent = path.join(overlayWorkspace, "Overlay512.ets")
  const activePosition = syncPosition(store, activeWorkspace, activePath)

  store.prepare(activePosition, false)
  const overlayView = store.prepare(
    viewPathPosition(overlayWorkspace, overlayCurrent),
    false,
  )

  assert.equal(overlayView.documents.length, overlayCount)
  assert.equal(
    documentContent(overlayView, path.join(overlayWorkspace, "Overlay000.ets")),
    "export const overlay0 = 0\n",
  )
})

test("restores disk truth and advances the workspace content revision after close", (t) => {
  const diskTarget = "export class DiskTarget {}\n"
  const overlayTarget = "export class OverlayTarget {}\n"
  const workspace = createWorkspace(t, "close-overlay", {
    "Main.ets": "export const main = 1\n",
    "Target.ets": diskTarget,
  })
  const mainPath = path.join(workspace, "Main.ets")
  const targetPath = path.join(workspace, "Target.ets")
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  const position = syncPosition(store, workspace, mainPath)
  store.sync({
    path: targetPath,
    content: overlayTarget,
    documentVersion: 1,
    workspaceRoot: workspace,
  })

  const opened = store.prepare(position, true)
  assert.equal(documentContent(opened, targetPath), overlayTarget)

  store.close(targetPath)
  const closed = store.prepare(position, true)

  assert.equal(documentContent(closed, targetPath), diskTarget)
  assert.ok(closed.contentRevision > opened.contentRevision)
  assert.deepEqual(closed.changedPaths, [targetPath])

  const stable = store.prepare(position, true)
  assert.equal(stable.contentRevision, closed.contentRevision)
  assert.deepEqual(stable.changedPaths, [])
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

test("reports path-count-limited project membership as partial without exhausting enumeration", (t) => {
  const files = Object.fromEntries(Array.from({ length: 130 }, (_value, index) => [
    index === 0 ? "Main.ets" : `Source${String(index).padStart(3, "0")}.ets`,
    `export const source${index} = ${index}\n`,
  ]))
  const workspace = createWorkspace(t, "membership-path-limit", files)
  const mainPath = path.join(workspace, "Main.ets")
  const paths = Object.keys(files).map((fileName) => path.join(workspace, fileName))
  let yielded = 0
  const store = new SemanticDocumentStore({
    enumerateWorkspaceSources: function* enumerate() {
      for (const sourcePath of paths) {
        yielded += 1
        yield sourcePath
      }
    },
    projectFileSetLimits: { maxPaths: 128 },
  })
  t.after(() => store.dispose?.())

  const view = store.prepare(
    syncPosition(store, workspace, mainPath),
    true,
  )

  assert.equal(view.projectMembership.status, "partial")
  assert.equal(view.projectMembership.reason, "path-count-limit")
  assert.equal(view.projectMembership.paths.length, 128)
  assert.equal(yielded, 129, "enumeration must stop after the first path beyond the limit")

  const omittedPath = paths[paths.length - 1]
  const omittedContent = fs.readFileSync(omittedPath, "utf8")
  store.sync({
    path: omittedPath,
    content: omittedContent,
    documentVersion: 1,
    workspaceRoot: workspace,
  })
  store.sync({
    path: omittedPath,
    content: omittedContent,
    documentVersion: 1,
    workspaceRoot: workspace,
  })
  assert.equal(
    store.prepare(viewPathPosition(workspace, mainPath), true).projectMembership.revision,
    view.projectMembership.revision,
    "repeated opens beyond an unchanged partial limit must not create revision noise",
  )
})

test("bounds default disk enumeration at the first path beyond the membership limit", (t) => {
  const files = Object.fromEntries(Array.from({ length: 160 }, (_value, index) => [
    `sources/${String(index).padStart(3, "0")}/Source.ets`,
    `export const source${index} = ${index}\n`,
  ]))
  files["Main.ets"] = "export const main = 1\n"
  const workspace = createWorkspace(t, "bounded-default-enumeration", files)
  const mainPath = path.join(workspace, "Main.ets")
  const originalReadDirectory = fs.readdirSync
  const originalOpenDirectory = fs.opendirSync
  let directoryReads = 0
  fs.readdirSync = (...args) => {
    directoryReads += 1
    return originalReadDirectory(...args)
  }
  fs.opendirSync = (...args) => {
    directoryReads += 1
    return originalOpenDirectory(...args)
  }
  t.after(() => {
    fs.readdirSync = originalReadDirectory
    fs.opendirSync = originalOpenDirectory
  })
  const store = new SemanticDocumentStore({ projectFileSetLimits: { maxPaths: 128 } })
  t.after(() => store.dispose?.())

  const view = store.prepare(syncPosition(store, workspace, mainPath), true)

  assert.equal(view.projectMembership.status, "partial")
  assert.equal(view.projectMembership.reason, "path-count-limit")
  assert.ok(
    directoryReads <= 130,
    `default enumeration opened ${directoryReads} directories after membership was known partial`,
  )
})

test("fails project membership closed and closes an enumerator that throws", (t) => {
  const workspace = createWorkspace(t, "membership-enumeration-error", {
    "Main.ets": "export const main = 1\n",
  })
  const mainPath = path.join(workspace, "Main.ets")
  let iteratorClosed = false
  const store = new SemanticDocumentStore({
    enumerateWorkspaceSources: function* enumerate() {
      try {
        yield mainPath
        throw new Error("fixture enumeration failed")
      } finally {
        iteratorClosed = true
      }
    },
  })
  t.after(() => store.dispose?.())

  const view = store.prepare(syncPosition(store, workspace, mainPath), true)

  assert.equal(view.projectMembership.status, "partial")
  assert.equal(view.projectMembership.reason, "enumeration-error")
  assert.deepEqual(view.projectMembership.paths, [mainPath])
  assert.equal(iteratorClosed, true)
})

test("fails closed and releases open directories after nested disk enumeration errors", (t) => {
  const workspace = createWorkspace(t, "membership-disk-error", {
    "Main.ets": "export const main = 1\n",
    "nested/Other.ets": "export const other = 2\n",
  })
  const mainPath = path.join(workspace, "Main.ets")
  const failingDirectory = path.join(workspace, "nested")
  const originalOpenDirectory = fs.opendirSync
  let openedDirectories = 0
  let closedDirectories = 0
  fs.opendirSync = (directoryPath, ...args) => {
    if (path.resolve(directoryPath) === failingDirectory) {
      throw new Error("fixture nested directory failed")
    }
    const directory = originalOpenDirectory(directoryPath, ...args)
    const originalClose = directory.closeSync.bind(directory)
    let closed = false
    directory.closeSync = (...closeArgs) => {
      if (!closed) {
        closed = true
        closedDirectories += 1
      }
      return originalClose(...closeArgs)
    }
    openedDirectories += 1
    return directory
  }
  t.after(() => { fs.opendirSync = originalOpenDirectory })
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())

  const view = store.prepare(syncPosition(store, workspace, mainPath), true)

  assert.equal(view.projectMembership.status, "partial")
  assert.equal(view.projectMembership.reason, "enumeration-error")
  assert.equal(closedDirectories, openedDirectories)
})

test("hard-bounds cached source-path bytes per workspace", (t) => {
  const workspace = createWorkspace(t, "byte-limit", {
    "Main.ets": "export const main = 1\n",
    "Other.ets": "export const other = 2\n",
    "Third.ets": "export const third = 3\n",
  })
  const mainPath = path.join(workspace, "Main.ets")
  const otherPath = path.join(workspace, "Other.ets")
  const thirdPath = path.join(workspace, "Third.ets")
  let yielded = 0
  const store = new SemanticDocumentStore({
    enumerateWorkspaceSources: function* enumerate() {
      for (const sourcePath of [mainPath, otherPath, thirdPath]) {
        yielded += 1
        yield sourcePath
      }
    },
    projectFileSetLimits: {
      maxPaths: 3,
      maxPathBytes: Buffer.byteLength(mainPath),
    },
  })
  t.after(() => store.dispose?.())

  const view = store.prepare(syncPosition(store, workspace, mainPath), true)

  assert.deepEqual(documentPaths(view), [mainPath])
  assert.equal(view.projectMembership.status, "partial")
  assert.equal(view.projectMembership.reason, "path-byte-limit")
  assert.deepEqual(view.projectMembership.paths, [mainPath])
  assert.equal(yielded, 2, "enumeration must stop on the first byte-budget overflow")
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
  return viewPathPosition(workspaceRoot, documentPath, version)
}

function viewPathPosition(workspaceRoot, documentPath, version = 1) {
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

function documentContent(view, documentPath) {
  return view.documents.find((document) => document.path === documentPath)?.content
}
