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

test("keeps distinct lexical create events that resolve to the same physical source", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-create-aliases-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const targetPath = path.join(workspaceRoot, "Target.ets")
  const firstPath = path.join(workspaceRoot, "First.ets")
  const secondPath = path.join(workspaceRoot, "Second.ets")
  fs.writeFileSync(targetPath, "export const target = 1\n", "utf8")
  fs.symlinkSync(targetPath, firstPath, "file")
  fs.symlinkSync(targetPath, secondPath, "file")
  const rootUri = pathToFileURL(workspaceRoot).href
  const firstUri = pathToFileURL(firstPath).href
  const secondUri = pathToFileURL(secondPath).href
  const { WorkspaceFileChangeCoordinator } = buildDriver(t)
  const coordinator = new WorkspaceFileChangeCoordinator({ rootUris: [rootUri] })

  coordinator.accept([
    { uri: firstUri, type: 1 },
    { uri: secondUri, type: 1 },
  ])

  assert.deepEqual(coordinator.drain(), [{
    rootUri,
    rootDirty: false,
    changes: [
      { uri: firstUri, kind: "created" },
      { uri: secondUri, kind: "created" },
    ],
  }])
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

test("routes only in-root ArkUI string resources and rejects JSON or symlink escapes", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-resource-"))
  const workspaceRoot = path.join(temporaryRoot, "workspace")
  const outsideRoot = path.join(temporaryRoot, "outside")
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const resourcePath = path.join(workspaceRoot, "resources", "base", "element", "string.json")
  const ordinaryJsonPath = path.join(workspaceRoot, "settings.json")
  const wrongLayoutPath = path.join(workspaceRoot, "resources", "base", "profile.json")
  const missingQualifierPath = path.join(workspaceRoot, "resources", "element", "string.json")
  const nestedQualifierPath = path.join(
    workspaceRoot,
    "resources",
    "base",
    "dark",
    "element",
    "string.json",
  )
  const outsideResourcePath = path.join(outsideRoot, "resources", "base", "element", "string.json")
  const escapedDirectory = path.join(workspaceRoot, "escaped")
  for (const filePath of [
    resourcePath,
    wrongLayoutPath,
    missingQualifierPath,
    nestedQualifierPath,
    outsideResourcePath,
  ]) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, "{}\n", "utf8")
  }
  fs.writeFileSync(ordinaryJsonPath, "{}\n", "utf8")
  fs.symlinkSync(outsideRoot, escapedDirectory, "dir")
  const escapedResourcePath = path.join(
    escapedDirectory,
    "resources",
    "base",
    "element",
    "string.json",
  )
  const rootUri = pathToFileURL(workspaceRoot).href
  const { WorkspaceFileChangeCoordinator } = buildDriver(t)
  const coordinator = new WorkspaceFileChangeCoordinator({ rootUris: [rootUri] })

  coordinator.accept([
    { uri: pathToFileURL(resourcePath).href, type: 2 },
    { uri: pathToFileURL(ordinaryJsonPath).href, type: 2 },
    { uri: pathToFileURL(wrongLayoutPath).href, type: 2 },
    { uri: pathToFileURL(missingQualifierPath).href, type: 2 },
    { uri: pathToFileURL(nestedQualifierPath).href, type: 2 },
    { uri: pathToFileURL(outsideResourcePath).href, type: 2 },
    { uri: pathToFileURL(escapedResourcePath).href, type: 2 },
  ])

  assert.deepEqual(coordinator.drain(), [{
    rootUri,
    rootDirty: false,
    resourceChanged: true,
    changes: [{ uri: pathToFileURL(resourcePath).href, kind: "changed" }],
  }])
})

