import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test, { after } from "node:test"
import { buildDocumentStoreDriver } from "./support/build-document-store-driver.mjs"
import { createWorkspace, syncPosition } from "./support/project-file-set-fixture.mjs"

const driverRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-batched-store-driver-"))
after(() => fs.rmSync(driverRoot, { recursive: true, force: true }))
const { SemanticDocumentStore } = buildDocumentStoreDriver(driverRoot)

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
      physicalPaths: [...paths],
      workspaceRoot: workspace,
      creationCandidatePaths: [],
      creationCandidatesComplete: true,
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

test("batches watched exact invalidation across dependency closures", (t) => {
  const workspace = createWorkspace(t, "watched-batched-invalidation", {
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
    const originalSome = paths.some
    paths.some = function some(...args) {
      closureScans += 1
      return originalSome.apply(this, args)
    }
    store.dependencyClosures.set(path.join(workspace, `Owner${index}.ets`), {
      contentGeneration: 1,
      paths,
      physicalPaths: [...paths],
      workspaceRoot: workspace,
      creationCandidatePaths: [],
      creationCandidatesComplete: true,
    })
  }
  fs.writeFileSync(firstPath, "export const first = 100\n", "utf8")
  fs.writeFileSync(secondPath, "export const second = 200\n", "utf8")

  const originalRealpathNative = fs.realpathSync.native
  const realpathPaths = []
  fs.realpathSync.native = (...args) => {
    realpathPaths.push(String(args[0]))
    return originalRealpathNative(...args)
  }
  try {
    store.workspaceFilesChanged({
      rootPath: workspace,
      rootDirty: false,
      changes: [
        { path: firstPath, kind: "changed" },
        { path: secondPath, kind: "changed" },
      ],
    })
  } finally {
    fs.realpathSync.native = originalRealpathNative
  }

  assert.equal(
    closureScans,
    3,
    "one watched batch must inspect each dependency closure at most once",
  )
  assert.deepEqual(
    realpathPaths,
    [workspace, firstPath, secondPath, workspace],
    "canonicalize root/sources once, then independently fence their one shared directory at publication",
  )
})
