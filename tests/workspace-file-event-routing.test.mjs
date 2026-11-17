import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { buildDriver } from "./support/workspace-file-change-driver.mjs"

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
  const coordinator = new WorkspaceFileChangeCoordinator({ rootUris: [rootUri], isSourceNamespace: () => false })

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
    isSourceNamespace: () => false,
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