test("bounds an ArkUI resource burst without discarding pending source changes", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-resource-burst-"))
  const firstRoot = path.join(temporaryRoot, "first")
  const secondRoot = path.join(temporaryRoot, "second")
  fs.mkdirSync(firstRoot)
  fs.mkdirSync(secondRoot)
  fs.mkdirSync(path.join(firstRoot, "nested"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const firstRootUri = pathToFileURL(firstRoot).href
  const secondRootUri = pathToFileURL(secondRoot).href
  const sourceUri = pathToFileURL(path.join(firstRoot, "Main.ets")).href
  const resourcePath = (rootPath, qualifier) => path.join(
    rootPath,
    "resources",
    qualifier,
    "element",
    "string.json",
  )
  const resourceUri = (rootPath, qualifier) => pathToFileURL(
    resourcePath(rootPath, qualifier),
  ).href
  for (const [rootPath, qualifier] of [
    [firstRoot, "base"],
    [firstRoot, "en_US"],
    [firstRoot, "zh_CN"],
    [secondRoot, "base"],
  ]) {
    const filePath = resourcePath(rootPath, qualifier)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, "{}\n", "utf8")
  }
  const { WorkspaceFileChangeCoordinator } = buildDriver(t)
  const coordinator = new WorkspaceFileChangeCoordinator({
    rootUris: [firstRootUri, secondRootUri],
    maxPendingPaths: 2,
  })

  coordinator.accept([
    { uri: sourceUri, type: 2 },
    { uri: resourceUri(firstRoot, "base"), type: 2 },
    { uri: resourceUri(firstRoot, "en_US"), type: 2 },
    { uri: resourceUri(firstRoot, "zh_CN"), type: 2 },
    { uri: resourceUri(secondRoot, "base"), type: 1 },
  ])

  assert.deepEqual(coordinator.drain(), [
    {
      rootUri: firstRootUri,
      rootDirty: false,
      resourceDirty: true,
      resourceChanged: true,
      changes: [{ uri: sourceUri, kind: "changed" }],
    },
    {
      rootUri: secondRootUri,
      rootDirty: false,
      resourceChanged: true,
      changes: [{ uri: resourceUri(secondRoot, "base"), kind: "created" }],
    },
  ])
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
  assert.equal(registry.workspaceCount(), 2)

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

test("rebuilds a stale lexical type engine after another alias consumes a root reset", (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-type-owner-alias-"))
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  const physicalRoot = path.join(base, "physical")
  const firstAlias = path.join(base, "first-alias")
  const secondAlias = path.join(base, "second-alias")
  fs.mkdirSync(physicalRoot)
  fs.symlinkSync(physicalRoot, firstAlias, "dir")
  fs.symlinkSync(physicalRoot, secondAlias, "dir")
  const canonicalRootId = fs.realpathSync.native(physicalRoot)
  const physicalTarget = path.join(physicalRoot, "Target.ets")
  const firstMain = path.join(firstAlias, "Main.ets")
  const firstTarget = path.join(firstAlias, "Target.ets")
  const secondMain = path.join(secondAlias, "Main.ets")
  const secondTarget = path.join(secondAlias, "Target.ets")
  const mainText = [
    'import { TargetType } from "./Target"',
    "const value = new TargetType()",
  ].join("\n")
  fs.writeFileSync(path.join(physicalRoot, "Main.ets"), mainText, "utf8")
  fs.writeFileSync(physicalTarget, "export class TargetType {}\n", "utf8")
  const { SemanticDocumentStore } = buildDocumentStoreDriver(base)
  const { SemanticTypeEngineRegistry } = buildTypeEngineDriver(t)
  const store = new SemanticDocumentStore({
    enumerateWorkspaceSources: (rootPath) => [
      path.join(rootPath, "Main.ets"),
      path.join(rootPath, "Target.ets"),
    ].filter((filePath) => fs.existsSync(filePath)),
  })
  const registry = new SemanticTypeEngineRegistry()
  t.after(() => store.dispose())
  t.after(() => registry.dispose())
  const firstPosition = syncPosition(store, firstAlias, firstMain)
  const secondPosition = syncPosition(store, secondAlias, secondMain)
  const firstDefinitionPosition = definitionPosition(firstMain, firstAlias, mainText, "TargetType")
  const secondDefinitionPosition = definitionPosition(secondMain, secondAlias, mainText, "TargetType")

  const firstView = store.prepare(firstPosition, true)
  const secondView = store.prepare(secondPosition, true)
  assert.equal(firstView.canonicalRootId, canonicalRootId)
  assert.equal(secondView.canonicalRootId, canonicalRootId)
  assert.equal(firstView.typeEngineResetEpoch, 0)
  assert.equal(secondView.typeEngineResetEpoch, 0)
  const first = registry.prepare(firstView)
  const second = registry.prepare(secondView)
  assert.ok(first.define(firstDefinitionPosition).some(({ path: definitionPath }) => (
    definitionPath === firstTarget
  )))
  assert.ok(second.define(secondDefinitionPosition).some(({ path: definitionPath }) => (
    definitionPath === secondTarget
  )))
  assert.equal(registry.workspaceCount(), 2, "lexical engines must remain isolated")

  fs.unlinkSync(physicalTarget)
  store.workspaceFilesChanged({
    rootPath: firstAlias,
    rootDirty: false,
    changes: [{ path: firstTarget, kind: "deleted" }],
  })
  const firstAfterDelete = store.prepare(firstPosition, true)
  registry.prepare(firstAfterDelete)
  const secondAfterDelete = store.prepare(secondPosition, true)
  const staleSecond = registry.prepare(secondAfterDelete)
  const freshRegistry = new SemanticTypeEngineRegistry()
  t.after(() => freshRegistry.dispose())
  const freshSecond = freshRegistry.prepare(secondAfterDelete)
  const staleDefinitions = staleSecond.define(secondDefinitionPosition)
  const freshDefinitions = freshSecond.define(secondDefinitionPosition)

  assert.equal(firstAfterDelete.resetTypeEngine, true)
  assert.equal(secondAfterDelete.resetTypeEngine, false, "the Store reset delta is one-shot")
  assert.equal(firstAfterDelete.typeEngineResetEpoch, 1)
  assert.equal(secondAfterDelete.typeEngineResetEpoch, 1, "the reset epoch is persistent")
  assert.deepEqual(secondAfterDelete.removedPaths, [])
  assert.equal(staleDefinitions.some(({ path: definitionPath }) => (
    definitionPath === secondTarget
  )), false)
  assert.deepEqual(staleDefinitions, freshDefinitions)
  assert.equal(registry.workspaceCount(), 2)
})

test("rebuilds a lexical type engine that receives only the latest owner revision", (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-type-owner-revision-"))
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  const physicalRoot = path.join(base, "physical")
  const firstAlias = path.join(base, "first-alias")
  const secondAlias = path.join(base, "second-alias")
  fs.mkdirSync(physicalRoot)
  fs.symlinkSync(physicalRoot, firstAlias, "dir")
  fs.symlinkSync(physicalRoot, secondAlias, "dir")
  const canonicalRootId = fs.realpathSync.native(physicalRoot)
  const firstMain = path.join(firstAlias, "Main.ets")
  const firstTarget = path.join(firstAlias, "Target.ets")
  const secondMain = path.join(secondAlias, "Main.ets")
  const secondTarget = path.join(secondAlias, "Target.ets")
  const mainText = [
    'import { TargetType } from "./Target"',
    "const value = new TargetType()",
  ].join("\n")
  const targetText = "export class TargetType {}\n"
  const { SemanticTypeEngineRegistry } = buildTypeEngineDriver(t)
  const registry = new SemanticTypeEngineRegistry()
  t.after(() => registry.dispose())
  const firstPosition = definitionPosition(firstMain, firstAlias, mainText, "TargetType")
  const secondPosition = definitionPosition(secondMain, secondAlias, mainText, "TargetType")
  const ownerView = (rootPath, mainPath, targetPath, contentRevision, includeTarget) => ({
    ...workspaceView(
      rootPath,
      mainPath,
      mainText,
      includeTarget ? [{ path: targetPath, content: targetText }] : [],
    ),
    canonicalRootId,
    typeEngineResetEpoch: 0,
    contentRevision,
  })

  registry.prepare(ownerView(firstAlias, firstMain, firstTarget, 0, true))
  const second = registry.prepare(ownerView(secondAlias, secondMain, secondTarget, 0, true))
  assert.ok(second.define(secondPosition).some(({ path: definitionPath }) => (
    definitionPath === secondTarget
  )))

  registry.prepare({
    ...ownerView(firstAlias, firstMain, firstTarget, 1, false),
    removedPaths: [firstTarget],
  })
  registry.prepare({
    ...ownerView(firstAlias, firstMain, firstTarget, 2, false),
    changedPaths: [firstMain],
  })
  const secondAfterMissedDelta = registry.prepare(
    {
      ...ownerView(secondAlias, secondMain, secondTarget, 2, false),
      changedPaths: [secondMain],
    },
  )

  assert.equal(secondAfterMissedDelta.define(secondPosition).some(({ path: definitionPath }) => (
    definitionPath === secondTarget
  )), false)
  assert.ok(registry.prepare(
    ownerView(firstAlias, firstMain, firstTarget, 2, false),
  ).define(firstPosition).every(({ path: definitionPath }) => definitionPath !== firstTarget))
})

test("rebuilds an alias engine when another lexical spelling owns its contiguous delta", (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-type-owner-coverage-"))
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  const physicalRoot = path.join(base, "physical")
  const firstAlias = path.join(base, "first-alias")
  const secondAlias = path.join(base, "second-alias")
  fs.mkdirSync(physicalRoot)
  fs.symlinkSync(physicalRoot, firstAlias, "dir")
  fs.symlinkSync(physicalRoot, secondAlias, "dir")
  const initialMain = [
    'import { TargetType } from "./Target"',
    "export const initial = TargetType",
    "",
  ].join("\n")
  const changedMain = completionSource("Tar")
  const physicalMain = path.join(physicalRoot, "Main.ets")
  const physicalTarget = path.join(physicalRoot, "Target.ets")
  const firstMain = path.join(firstAlias, "Main.ets")
  const firstTarget = path.join(firstAlias, "Target.ets")
  const secondMain = path.join(secondAlias, "Main.ets")
  const secondTarget = path.join(secondAlias, "Target.ets")
  fs.writeFileSync(physicalMain, initialMain, "utf8")
  fs.writeFileSync(physicalTarget, "export class TargetType {}\n", "utf8")
  const { SemanticDocumentStore } = buildDocumentStoreDriver(base)
  const { SemanticTypeEngineRegistry } = buildTypeEngineDriver(t)
  const store = new SemanticDocumentStore()
  const registry = new SemanticTypeEngineRegistry()
  t.after(() => store.dispose())
  t.after(() => registry.dispose())
  const initialPosition = (rootPath, mainPath) => ({
    path: mainPath,
    line: 1,
    column: 1,
    workspaceRoot: rootPath,
  })
  registry.prepare(store.prepare(initialPosition(firstAlias, firstMain)))
  const second = registry.prepare(store.prepare(initialPosition(secondAlias, secondMain)))
  assert.ok(second.define({
    path: secondMain,
    line: 2,
    column: "export const initial = ".length + 2,
    workspaceRoot: secondAlias,
  }).some(({ path: definitionPath }) => definitionPath === secondTarget))
  assert.equal(registry.workspaceCount(), 2)

  const maxDiskBytes = 4 * 1024 * 1024
  const fillerPrefix = 'export const filler = "'
  const fillerSuffix = '"\n'
  const filler = `${fillerPrefix}${"x".repeat(
    maxDiskBytes - Buffer.byteLength(fillerPrefix) - Buffer.byteLength(fillerSuffix),
  )}${fillerSuffix}`
  for (let index = 0; index < 5; index += 1) {
    const fillerRoot = path.join(base, `filler-${index}`)
    const fillerPath = path.join(fillerRoot, "Large.ets")
    store.prepareDiskSnapshot({
      path: fillerPath,
      line: 1,
      column: 1,
      workspaceRoot: fillerRoot,
    }, filler)
  }

  fs.writeFileSync(physicalMain, changedMain, "utf8")
  fs.writeFileSync(physicalTarget, "export const replacement = 1\n", "utf8")
  store.workspaceFilesChanged({
    rootPath: firstAlias,
    rootDirty: false,
    changes: [{ path: firstTarget, kind: "changed" }],
  })
  const secondAfterChange = store.prepare({
    path: secondMain,
    line: 3,
    column: changedMain.split("\n")[2].length + 1,
    workspaceRoot: secondAlias,
  })
  assert.deepEqual(secondAfterChange.changedPaths, [firstTarget])
  assert.equal(secondAfterChange.resetTypeEngine, false)
  assert.equal(secondAfterChange.typeEngineResetEpoch, 0)
  assert.deepEqual(secondAfterChange.documents.map(({ path: documentPath }) => documentPath), [
    secondMain,
  ])

  const stale = registry.prepare(secondAfterChange)
  const freshRegistry = new SemanticTypeEngineRegistry()
  t.after(() => freshRegistry.dispose())
  const fresh = freshRegistry.prepare(secondAfterChange)
  const completion = completionPosition(secondMain, changedMain)
  const staleLabels = stale.complete(completion).map(({ label }) => label)
  const freshLabels = fresh.complete(completion).map(({ label }) => label)

  assert.equal(staleLabels.includes("TargetType"), false)
  assert.deepEqual(staleLabels, freshLabels)
})

test("rebuilds a lexical type engine when its canonical owner identity changes", (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-type-owner-retarget-"))
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  const firstPhysical = path.join(base, "first-physical")
  const secondPhysical = path.join(base, "second-physical")
  const rootAlias = path.join(base, "workspace")
  fs.mkdirSync(firstPhysical)
  fs.mkdirSync(secondPhysical)
  fs.symlinkSync(firstPhysical, rootAlias, "dir")
  const mainPath = path.join(rootAlias, "Main.ets")
  const stalePath = path.join(rootAlias, "Stale.ets")
  const source = completionSource("Sta")
  const { SemanticTypeEngineRegistry } = buildTypeEngineDriver(t)
  const registry = new SemanticTypeEngineRegistry()
  t.after(() => registry.dispose())

  const initial = registry.prepare({
    ...workspaceView(rootAlias, mainPath, source, [
      { path: stalePath, content: "export class StaleType {}\n" },
    ]),
    canonicalRootId: fs.realpathSync.native(firstPhysical),
    typeEngineResetEpoch: 0,
    contentRevision: 0,
  })
  assert.ok(initial.complete(completionPosition(mainPath, source)).some(({ label }) => (
    label === "StaleType"
  )))

  fs.unlinkSync(rootAlias)
  fs.symlinkSync(secondPhysical, rootAlias, "dir")
  const retargeted = registry.prepare({
    ...workspaceView(rootAlias, mainPath, source),
    canonicalRootId: fs.realpathSync.native(secondPhysical),
    typeEngineResetEpoch: 0,
    contentRevision: 0,
  })

  assert.equal(retargeted.complete(completionPosition(mainPath, source)).some(({ label }) => (
    label === "StaleType"
  )), false)
  assert.equal(registry.workspaceCount(), 1)
})

test("invalidates only one workspace ArkUI snapshot without resetting TypeScript", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resource-invalidate-"))
  const firstRoot = path.join(temporaryRoot, "first")
  const secondRoot = path.join(temporaryRoot, "second")
  fs.mkdirSync(firstRoot)
  fs.mkdirSync(secondRoot)
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const firstMain = path.join(firstRoot, "Main.ets")
  const secondMain = path.join(secondRoot, "Main.ets")
  const source = 'const value = $r("app.string.")\n'
  fs.writeFileSync(firstMain, source, "utf8")
  fs.writeFileSync(secondMain, source, "utf8")
  const firstResource = writeStringResource(firstRoot, "first_old")
  const secondResource = writeStringResource(secondRoot, "second_old")
  const firstRootSpelling = `${firstRoot}${path.sep}nested${path.sep}..`
  const { SemanticTypeEngineRegistry } = buildTypeEngineDriver(t)
  const registry = new SemanticTypeEngineRegistry()
  t.after(() => registry.dispose())
  const firstPosition = resourceCompletionPosition(firstMain, source, firstRoot)
  const secondPosition = resourceCompletionPosition(secondMain, source, secondRoot)
  const first = registry.prepare(workspaceView(firstRootSpelling, firstMain, source))
  const second = registry.prepare(workspaceView(secondRoot, secondMain, source))

  assert.deepEqual(arkuiLabels(first.complete(firstPosition)), ["first_old"])
  assert.deepEqual(arkuiLabels(second.complete(secondPosition)), ["second_old"])
  fs.writeFileSync(firstResource, resourceJson("first_new"), "utf8")
  fs.writeFileSync(secondResource, resourceJson("second_new"), "utf8")

  registry.invalidateArkUIResources(firstRoot)
  const firstAfter = registry.prepare(workspaceView(firstRootSpelling, firstMain, source))
  const secondAfter = registry.prepare(workspaceView(secondRoot, secondMain, source))

  assert.deepEqual(arkuiLabels(firstAfter.complete(firstPosition)), ["first_new"])
  assert.deepEqual(arkuiLabels(secondAfter.complete(secondPosition)), ["second_old"])
  assert.equal(firstAfter.state.generation, first.state.generation)
  assert.equal(secondAfter.state.generation, second.state.generation)
})

test("fans out ArkUI invalidation to lexical engines with the same canonical owner", (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resource-owner-alias-"))
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  const physicalRoot = path.join(base, "physical")
  const firstAlias = path.join(base, "first-alias")
  const secondAlias = path.join(base, "second-alias")
  fs.mkdirSync(physicalRoot)
  fs.symlinkSync(physicalRoot, firstAlias, "dir")
  fs.symlinkSync(physicalRoot, secondAlias, "dir")
  const canonicalRootId = fs.realpathSync.native(physicalRoot)
  const source = 'const value = $r("app.string.")\n'
  const physicalMain = path.join(physicalRoot, "Main.ets")
  const firstMain = path.join(firstAlias, "Main.ets")
  const secondMain = path.join(secondAlias, "Main.ets")
  fs.writeFileSync(physicalMain, source, "utf8")
  const resourcePath = writeStringResource(physicalRoot, "owner_old")
  const { SemanticTypeEngineRegistry } = buildTypeEngineDriver(t)
  const registry = new SemanticTypeEngineRegistry()
  t.after(() => registry.dispose())
  const ownerView = (rootPath, mainPath) => ({
    ...workspaceView(rootPath, mainPath, source),
    canonicalRootId,
    typeEngineResetEpoch: 0,
    contentRevision: 0,
  })
  const firstPosition = resourceCompletionPosition(firstMain, source, firstAlias)
  const secondPosition = resourceCompletionPosition(secondMain, source, secondAlias)
  const first = registry.prepare(ownerView(firstAlias, firstMain))
  const second = registry.prepare(ownerView(secondAlias, secondMain))

  assert.deepEqual(arkuiLabels(first.complete(firstPosition)), ["owner_old"])
  assert.deepEqual(arkuiLabels(second.complete(secondPosition)), ["owner_old"])
  fs.writeFileSync(resourcePath, resourceJson("owner_new"), "utf8")

  registry.invalidateArkUIResources(firstAlias)
  const firstAfter = registry.prepare(ownerView(firstAlias, firstMain))
  const secondAfter = registry.prepare(ownerView(secondAlias, secondMain))

  assert.deepEqual(arkuiLabels(firstAfter.complete(firstPosition)), ["owner_new"])
  assert.deepEqual(arkuiLabels(secondAfter.complete(secondPosition)), ["owner_new"])
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

function definitionPosition(documentPath, workspaceRoot, content, name) {
  const offset = content.lastIndexOf(name) + 1
  const before = content.slice(0, offset)
  const lines = before.split("\n")
  return {
    path: documentPath,
    line: lines.length,
    column: lines.at(-1).length + 1,
    workspaceRoot,
  }
}

function resourceCompletionPosition(documentPath, content, workspaceRoot) {
  return {
    path: documentPath,
    line: 1,
    column: content.indexOf('")') + 1,
    workspaceRoot,
  }
}

function writeStringResource(workspaceRoot, name) {
  const resourcePath = path.join(workspaceRoot, "resources", "base", "element", "string.json")
  fs.mkdirSync(path.dirname(resourcePath), { recursive: true })
  fs.writeFileSync(resourcePath, resourceJson(name), "utf8")
  return resourcePath
}

function resourceJson(name) {
  return `${JSON.stringify({ string: [{ name, value: name }] }, null, 2)}\n`
}

function arkuiLabels(items) {
  return items.filter(({ source }) => source === "arkui").map(({ label }) => label)
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
