import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { buildDocumentStoreDriver } from "./support/build-document-store-driver.mjs"

test("membership cancellation closes enumeration, preserves cancellation, and retries completely", (t) => {
  const workspace = createWorkspace(t, {
    "Main.ets": "export const main = 1\n",
    "Other.ets": "export const other = 2\n",
  })
  const mainPath = path.join(workspace, "Main.ets")
  const otherPath = path.join(workspace, "Other.ets")
  const cancellation = new Error("cancel membership enumeration")
  const cleanupFailure = new Error("enumerator cleanup failed")
  let cancellationArmed = true
  let cancelled = false
  let enumerationRuns = 0
  let enumerationCloses = 0
  const driverRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-document-store-driver-"))
  t.after(() => fs.rmSync(driverRoot, { recursive: true, force: true }))
  const { SemanticDocumentStore } = buildDocumentStoreDriver(driverRoot)
  const store = new SemanticDocumentStore({
    operationControl: {
      checkpoint() {
        if (cancelled) throw cancellation
      },
    },
    enumerateWorkspaceSources: function* enumerate() {
      enumerationRuns += 1
      let cancelThisRun = false
      try {
        yield mainPath
        if (cancellationArmed) {
          cancelThisRun = true
          cancelled = true
        }
        yield otherPath
      } finally {
        enumerationCloses += 1
        if (cancelThisRun) throw cleanupFailure
      }
    },
  })
  t.after(() => store.dispose())
  const position = syncPosition(store, workspace, mainPath)

  assert.throws(
    () => store.prepare(position, true),
    (error) => error === cancellation,
  )
  assert.equal(enumerationCloses, 1, "cancellation must close the active iterator")
  cancellationArmed = false
  cancelled = false

  const retried = store.prepare(position, true)

  assert.equal(enumerationRuns, 2, "a cancelled scan must not publish a cache entry")
  assert.equal(enumerationCloses, 2)
  assert.equal(retried.projectMembership.status, "complete")
  assert.deepEqual(retried.projectMembership.paths, [mainPath, otherPath].sort())
})

test("cancelled membership refresh keeps the old snapshot authoritative and retries the delta", (t) => {
  const originalTarget = "export const target = 1\n"
  const changedTarget = "export const target = 200\n"
  const workspace = createWorkspace(t, {
    "Main.ets": "export const main = 1\n",
    "Target.ets": originalTarget,
  })
  const mainPath = path.join(workspace, "Main.ets")
  const targetPath = path.join(workspace, "Target.ets")
  const cancellation = new Error("cancel membership refresh")
  let cancelAfterScan = false
  let cancelled = false
  let enumerationRuns = 0
  const { SemanticDocumentStore } = buildDocumentStoreDriver(workspace)
  const store = new SemanticDocumentStore({
    operationControl: {
      checkpoint() {
        if (cancelled) throw cancellation
      },
    },
    enumerateWorkspaceSources: function* enumerate() {
      enumerationRuns += 1
      try {
        yield mainPath
        yield targetPath
      } finally {
        if (cancelAfterScan) cancelled = true
      }
    },
  })
  t.after(() => store.dispose())
  const position = syncPosition(store, workspace, mainPath)
  const initial = store.prepare(position, true)
  assert.equal(documentContent(initial, targetPath), originalTarget)
  assert.equal(enumerationRuns, 1)

  fs.writeFileSync(targetPath, changedTarget, "utf8")
  cancelAfterScan = true
  assert.throws(
    () => store.refreshProjectMembership(workspace),
    (error) => error === cancellation,
  )

  cancelAfterScan = false
  cancelled = false
  const afterCancellation = store.prepare(position, true)
  assert.equal(enumerationRuns, 2, "prepare must continue using the old cached membership")
  assert.equal(afterCancellation.projectMembership.revision, initial.projectMembership.revision)
  assert.deepEqual(afterCancellation.changedPaths, [])
  assert.equal(afterCancellation.contentRevision, initial.contentRevision)

  assert.deepEqual(store.refreshProjectMembership(workspace), {
    changed: true,
    removedPaths: [],
  })
  const retried = store.prepare(position, true)
  assert.equal(enumerationRuns, 3)
  assert.equal(documentContent(retried, targetPath), changedTarget)
  assert.deepEqual(retried.changedPaths, [targetPath])
  assert.ok(retried.contentRevision > initial.contentRevision)
})

test("default workspace walking cancels on non-source entries and closes every directory", (t) => {
  const workspace = createWorkspace(t, {
    "nested/notes.txt": "not a source file\n",
  })
  const mainPath = path.join(workspace, "Main.ets")
  const cancellation = new Error("cancel default workspace walk")
  const cleanupFailure = new Error("directory cleanup failed")
  const originalOpenDirectory = fs.opendirSync
  let cancelled = false
  let cancellationObserved = false
  let cleanupFailureObserved = false
  let directoryReads = 0
  let openedDirectories = 0
  let closedDirectories = 0
  fs.opendirSync = (directoryPath, ...args) => {
    const directory = originalOpenDirectory(directoryPath, ...args)
    const originalRead = directory.readSync.bind(directory)
    const originalClose = directory.closeSync.bind(directory)
    let closed = false
    directory.readSync = (...readArgs) => {
      const entry = originalRead(...readArgs)
      if (entry !== null && ++directoryReads === 2) cancelled = true
      return entry
    }
    directory.closeSync = (...closeArgs) => {
      if (!closed) {
        closed = true
        closedDirectories += 1
      }
      const result = originalClose(...closeArgs)
      if (cancellationObserved && !cleanupFailureObserved) {
        cleanupFailureObserved = true
        throw cleanupFailure
      }
      return result
    }
    openedDirectories += 1
    return directory
  }
  t.after(() => { fs.opendirSync = originalOpenDirectory })
  const driverRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-default-walk-driver-"))
  t.after(() => fs.rmSync(driverRoot, { recursive: true, force: true }))
  const { SemanticDocumentStore } = buildDocumentStoreDriver(driverRoot)
  const store = new SemanticDocumentStore({
    operationControl: {
      checkpoint() {
        if (!cancelled) return
        cancellationObserved = true
        throw cancellation
      },
    },
  })
  t.after(() => store.dispose())
  store.sync({
    path: mainPath,
    content: "export const unsavedMain = 1\n",
    documentVersion: 1,
    workspaceRoot: workspace,
  })
  const position = {
    path: mainPath,
    line: 1,
    column: 1,
    documentVersion: 1,
    workspaceRoot: workspace,
  }

  assert.throws(
    () => store.prepare(position, true),
    (error) => error === cancellation,
  )
  assert.equal(cleanupFailureObserved, true, "cancellation must occur before directory cleanup")
  assert.equal(openedDirectories, 2)
  assert.equal(closedDirectories, openedDirectories)

  cancelled = false
  const retried = store.prepare(position, true)
  assert.equal(retried.projectMembership.status, "complete")
  assert.deepEqual(retried.projectMembership.paths, [mainPath])
})

function createWorkspace(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-document-store-cancel-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, "utf8")
  }
  return root
}

function syncPosition(store, workspaceRoot, documentPath) {
  const content = fs.readFileSync(documentPath, "utf8")
  store.sync({
    path: documentPath,
    content,
    documentVersion: 1,
    workspaceRoot,
  })
  return {
    path: documentPath,
    line: 1,
    column: 1,
    documentVersion: 1,
    workspaceRoot,
  }
}

function documentContent(view, documentPath) {
  return view.documents.find((document) => document.path === documentPath)?.content
}
