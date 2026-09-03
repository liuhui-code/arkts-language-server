import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildSync } from "esbuild"

import { projectRoot } from "./support/lsp-process.mjs"
import { buildDocumentStoreDriver } from "./support/build-document-store-driver.mjs"

test("keeps only supported in-root file events with last-event-wins ordering", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-root-"))
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-outside-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  t.after(() => fs.rmSync(outsideRoot, { recursive: true, force: true }))
  fs.symlinkSync(outsideRoot, path.join(workspaceRoot, "escaped"), "dir")

  const rootUri = pathToFileURL(workspaceRoot).href
  const mainUri = pathToFileURL(path.join(workspaceRoot, "Main.ets")).href
  const renamedFromUri = pathToFileURL(path.join(workspaceRoot, "Old.ts")).href
  const renamedToUri = pathToFileURL(path.join(workspaceRoot, "New.ts")).href
  const { WorkspaceFileChangeCoordinator } = buildDriver(t)
  const coordinator = new WorkspaceFileChangeCoordinator({ rootUris: [rootUri] })

  coordinator.accept([
    { uri: mainUri, type: 1 },
    { uri: "untitled:Scratch.ets", type: 1 },
    { uri: pathToFileURL(path.join(workspaceRoot, "Notes.js")).href, type: 1 },
    { uri: pathToFileURL(path.join(outsideRoot, "Outside.ets")).href, type: 1 },
    { uri: pathToFileURL(path.join(workspaceRoot, "escaped", "Leak.ets")).href, type: 1 },
    { uri: mainUri, type: 2 },
    { uri: renamedFromUri, type: 3 },
    { uri: renamedToUri, type: 1 },
  ])

  assert.deepEqual(coordinator.drain(), [{
    rootUri,
    rootDirty: false,
    changes: [
      { uri: mainUri, kind: "changed" },
      { uri: renamedFromUri, kind: "deleted" },
      { uri: renamedToUri, kind: "created" },
    ],
  }])
  assert.deepEqual(coordinator.drain(), [])
})

test("bounds pending paths and degrades only the overloaded root to dirty", (t) => {
  const firstRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-first-"))
  const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-second-"))
  t.after(() => fs.rmSync(firstRoot, { recursive: true, force: true }))
  t.after(() => fs.rmSync(secondRoot, { recursive: true, force: true }))
  const firstRootUri = pathToFileURL(firstRoot).href
  const secondRootUri = pathToFileURL(secondRoot).href
  const secondUri = pathToFileURL(path.join(secondRoot, "Keep.ets")).href
  const { WorkspaceFileChangeCoordinator } = buildDriver(t)
  const coordinator = new WorkspaceFileChangeCoordinator({
    rootUris: [firstRootUri, secondRootUri],
    maxPendingPaths: 2,
  })

  coordinator.accept([
    { uri: pathToFileURL(path.join(firstRoot, "One.ets")).href, type: 1 },
    { uri: pathToFileURL(path.join(firstRoot, "Two.ets")).href, type: 2 },
    { uri: pathToFileURL(path.join(firstRoot, "One.ets")).href, type: 2 },
    { uri: pathToFileURL(path.join(firstRoot, "Three.ets")).href, type: 1 },
    { uri: pathToFileURL(path.join(firstRoot, "Four.ets")).href, type: 3 },
    { uri: secondUri, type: 1 },
  ])

  assert.deepEqual(coordinator.drain(), [
    { rootUri: firstRootUri, rootDirty: true, changes: [] },
    {
      rootUri: secondRootUri,
      rootDirty: false,
      changes: [{ uri: secondUri, kind: "created" }],
    },
  ])
})

test("does not silently drop workspace roots beyond an arbitrary prefix", (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-many-roots-"))
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  const rootUris = Array.from({ length: 33 }, (_, index) => (
    pathToFileURL(path.join(base, `root-${index}`)).href
  ))
  for (let index = 0; index < rootUris.length; index += 1) {
    fs.mkdirSync(path.join(base, `root-${index}`))
  }
  const selectedUri = pathToFileURL(path.join(base, "root-32", "Selected.ets")).href
  const { WorkspaceFileChangeCoordinator } = buildDriver(t)
  const coordinator = new WorkspaceFileChangeCoordinator({ rootUris })

  coordinator.accept([{ uri: selectedUri, type: 1 }])

  assert.deepEqual(coordinator.drain(), [{
    rootUri: rootUris[32],
    rootDirty: false,
    changes: [{ uri: selectedUri, kind: "created" }],
  }])
})

