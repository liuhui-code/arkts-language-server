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

test("refreshing a nested membership propagates a removed dependency to cross-root closure owners", (t) => {
  const outerRoot = createWorkspace(t, "refresh-cross-root-outer", {
    "Main.ets": "import { target } from './nested/Target'\nexport const main = target()\n",
    "nested/NestedMain.ets": "export const nested = 1\n",
    "nested/Target.ets": "export function target(): string { return 'target' }\n",
  })
  const nestedRoot = path.join(outerRoot, "nested")
  const unrelatedRoot = createWorkspace(t, "refresh-cross-root-unrelated", {
    "Main.ets": "import { kept } from './Kept'\nexport const main = kept()\n",
    "Kept.ets": "export function kept(): string { return 'kept' }\n",
  })
  const outerMain = path.join(outerRoot, "Main.ets")
  const nestedMain = path.join(nestedRoot, "NestedMain.ets")
  const targetPath = path.join(nestedRoot, "Target.ets")
  const unrelatedMain = path.join(unrelatedRoot, "Main.ets")
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  const outerPosition = syncPosition(store, outerRoot, outerMain)
  const nestedPosition = syncPosition(store, nestedRoot, nestedMain)
  const unrelatedPosition = syncPosition(store, unrelatedRoot, unrelatedMain)

  store.prepare(nestedPosition, true)
  store.prepare(outerPosition)
  store.prepare(unrelatedPosition)
  assert.equal(store.prepare(outerPosition).state.dependencyClosureCacheHit, true)
  assert.equal(store.prepare(unrelatedPosition).state.dependencyClosureCacheHit, true)

  fs.unlinkSync(targetPath)
  assert.deepEqual(store.refreshProjectMembership(nestedRoot), {
    changed: true,
    removedPaths: [targetPath],
  })
  const outerAfter = store.prepare(outerPosition)
  const nestedAfter = store.prepare(nestedPosition, true)
  const unrelatedAfter = store.prepare(unrelatedPosition)

  assert.deepEqual(outerAfter.removedPaths, [targetPath])
  assert.equal(outerAfter.contentRevision, 1)
  assert.equal(outerAfter.resetTypeEngine, true)
  assert.equal(outerAfter.state.dependencyClosureCacheHit, false)
  assert.equal(documentPaths(outerAfter).includes(targetPath), false)
  assert.deepEqual(nestedAfter.removedPaths, [targetPath])
  assert.equal(nestedAfter.contentRevision, 1)
  assert.equal(unrelatedAfter.contentRevision, 0)
  assert.equal(unrelatedAfter.resetTypeEngine, false)
  assert.equal(unrelatedAfter.state.dependencyClosureCacheHit, true)
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
  let realpathCalls = 0
  fs.realpathSync.native = (...args) => {
    realpathCalls += 1
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
  assert.equal(
    realpathCalls,
    3,
    "the root and each watched path must be canonicalized once per batch",
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

test("a watched source creation invalidates dependency resolution only in its workspace", (t) => {
  const firstRoot = createWorkspace(t, "created-resolution-first", {
    "Main.ets": "import { target } from './Target'\nexport const main = target()\n",
    "Target.ts": "export function target(): string { return 'ts' }\n",
  })
  const secondRoot = createWorkspace(t, "created-resolution-second", {
    "Main.ets": "import { kept } from './Kept'\nexport const main = kept()\n",
    "Kept.ets": "export function kept(): string { return 'kept' }\n",
  })
  const firstMain = path.join(firstRoot, "Main.ets")
  const secondMain = path.join(secondRoot, "Main.ets")
  const targetTsPath = path.join(firstRoot, "Target.ts")
  const targetEtsPath = path.join(firstRoot, "Target.ets")
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  const firstPosition = syncPosition(store, firstRoot, firstMain)
  const secondPosition = syncPosition(store, secondRoot, secondMain)
  store.prepare(firstPosition)
  store.prepare(secondPosition)
  assert.equal(store.prepare(firstPosition).state.dependencyClosureCacheHit, true)
  assert.equal(store.prepare(secondPosition).state.dependencyClosureCacheHit, true)

  fs.writeFileSync(
    targetEtsPath,
    "export function target(): string { return 'ets' }\n",
    "utf8",
  )
  store.workspaceFilesChanged({
    rootPath: firstRoot,
    rootDirty: false,
    changes: [{ path: targetEtsPath, kind: "created" }],
  })
  const firstAfterCreate = store.prepare(firstPosition)
  const untouchedSecond = store.prepare(secondPosition)

  assert.equal(firstAfterCreate.resetTypeEngine, true)
  assert.equal(firstAfterCreate.contentRevision, 1)
  assert.equal(firstAfterCreate.state.dependencyClosureCacheHit, false)
  assert.ok(documentPaths(firstAfterCreate).includes(targetEtsPath))
  assert.equal(documentPaths(firstAfterCreate).includes(targetTsPath), false)
  assert.equal(untouchedSecond.resetTypeEngine, false)
  assert.equal(untouchedSecond.contentRevision, 0)
  assert.equal(untouchedSecond.state.dependencyClosureCacheHit, true)
})

test("a nested watched create invalidates only dependency closures that can select it", (t) => {
  const outerRoot = createWorkspace(t, "created-cross-root-outer", {
    "Main.ets": "import { target } from './nested/Target'\nexport const main = target()\n",
    "nested/Target.ts": "export function target(): string { return 'ts' }\n",
  })
  const nestedRoot = path.join(outerRoot, "nested")
  const unrelatedRoot = createWorkspace(t, "created-cross-root-unrelated", {
    "Main.ets": "import { kept } from './Kept'\nexport const main = kept()\n",
    "Kept.ets": "export function kept(): string { return 'kept' }\n",
  })
  const outerMain = path.join(outerRoot, "Main.ets")
  const targetTsPath = path.join(nestedRoot, "Target.ts")
  const targetEtsPath = path.join(nestedRoot, "Target.ets")
  const unrelatedMain = path.join(unrelatedRoot, "Main.ets")
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  const outerPosition = syncPosition(store, outerRoot, outerMain)
  const unrelatedPosition = syncPosition(store, unrelatedRoot, unrelatedMain)

  store.prepare(outerPosition)
  store.prepare(unrelatedPosition)
  assert.equal(store.prepare(outerPosition).state.dependencyClosureCacheHit, true)
  assert.equal(store.prepare(unrelatedPosition).state.dependencyClosureCacheHit, true)

  fs.writeFileSync(
    targetEtsPath,
    "export function target(): string { return 'ets' }\n",
    "utf8",
  )
  store.workspaceFilesChanged({
    rootPath: nestedRoot,
    rootDirty: false,
    changes: [{ path: targetEtsPath, kind: "created" }],
  })
  const outerAfterCreate = store.prepare(outerPosition)
  const unrelatedAfterCreate = store.prepare(unrelatedPosition)

  assert.equal(outerAfterCreate.resetTypeEngine, true)
  assert.equal(outerAfterCreate.contentRevision, 1)
  assert.equal(outerAfterCreate.state.dependencyClosureCacheHit, false)
  assert.ok(documentPaths(outerAfterCreate).includes(targetEtsPath))
  assert.equal(documentPaths(outerAfterCreate).includes(targetTsPath), false)
  assert.equal(unrelatedAfterCreate.resetTypeEngine, false)
  assert.equal(unrelatedAfterCreate.contentRevision, 0)
  assert.equal(unrelatedAfterCreate.state.dependencyClosureCacheHit, true)
})

test("a watched symlink create matches its missing lexical resolution candidate", (t) => {
  const outerRoot = createWorkspace(t, "created-symlink-candidate", {
    "Main.ets": "import { target } from './nested/Target'\nexport const main = target()\n",
    "nested/Target.ts": "export function target(): string { return 'ts' }\n",
    "nested/Elsewhere.ets": "export function target(): string { return 'elsewhere' }\n",
  })
  const nestedRoot = path.join(outerRoot, "nested")
  const mainPath = path.join(outerRoot, "Main.ets")
  const targetTsPath = path.join(nestedRoot, "Target.ts")
  const targetEtsPath = path.join(nestedRoot, "Target.ets")
  const elsewherePath = path.join(nestedRoot, "Elsewhere.ets")
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  const position = syncPosition(store, outerRoot, mainPath)
  const warm = store.prepare(position)
  assert.equal(documentPaths(warm).includes(targetTsPath), true)
  assert.equal(
    [...store.dependencyClosures.values()].some((closure) => (
      closure.creationCandidatePaths.includes(targetEtsPath)
    )),
    true,
  )

  fs.symlinkSync(elsewherePath, targetEtsPath, "file")
  store.workspaceFilesChanged({
    rootPath: nestedRoot,
    rootDirty: false,
    changes: [{ path: targetEtsPath, kind: "created" }],
  })
  const changed = store.prepare(position)

  assert.equal(changed.resetTypeEngine, true)
  assert.equal(changed.state.dependencyClosureCacheHit, false)
  assert.equal(documentPaths(changed).includes(targetEtsPath), true)
  assert.equal(documentPaths(changed).includes(targetTsPath), false)
})

test("a watched create matches candidate casing only when the volume aliases that casing", (t) => {
  const workspace = createWorkspace(t, "created-case-candidate", {
    "Main.ets": "import { target } from './target'\nexport const main = target()\n",
    "target.ts": "export function target(): string { return 'ts' }\n",
  })
  const mainPath = path.join(workspace, "Main.ets")
  const fallbackPath = path.join(workspace, "target.ts")
  const lexicalCandidatePath = path.join(workspace, "target.ets")
  const watchedCreatedPath = path.join(workspace, "Target.ets")
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  const position = syncPosition(store, workspace, mainPath)
  const warm = store.prepare(position)
  assert.equal(documentPaths(warm).includes(fallbackPath), true)
  assert.equal(store.prepare(position).state.dependencyClosureCacheHit, true)

  fs.writeFileSync(
    watchedCreatedPath,
    "export function target(): string { return 'ets' }\n",
    "utf8",
  )
  const volumeAliasesCase = fs.existsSync(lexicalCandidatePath)
    && fs.statSync(lexicalCandidatePath).ino === fs.statSync(watchedCreatedPath).ino
  store.workspaceFilesChanged({
    rootPath: workspace,
    rootDirty: false,
    changes: [{ path: watchedCreatedPath, kind: "created" }],
  })
  const changed = store.prepare(position)

  if (volumeAliasesCase) {
    assert.equal(changed.resetTypeEngine, true)
    assert.equal(changed.state.dependencyClosureCacheHit, false)
    assert.equal(documentPaths(changed).includes(lexicalCandidatePath), true)
    assert.equal(documentPaths(changed).includes(fallbackPath), false)
  } else {
    assert.equal(changed.resetTypeEngine, false)
    assert.equal(changed.state.dependencyClosureCacheHit, true)
    assert.equal(documentPaths(changed).includes(fallbackPath), true)
    assert.equal(documentPaths(changed).includes(watchedCreatedPath), false)
  }
})

test("a nested watched delete propagates the exact removal only to closure owners", (t) => {
  const outerRoot = createWorkspace(t, "deleted-cross-root-outer", {
    "Main.ets": "import { target } from './nested/Target'\nexport const main = target()\n",
    "nested/Target.ets": "export function target(): string { return 'ets' }\n",
    "nested/Target.ts": "export function target(): string { return 'ts' }\n",
  })
  const nestedRoot = path.join(outerRoot, "nested")
  const unrelatedRoot = createWorkspace(t, "deleted-cross-root-unrelated", {
    "Main.ets": "import { kept } from './Kept'\nexport const main = kept()\n",
    "Kept.ets": "export function kept(): string { return 'kept' }\n",
  })
  const outerMain = path.join(outerRoot, "Main.ets")
  const targetEtsPath = path.join(nestedRoot, "Target.ets")
  const targetTsPath = path.join(nestedRoot, "Target.ts")
  const unrelatedMain = path.join(unrelatedRoot, "Main.ets")
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  const outerPosition = syncPosition(store, outerRoot, outerMain)
  const unrelatedPosition = syncPosition(store, unrelatedRoot, unrelatedMain)

  store.prepare(outerPosition)
  store.prepare(unrelatedPosition)
  assert.equal(store.prepare(outerPosition).state.dependencyClosureCacheHit, true)
  assert.equal(store.prepare(unrelatedPosition).state.dependencyClosureCacheHit, true)

  fs.unlinkSync(targetEtsPath)
  store.workspaceFilesChanged({
    rootPath: nestedRoot,
    rootDirty: false,
    changes: [{ path: targetEtsPath, kind: "deleted" }],
  })
  const outerAfterDelete = store.prepare(outerPosition)
  const unrelatedAfterDelete = store.prepare(unrelatedPosition)

  assert.equal(outerAfterDelete.resetTypeEngine, true)
  assert.equal(outerAfterDelete.contentRevision, 1)
  assert.deepEqual(outerAfterDelete.removedPaths, [targetEtsPath])
  assert.equal(outerAfterDelete.state.dependencyClosureCacheHit, false)
  assert.ok(documentPaths(outerAfterDelete).includes(targetTsPath))
  assert.equal(documentPaths(outerAfterDelete).includes(targetEtsPath), false)
  assert.equal(unrelatedAfterDelete.resetTypeEngine, false)
  assert.equal(unrelatedAfterDelete.contentRevision, 0)
  assert.deepEqual(unrelatedAfterDelete.removedPaths, [])
  assert.equal(unrelatedAfterDelete.state.dependencyClosureCacheHit, true)
})

test("a nested watched change propagates the exact delta only to closure owners", (t) => {
  const outerRoot = createWorkspace(t, "changed-cross-root-outer", {
    "Main.ets": "import { target } from './nested/Target'\nexport const main = target()\n",
    "nested/Target.ets": "export function target(): string { return 'old' }\n",
  })
  const nestedRoot = path.join(outerRoot, "nested")
  const unrelatedRoot = createWorkspace(t, "changed-cross-root-unrelated", {
    "Main.ets": "import { kept } from './Kept'\nexport const main = kept()\n",
    "Kept.ets": "export function kept(): string { return 'kept' }\n",
  })
  const outerMain = path.join(outerRoot, "Main.ets")
  const targetPath = path.join(nestedRoot, "Target.ets")
  const unrelatedMain = path.join(unrelatedRoot, "Main.ets")
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  const outerPosition = syncPosition(store, outerRoot, outerMain)
  const unrelatedPosition = syncPosition(store, unrelatedRoot, unrelatedMain)

  store.prepare(outerPosition)
  store.prepare(unrelatedPosition)
  fs.writeFileSync(
    targetPath,
    "export function target(): string { return 'new' }\n",
    "utf8",
  )
  store.workspaceFilesChanged({
    rootPath: nestedRoot,
    rootDirty: false,
    changes: [{ path: targetPath, kind: "changed" }],
  })
  const outerAfterChange = store.prepare(outerPosition)
  const unrelatedAfterChange = store.prepare(unrelatedPosition)

  assert.equal(outerAfterChange.resetTypeEngine, true)
  assert.equal(outerAfterChange.contentRevision, 1)
  assert.deepEqual(outerAfterChange.changedPaths, [targetPath])
  assert.equal(outerAfterChange.state.dependencyClosureCacheHit, false)
  assert.equal(documentContent(outerAfterChange, targetPath)?.includes("'new'"), true)
  assert.equal(unrelatedAfterChange.resetTypeEngine, false)
  assert.equal(unrelatedAfterChange.contentRevision, 0)
  assert.deepEqual(unrelatedAfterChange.changedPaths, [])
  assert.equal(unrelatedAfterChange.state.dependencyClosureCacheHit, true)
})

test("a watched source change keeps exact invalidation without resetting either workspace", (t) => {
  const firstRoot = createWorkspace(t, "changed-resolution-first", {
    "Main.ets": "import { target } from './Target'\nexport const main = target()\n",
    "Target.ets": "export function target(): string { return 'old' }\n",
  })
  const secondRoot = createWorkspace(t, "changed-resolution-second", {
    "Main.ets": "import { kept } from './Kept'\nexport const main = kept()\n",
    "Kept.ets": "export function kept(): string { return 'kept' }\n",
  })
  const firstMain = path.join(firstRoot, "Main.ets")
  const secondMain = path.join(secondRoot, "Main.ets")
  const targetPath = path.join(firstRoot, "Target.ets")
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  const firstPosition = syncPosition(store, firstRoot, firstMain)
  const secondPosition = syncPosition(store, secondRoot, secondMain)
  store.prepare(firstPosition)
  store.prepare(secondPosition)

  fs.writeFileSync(
    targetPath,
    "export function target(): string { return 'new' }\n",
    "utf8",
  )
  store.workspaceFilesChanged({
    rootPath: firstRoot,
    rootDirty: false,
    changes: [{ path: targetPath, kind: "changed" }],
  })
  const firstAfterChange = store.prepare(firstPosition)
  const untouchedSecond = store.prepare(secondPosition)

  assert.equal(firstAfterChange.resetTypeEngine, false)
  assert.deepEqual(firstAfterChange.changedPaths, [targetPath])
  assert.equal(firstAfterChange.state.dependencyClosureCacheHit, false)
  assert.equal(documentContent(firstAfterChange, targetPath)?.includes("'new'"), true)
  assert.equal(untouchedSecond.resetTypeEngine, false)
  assert.deepEqual(untouchedSecond.changedPaths, [])
  assert.equal(untouchedSecond.state.dependencyClosureCacheHit, true)
})

test("a physical watched change invalidates a cached symlink dependency identity", (t) => {
  const workspace = createWorkspace(t, "changed-symlink-identity", {
    "Main.ets": "import { target } from './Alias'\nexport const main = target()\n",
    "Target.ets": "export function target(): string { return 'old' }\n",
  })
  const mainPath = path.join(workspace, "Main.ets")
  const targetPath = path.join(workspace, "Target.ets")
  const aliasPath = path.join(workspace, "Alias.ets")
  fs.symlinkSync(targetPath, aliasPath, "file")
  const stableTimestamp = new Date("2020-01-02T03:04:05.000Z")
  fs.utimesSync(targetPath, stableTimestamp, stableTimestamp)
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  const position = syncPosition(store, workspace, mainPath)
  const warm = store.prepare(position)
  assert.equal(documentContent(warm, aliasPath)?.includes(": string"), true)

  fs.writeFileSync(
    targetPath,
    "export function target(): number { return 12345 }\n",
    "utf8",
  )
  fs.utimesSync(targetPath, stableTimestamp, stableTimestamp)
  store.workspaceFilesChanged({
    rootPath: workspace,
    rootDirty: false,
    changes: [{ path: targetPath, kind: "changed" }],
  })
  const changed = store.prepare(position)

  assert.equal(documentContent(changed, aliasPath)?.includes(": number"), true)
  assert.deepEqual(changed.changedPaths, [targetPath, aliasPath])
  assert.equal(changed.state.dependencyClosureCacheHit, false)
})

test("a watched overlay path still invalidates non-overlay physical aliases", (t) => {
  const oldDiskContent = "export function target(): string { return 'x' }\n"
  const newDiskContent = "export function target(): number { return 123 }\n"
  const overlayContent = "export function target(): boolean { return true }\n"
  assert.equal(Buffer.byteLength(newDiskContent), Buffer.byteLength(oldDiskContent))
  const workspace = createWorkspace(t, "changed-overlay-alias", {
    "Main.ets": "import { target } from './Alias'\nexport const main = target()\n",
    "Target.ets": oldDiskContent,
  })
  const mainPath = path.join(workspace, "Main.ets")
  const targetPath = path.join(workspace, "Target.ets")
  const aliasPath = path.join(workspace, "Alias.ets")
  fs.symlinkSync(targetPath, aliasPath, "file")
  const stableTimestamp = new Date("2020-01-02T03:04:05.000Z")
  fs.utimesSync(targetPath, stableTimestamp, stableTimestamp)
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  store.sync({
    path: targetPath,
    content: overlayContent,
    documentVersion: 1,
    workspaceRoot: workspace,
  })
  const position = syncPosition(store, workspace, mainPath)
  const warm = store.prepare(position)
  assert.equal(documentContent(warm, targetPath), overlayContent)
  assert.equal(documentContent(warm, aliasPath), oldDiskContent)

  fs.writeFileSync(targetPath, newDiskContent, "utf8")
  fs.utimesSync(targetPath, stableTimestamp, stableTimestamp)
  store.workspaceFilesChanged({
    rootPath: workspace,
    rootDirty: false,
    changes: [{ path: targetPath, kind: "changed" }],
  })
  const changed = store.prepare(position)

  assert.equal(documentContent(changed, targetPath), overlayContent)
  assert.equal(documentContent(changed, aliasPath), newDiskContent)
  assert.deepEqual(changed.changedPaths, [aliasPath])
  assert.equal(changed.resetTypeEngine, true)
  assert.equal(changed.state.dependencyClosureCacheHit, false)
})

test("a watched change matches a dependency through a case-insensitive path alias", (t) => {
  const workspace = createWorkspace(t, "changed-case-identity", {
    "Main.ets": "import { target } from './target'\nexport const main = target()\n",
    "Target.ets": "export function target(): string { return 'old' }\n",
  })
  const mainPath = path.join(workspace, "Main.ets")
  const targetPath = path.join(workspace, "Target.ets")
  const aliasPath = path.join(workspace, "target.ets")
  if (!fs.existsSync(aliasPath)) fs.symlinkSync(targetPath, aliasPath, "file")
  const stableTimestamp = new Date("2020-01-02T03:04:05.000Z")
  fs.utimesSync(targetPath, stableTimestamp, stableTimestamp)
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  const position = syncPosition(store, workspace, mainPath)
  const warm = store.prepare(position)
  assert.equal(documentContent(warm, aliasPath)?.includes(": string"), true)

  fs.writeFileSync(
    targetPath,
    "export function target(): number { return 12345 }\n",
    "utf8",
  )
  fs.utimesSync(targetPath, stableTimestamp, stableTimestamp)
  store.workspaceFilesChanged({
    rootPath: workspace,
    rootDirty: false,
    changes: [{ path: targetPath, kind: "changed" }],
  })
  const changed = store.prepare(position)

  assert.equal(documentContent(changed, aliasPath)?.includes(": number"), true)
  assert.deepEqual(changed.changedPaths, [targetPath, aliasPath])
  assert.equal(changed.resetTypeEngine, true)
})

test("a deleted symlink keeps lexical invalidation after physical identity disappears", (t) => {
  const workspace = createWorkspace(t, "deleted-symlink-identity", {
    "Main.ets": "import { target } from './Alias'\nexport const main = target()\n",
    "Target.ets": "export function target(): string { return 'target' }\n",
  })
  const mainPath = path.join(workspace, "Main.ets")
  const targetPath = path.join(workspace, "Target.ets")
  const aliasPath = path.join(workspace, "Alias.ets")
  fs.symlinkSync(targetPath, aliasPath, "file")
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  const position = syncPosition(store, workspace, mainPath)
  assert.equal(documentPaths(store.prepare(position)).includes(aliasPath), true)

  fs.unlinkSync(aliasPath)
  store.workspaceFilesChanged({
    rootPath: workspace,
    rootDirty: false,
    changes: [{ path: aliasPath, kind: "deleted" }],
  })
  const changed = store.prepare(position)

  assert.equal(changed.state.dependencyClosureCacheHit, false)
  assert.equal(documentPaths(changed).includes(aliasPath), false)
  assert.deepEqual(changed.removedPaths, [aliasPath])
})

test("a root-dirty event invalidates both sides of a retargeted workspace symlink", (t) => {
  const physicalA = createWorkspace(t, "dirty-retarget-a", {
    "Main.ets": "export const value = 'old'\n",
  })
  const physicalB = createWorkspace(t, "dirty-retarget-b", {
    "Main.ets": "export const value = 'new'\n",
  })
  const unrelatedRoot = createWorkspace(t, "dirty-retarget-unrelated", {
    "Main.ets": "export const unrelated = true\n",
  })
  const aliasRoot = `${physicalA}-alias`
  fs.symlinkSync(physicalA, aliasRoot, "dir")
  t.after(() => fs.rmSync(aliasRoot, { force: true }))
  const aliasMain = path.join(aliasRoot, "Main.ets")
  const physicalAMain = path.join(physicalA, "Main.ets")
  const unrelatedMain = path.join(unrelatedRoot, "Main.ets")
  const stableTimestamp = new Date("2020-01-02T03:04:05.000Z")
  fs.utimesSync(physicalAMain, stableTimestamp, stableTimestamp)
  fs.utimesSync(path.join(physicalB, "Main.ets"), stableTimestamp, stableTimestamp)
  assert.equal(
    fs.statSync(physicalAMain).size,
    fs.statSync(path.join(physicalB, "Main.ets")).size,
    "the regression requires a colliding size/mtime fingerprint",
  )
  const enumerationCounts = new Map()
  const store = new SemanticDocumentStore({
    enumerateWorkspaceSources(rootPath) {
      const physicalRoot = fs.realpathSync(rootPath)
      incrementCount(enumerationCounts, physicalRoot)
      return [path.join(rootPath, "Main.ets")]
    },
  })
  t.after(() => store.dispose?.())
  const aliasPosition = viewPathPosition(aliasRoot, aliasMain)
  const unrelatedPosition = syncPosition(store, unrelatedRoot, unrelatedMain)

  const first = store.prepare(aliasPosition, true)
  store.prepare(unrelatedPosition, true)
  assert.equal(documentContent(first, aliasMain)?.includes("'old'"), true)
  assert.equal(store.prepare(aliasPosition, true).state.dependencyClosureCacheHit, true)
  assert.equal(store.prepare(unrelatedPosition).state.dependencyClosureCacheHit, true)

  fs.unlinkSync(aliasRoot)
  fs.symlinkSync(physicalB, aliasRoot, "dir")
  store.workspaceFilesChanged({ rootPath: aliasRoot, rootDirty: true, changes: [] })
  const retargeted = store.prepare(aliasPosition, true)
  const unrelatedAfter = store.prepare(unrelatedPosition)

  assert.equal(documentContent(retargeted, aliasMain)?.includes("'new'"), true)
  assert.equal(retargeted.resetTypeEngine, true)
  assert.equal(retargeted.contentRevision, 1)
  assert.equal(retargeted.state.dependencyClosureCacheHit, false)
  assert.equal(unrelatedAfter.resetTypeEngine, false)
  assert.equal(unrelatedAfter.contentRevision, 0)
  assert.equal(unrelatedAfter.state.dependencyClosureCacheHit, true)

  const oldPhysical = store.prepare(viewPathPosition(physicalA, physicalAMain), true)
  assert.equal(oldPhysical.resetTypeEngine, true)
  assert.equal(
    enumerationCounts.get(fs.realpathSync(physicalA)),
    2,
    "the old canonical membership must be invalidated",
  )
})

test("a nested root-dirty reset reaches only closure owners without snapshot I/O", (t) => {
  const outerRoot = createWorkspace(t, "dirty-cross-root-outer", {
    "Main.ets": "import { target } from './nested/Target'\nexport const main = target()\n",
    "nested/NestedMain.ets": "import { target } from './Target'\nexport const nested = target()\n",
    "nested/Target.ets": "export function target(): string { return 'ets' }\n",
    "nested/Target.ts": "export function target(): string { return 'ts' }\n",
  })
  const nestedRoot = path.join(outerRoot, "nested")
  const unrelatedRoot = createWorkspace(t, "dirty-cross-root-unrelated", {
    "Main.ets": "import { kept } from './Kept'\nexport const main = kept()\n",
    "Kept.ets": "export function kept(): string { return 'kept' }\n",
  })
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  const outerPosition = syncPosition(store, outerRoot, path.join(outerRoot, "Main.ets"))
  const nestedPosition = syncPosition(store, nestedRoot, path.join(nestedRoot, "NestedMain.ets"))
  const unrelatedPosition = syncPosition(store, unrelatedRoot, path.join(unrelatedRoot, "Main.ets"))
  const targetEtsPath = path.join(nestedRoot, "Target.ets")
  const targetTsPath = path.join(nestedRoot, "Target.ts")
  store.prepare(outerPosition)
  store.prepare(nestedPosition)
  store.prepare(unrelatedPosition)
  assert.equal(store.prepare(outerPosition).state.dependencyClosureCacheHit, true)
  assert.equal(store.prepare(nestedPosition).state.dependencyClosureCacheHit, true)
  assert.equal(store.prepare(unrelatedPosition).state.dependencyClosureCacheHit, true)

  let closureScans = 0
  const closureCount = store.dependencyClosures.size
  for (const closure of store.dependencyClosures.values()) {
    const originalSome = closure.paths.some
    closure.paths.some = function some(...args) {
      closureScans += 1
      return originalSome.apply(this, args)
    }
  }
  fs.unlinkSync(targetEtsPath)
  const originalStat = fs.statSync
  const originalRealpathNative = fs.realpathSync.native
  let statCalls = 0
  let realpathCalls = 0
  fs.statSync = (...args) => {
    statCalls += 1
    return originalStat(...args)
  }
  fs.realpathSync.native = (...args) => {
    realpathCalls += 1
    return originalRealpathNative(...args)
  }
  try {
    store.workspaceFilesChanged({ rootPath: nestedRoot, rootDirty: true, changes: [] })
  } finally {
    fs.statSync = originalStat
    fs.realpathSync.native = originalRealpathNative
  }

  assert.equal(statCalls, 0, "overflow recovery must not stat every cached source")
  assert.equal(realpathCalls, 1, "only the dirty workspace root is canonicalized")
  assert.equal(closureScans, closureCount, "each dependency closure is scanned once")
  const outerAfter = store.prepare(outerPosition)
  const nestedAfter = store.prepare(nestedPosition)
  const unrelatedAfter = store.prepare(unrelatedPosition)
  assert.equal(outerAfter.resetTypeEngine, true)
  assert.equal(outerAfter.contentRevision, 1)
  assert.deepEqual(outerAfter.removedPaths, [])
  assert.equal(outerAfter.state.dependencyClosureCacheHit, false)
  assert.equal(documentPaths(outerAfter).includes(targetEtsPath), false)
  assert.equal(documentPaths(outerAfter).includes(targetTsPath), true)
  assert.equal(nestedAfter.resetTypeEngine, true)
  assert.equal(nestedAfter.contentRevision, 1)
  assert.equal(unrelatedAfter.resetTypeEngine, false)
  assert.equal(unrelatedAfter.contentRevision, 0)
  assert.equal(unrelatedAfter.state.dependencyClosureCacheHit, true)
  assert.equal(store.prepare(outerPosition).resetTypeEngine, false)
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

test("closing an overlay invalidates disk aliases by its captured physical identity", (t) => {
  const oldDiskContent = "export function target(): string { return 'x' }\n"
  const newDiskContent = "export function target(): number { return 123 }\n"
  const overlayContent = "export function target(): boolean { return true }\n"
  assert.equal(Buffer.byteLength(newDiskContent), Buffer.byteLength(oldDiskContent))
  const outerRoot = createWorkspace(t, "close-alias-outer", {
    "Main.ets": "import { target } from './Alias'\nexport const main = target()\n",
  })
  const targetRoot = createWorkspace(t, "close-alias-target", {
    "Target.ets": oldDiskContent,
  })
  const mainPath = path.join(outerRoot, "Main.ets")
  const targetPath = path.join(targetRoot, "Target.ets")
  const aliasPath = path.join(outerRoot, "Alias.ets")
  fs.symlinkSync(targetPath, aliasPath, "file")
  const stableTimestamp = new Date("2020-01-02T03:04:05.000Z")
  fs.utimesSync(targetPath, stableTimestamp, stableTimestamp)
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  store.sync({
    path: targetPath,
    content: overlayContent,
    documentVersion: 1,
    workspaceRoot: targetRoot,
  })
  const outerPosition = syncPosition(store, outerRoot, mainPath)
  const warm = store.prepare(outerPosition)
  assert.equal(documentContent(warm, aliasPath), oldDiskContent)

  fs.writeFileSync(targetPath, newDiskContent, "utf8")
  fs.utimesSync(targetPath, stableTimestamp, stableTimestamp)
  store.close(targetPath)
  const outerAfterClose = store.prepare(outerPosition)
  const targetAfterClose = store.prepare(viewPathPosition(targetRoot, targetPath))

  assert.equal(documentContent(outerAfterClose, aliasPath), newDiskContent)
  assert.deepEqual(outerAfterClose.changedPaths, [aliasPath])
  assert.equal(outerAfterClose.contentRevision, 1)
  assert.equal(outerAfterClose.resetTypeEngine, true)
  assert.equal(outerAfterClose.state.dependencyClosureCacheHit, false)
  assert.equal(documentContent(targetAfterClose, targetPath), newDiskContent)
  assert.deepEqual(targetAfterClose.changedPaths, [targetPath])
  assert.equal(targetAfterClose.contentRevision, 1)
})

test("closing a retargeted overlay symlink invalidates aliases of its current physical identity", (t) => {
  const oldDiskContent = "export function target(): string { return 'x' }\n"
  const newDiskContent = "export function target(): number { return 123 }\n"
  assert.equal(Buffer.byteLength(newDiskContent), Buffer.byteLength(oldDiskContent))
  const workspace = createWorkspace(t, "close-retargeted-overlay", {
    "Main.ets": "import { target } from './Alias'\nexport const main = target()\n",
    "First.ets": "export function first(): string { return 'first' }\n",
    "Second.ets": oldDiskContent,
  })
  const mainPath = path.join(workspace, "Main.ets")
  const firstPath = path.join(workspace, "First.ets")
  const secondPath = path.join(workspace, "Second.ets")
  const openPath = path.join(workspace, "Open.ets")
  const aliasPath = path.join(workspace, "Alias.ets")
  fs.symlinkSync(firstPath, openPath, "file")
  fs.symlinkSync(secondPath, aliasPath, "file")
  const stableTimestamp = new Date("2020-01-02T03:04:05.000Z")
  fs.utimesSync(secondPath, stableTimestamp, stableTimestamp)
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  store.sync({
    path: openPath,
    content: "export function unsaved(): boolean { return true }\n",
    documentVersion: 1,
    workspaceRoot: workspace,
  })
  const position = syncPosition(store, workspace, mainPath)
  const warm = store.prepare(position)
  assert.equal(documentContent(warm, aliasPath), oldDiskContent)

  fs.writeFileSync(secondPath, newDiskContent, "utf8")
  fs.utimesSync(secondPath, stableTimestamp, stableTimestamp)
  fs.unlinkSync(openPath)
  fs.symlinkSync(secondPath, openPath, "file")
  store.close(openPath)
  const changed = store.prepare(position)

  assert.equal(documentContent(changed, aliasPath), newDiskContent)
  assert.deepEqual(changed.changedPaths, [openPath, aliasPath])
  assert.equal(changed.contentRevision, 1, "old/current physical matches must advance the root once")
  assert.equal(changed.resetTypeEngine, true)
  assert.equal(changed.state.dependencyClosureCacheHit, false)
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

function incrementCount(counts, key) {
  counts.set(key, (counts.get(key) ?? 0) + 1)
}