test("adds a watched source create to a cached project set without rescanning", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-create-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const mainPath = path.join(workspaceRoot, "Main.ets")
  const createdPath = path.join(workspaceRoot, "Created.ets")
  fs.writeFileSync(mainPath, "export const main = 1\n", "utf8")
  let enumerationCount = 0
  const { SemanticDocumentStore } = buildDocumentStoreDriver(workspaceRoot)
  const store = new SemanticDocumentStore({
    enumerateWorkspaceSources() {
      enumerationCount += 1
      return fs.readdirSync(workspaceRoot)
        .filter((name) => name.endsWith(".ets"))
        .map((name) => path.join(workspaceRoot, name))
    },
  })
  t.after(() => store.dispose())
  const position = syncPosition(store, workspaceRoot, mainPath)
  store.prepare(position, true)

  fs.writeFileSync(createdPath, "export class Created {}\n", "utf8")
  store.workspaceFilesChanged({
    rootPath: workspaceRoot,
    rootDirty: false,
    changes: [{ path: createdPath, kind: "created" }],
  })
  const view = store.prepare(position, true)

  assert.equal(enumerationCount, 1)
  assert.deepEqual(
    view.documents.map((document) => document.path).sort(),
    [createdPath, mainPath].sort(),
  )
})

test("invalidates cached content when a watched source changes with the same fingerprint", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-change-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const mainPath = path.join(workspaceRoot, "Main.ets")
  const dependencyPath = path.join(workspaceRoot, "Dependency.ets")
  fs.writeFileSync(mainPath, "export const main = 1\n", "utf8")
  fs.writeFileSync(dependencyPath, "export const before = 1\n", "utf8")
  const fixedModifiedAt = new Date(1_700_000_000_000)
  fs.utimesSync(dependencyPath, fixedModifiedAt, fixedModifiedAt)
  const { SemanticDocumentStore } = buildDocumentStoreDriver(workspaceRoot)
  const store = new SemanticDocumentStore({
    enumerateWorkspaceSources: () => [mainPath, dependencyPath],
  })
  t.after(() => store.dispose())
  const position = syncPosition(store, workspaceRoot, mainPath)
  const first = store.prepare(position, true)
  assert.equal(
    first.documents.find((document) => document.path === dependencyPath)?.content,
    "export const before = 1\n",
  )
  fs.writeFileSync(dependencyPath, "export const after_ = 2\n", "utf8")
  fs.utimesSync(dependencyPath, fixedModifiedAt, fixedModifiedAt)

  store.workspaceFilesChanged({
    rootPath: workspaceRoot,
    rootDirty: false,
    changes: [{ path: dependencyPath, kind: "changed" }],
  })
  const second = store.prepare(position, true)

  assert.equal(
    second.documents.find((document) => document.path === dependencyPath)?.content,
    "export const after_ = 2\n",
  )
})

test("applies a watched rename incrementally and reports the stale script once", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-rename-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const mainPath = path.join(workspaceRoot, "Main.ets")
  const oldPath = path.join(workspaceRoot, "Old.ets")
  const renamedPath = path.join(workspaceRoot, "Renamed.ets")
  fs.writeFileSync(mainPath, "export const main = 1\n", "utf8")
  fs.writeFileSync(oldPath, "export class Old {}\n", "utf8")
  let enumerationCount = 0
  const { SemanticDocumentStore } = buildDocumentStoreDriver(workspaceRoot)
  const store = new SemanticDocumentStore({
    enumerateWorkspaceSources() {
      enumerationCount += 1
      return fs.readdirSync(workspaceRoot)
        .filter((name) => name.endsWith(".ets"))
        .map((name) => path.join(workspaceRoot, name))
    },
  })
  t.after(() => store.dispose())
  const position = syncPosition(store, workspaceRoot, mainPath)
  store.prepare(position, true)
  fs.renameSync(oldPath, renamedPath)

  store.workspaceFilesChanged({
    rootPath: workspaceRoot,
    rootDirty: false,
    changes: [
      { path: oldPath, kind: "deleted" },
      { path: renamedPath, kind: "created" },
    ],
  })
  const renamed = store.prepare(position, true)
  const settled = store.prepare(position, true)

  assert.equal(enumerationCount, 1)
  assert.deepEqual(
    renamed.documents.map((document) => document.path).sort(),
    [mainPath, renamedPath].sort(),
  )
  assert.deepEqual(renamed.removedPaths, [oldPath])
  assert.deepEqual(settled.removedPaths, [])
})

test("rescans an overloaded root and removes every previously cached script", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-dirty-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const mainPath = path.join(workspaceRoot, "Main.ets")
  const stalePath = path.join(workspaceRoot, "Stale.ets")
  const freshPath = path.join(workspaceRoot, "Fresh.ets")
  fs.writeFileSync(mainPath, "export const main = 1\n", "utf8")
  fs.writeFileSync(stalePath, "export class Stale {}\n", "utf8")
  let enumerationCount = 0
  const { SemanticDocumentStore } = buildDocumentStoreDriver(workspaceRoot)
  const store = new SemanticDocumentStore({
    enumerateWorkspaceSources() {
      enumerationCount += 1
      return fs.readdirSync(workspaceRoot)
        .filter((name) => name.endsWith(".ets"))
        .map((name) => path.join(workspaceRoot, name))
    },
  })
  t.after(() => store.dispose())
  const position = syncPosition(store, workspaceRoot, mainPath)
  store.prepare(position, true)
  fs.unlinkSync(stalePath)
  fs.writeFileSync(freshPath, "export class Fresh {}\n", "utf8")

  store.workspaceFilesChanged({
    rootPath: workspaceRoot,
    rootDirty: true,
    changes: [],
  })
  const refreshed = store.prepare(position, true)

  assert.equal(enumerationCount, 2)
  assert.deepEqual(
    refreshed.documents.map((document) => document.path).sort(),
    [freshPath, mainPath].sort(),
  )
  assert.ok(refreshed.removedPaths.includes(stalePath))
})

test("keeps an open unsaved overlay authoritative across an external delete", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-overlay-delete-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const mainPath = path.join(workspaceRoot, "Main.ets")
  const overlayPath = path.join(workspaceRoot, "Unsaved.ets")
  fs.writeFileSync(mainPath, "export const main = 1\n", "utf8")
  const { SemanticDocumentStore } = buildDocumentStoreDriver(workspaceRoot)
  const store = new SemanticDocumentStore({
    enumerateWorkspaceSources: () => [mainPath],
  })
  t.after(() => store.dispose())
  const position = syncPosition(store, workspaceRoot, mainPath)
  store.prepare(position, true)
  store.sync({
    path: overlayPath,
    content: "export class UnsavedOverlay {}\n",
    documentVersion: 1,
    workspaceRoot,
  })
  store.prepare(position, true)

  store.workspaceFilesChanged({
    rootPath: workspaceRoot,
    rootDirty: false,
    changes: [{ path: overlayPath, kind: "deleted" }],
  })
  const afterDelete = store.prepare(position, true)

  assert.equal(
    afterDelete.documents.find((document) => document.path === overlayPath)?.content,
    "export class UnsavedOverlay {}\n",
  )
  assert.equal(afterDelete.removedPaths.includes(overlayPath), false)

  store.workspaceFilesChanged({
    rootPath: workspaceRoot,
    rootDirty: true,
    changes: [],
  })
  const afterRootDirty = store.prepare(position, true)
  const settled = store.prepare(position, true)

  assert.equal(
    afterRootDirty.documents.find((document) => document.path === overlayPath)?.content,
    "export class UnsavedOverlay {}\n",
  )
  assert.equal(afterRootDirty.removedPaths.includes(overlayPath), false)
  assert.equal(afterRootDirty.resetTypeEngine, true)
  assert.equal(settled.resetTypeEngine, false)
})

test("a root reset drops its stale type scripts without rebuilding another root", (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-type-reset-"))
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  const firstRoot = path.join(base, "first")
  const secondRoot = path.join(base, "second")
  fs.mkdirSync(firstRoot)
  fs.mkdirSync(secondRoot)
  const firstMain = path.join(firstRoot, "Main.ets")
  const stalePath = path.join(firstRoot, "Stale.ets")
  const secondMain = path.join(secondRoot, "Main.ets")
  const keptPath = path.join(secondRoot, "Kept.ets")
  const firstText = completionSource("Sta")
  const secondText = completionSource("Kep")
  const { SemanticTypeEngineRegistry } = buildTypeEngineDriver(t)
  const registry = new SemanticTypeEngineRegistry()
  t.after(() => registry.dispose())

  const first = registry.prepare(workspaceView(firstRoot, firstMain, firstText, [
    { path: stalePath, content: "export class StaleType {}\n" },
  ]))
  const second = registry.prepare(workspaceView(secondRoot, secondMain, secondText, [
    { path: keptPath, content: "export class KeptType {}\n" },
  ]))
  assert.ok(first.complete(completionPosition(firstMain, firstText)).some((item) => (
    item.label === "StaleType"
  )))
  assert.ok(second.complete(completionPosition(secondMain, secondText)).some((item) => (
    item.label === "KeptType"
  )))

  const resetFirst = registry.prepare({
    ...workspaceView(firstRoot, firstMain, firstText),
    resetTypeEngine: true,
  })
  const stillWarmSecond = registry.prepare(workspaceView(secondRoot, secondMain, secondText))

  assert.equal(resetFirst.complete(completionPosition(firstMain, firstText)).some((item) => (
    item.label === "StaleType"
  )), false)
  assert.ok(stillWarmSecond.complete(completionPosition(secondMain, secondText)).some((item) => (
    item.label === "KeptType"
  )))
})

test("bounds pending removed paths and escalates overflow to a one-shot root reset", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-removal-limit-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const mainPath = path.join(workspaceRoot, "Main.ets")
  const firstPath = path.join(workspaceRoot, "First.ets")
  const secondPath = path.join(workspaceRoot, "Second.ets")
  const unknownPath = path.join(workspaceRoot, "NeverLoaded.ets")
  for (const filePath of [mainPath, firstPath, secondPath]) {
    fs.writeFileSync(filePath, `export const value = ${JSON.stringify(path.basename(filePath))}\n`, "utf8")
  }
  const { SemanticDocumentStore } = buildDocumentStoreDriver(workspaceRoot)
  const store = new SemanticDocumentStore({
    enumerateWorkspaceSources: () => [mainPath, firstPath, secondPath],
    watchedFileLimits: { maxRemovedPaths: 1 },
  })
  t.after(() => store.dispose())
  const position = syncPosition(store, workspaceRoot, mainPath)
  store.prepare(position, true)
  fs.unlinkSync(firstPath)
  fs.unlinkSync(secondPath)

  store.workspaceFilesChanged({
    rootPath: workspaceRoot,
    rootDirty: false,
    changes: [
      { path: unknownPath, kind: "deleted" },
      { path: firstPath, kind: "deleted" },
      { path: secondPath, kind: "deleted" },
    ],
  })
  const overflow = store.prepare(position, true)
  const settled = store.prepare(position, true)

  assert.equal(overflow.resetTypeEngine, true)
  assert.ok(overflow.removedPaths.length <= 1)
  assert.equal(overflow.removedPaths.includes(unknownPath), false)
  assert.equal(settled.resetTypeEngine, false)
})

function buildDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-driver-"))
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  const outfile = path.join(outputRoot, "workspace-file-change-coordinator.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "lsp", "workspace-file-change-coordinator.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
  })
  return createRequire(import.meta.url)(outfile)
}

function buildTypeEngineDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-type-engine-driver-"))
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  const outfile = path.join(outputRoot, "type-engine.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "core", "types", "type-engine.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
  })
  return createRequire(import.meta.url)(outfile)
}

function completionSource(prefix) {
  return [
    "struct Home {",
    "  build() {",
    `    const value = ${prefix}`,
    "  }",
    "}",
  ].join("\n")
}

function workspaceView(rootPath, mainPath, mainContent, additional = []) {
  return {
    rootPath,
    documents: [{ path: mainPath, content: mainContent }, ...additional],
    removedPaths: [],
    resetTypeEngine: false,
    state: {
      path: mainPath,
      contentGeneration: 1,
      dependencyGeneration: 1,
      documentCacheHit: false,
      dependencyClosureCacheHit: false,
      queryCacheHit: false,
      loadedDocumentCount: additional.length + 1,
      syntaxReady: true,
    },
  }
}

function completionPosition(documentPath, content) {
  const line = content.split("\n")[2]
  return {
    path: documentPath,
    line: 3,
    column: line.length + 1,
    workspaceRoot: path.dirname(documentPath),
  }
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
