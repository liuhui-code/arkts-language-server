import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { buildSync } from "esbuild"

import { buildDocumentStoreDriver } from "./support/build-document-store-driver.mjs"
import { projectRoot } from "./support/lsp-process.mjs"

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

test("disk reads checkpoint between bounded chunks, close on cancellation, and retry exactly", (t) => {
  const payload = "x".repeat(160 * 1024)
  const content = `export const payload = "${payload}"\n`
  const workspace = createWorkspace(t, { "Main.ets": content })
  const mainPath = path.join(workspace, "Main.ets")
  const cancellation = new Error("cancel disk read")
  const cleanupFailure = new Error("descriptor cleanup failed")
  const driverRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-disk-read-driver-"))
  t.after(() => fs.rmSync(driverRoot, { recursive: true, force: true }))
  const { SemanticDocumentStore } = buildDocumentStoreDriver(driverRoot)
  const originalOpen = fs.openSync
  const originalRead = fs.readSync
  const originalClose = fs.closeSync
  const targetDescriptors = new Set()
  let cancelOnFirstChunk = true
  let cancelled = false
  let cancellationObserved = false
  let cleanupFailureObserved = false
  let openedDescriptors = 0
  let closedDescriptors = 0
  let readCalls = 0
  let readsAfterCancellation = 0
  let largestRequestedRead = 0
  fs.openSync = (filePath, ...args) => {
    const descriptor = originalOpen(filePath, ...args)
    if (path.resolve(String(filePath)) === mainPath) {
      targetDescriptors.add(descriptor)
      openedDescriptors += 1
    }
    return descriptor
  }
  fs.readSync = (descriptor, buffer, offset, length, position) => {
    if (!targetDescriptors.has(descriptor)) {
      return originalRead(descriptor, buffer, offset, length, position)
    }
    readCalls += 1
    largestRequestedRead = Math.max(largestRequestedRead, length)
    if (cancelled) readsAfterCancellation += 1
    const bytesRead = originalRead(
      descriptor,
      buffer,
      offset,
      Math.min(length, 64 * 1024),
      position,
    )
    if (cancelOnFirstChunk && readCalls === 1) cancelled = true
    return bytesRead
  }
  fs.closeSync = (descriptor) => {
    const target = targetDescriptors.has(descriptor)
    const result = originalClose(descriptor)
    if (target) {
      targetDescriptors.delete(descriptor)
      closedDescriptors += 1
      if (cancellationObserved && !cleanupFailureObserved) {
        cleanupFailureObserved = true
        throw cleanupFailure
      }
    }
    return result
  }
  t.after(() => {
    fs.openSync = originalOpen
    fs.readSync = originalRead
    fs.closeSync = originalClose
  })
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
  const position = {
    path: mainPath,
    line: 1,
    column: 1,
    workspaceRoot: workspace,
  }

  assert.throws(
    () => store.prepare(position),
    (error) => error === cancellation,
  )
  assert.equal(readCalls, 1, "no second chunk may be read after cancellation")
  assert.equal(readsAfterCancellation, 0)
  assert.ok(largestRequestedRead <= 64 * 1024)
  assert.equal(openedDescriptors, 1)
  assert.equal(closedDescriptors, openedDescriptors)
  assert.equal(cleanupFailureObserved, true)

  cancelOnFirstChunk = false
  cancelled = false
  cancellationObserved = false
  readCalls = 0
  const retried = store.prepare(position)
  assert.equal(documentContent(retried, mainPath), content)
  assert.ok(readCalls >= 3, "the retry must read the complete multi-chunk file")
  assert.equal(closedDescriptors, openedDescriptors)
})

test("workspace hydration admits aggregate bytes before reading and retries an uncommitted file", (t) => {
  const maxDiskBytes = 4 * 1024 * 1024
  const aContent = sourceWithExactBytes("a", maxDiskBytes)
  const bContent = sourceWithExactBytes("b", maxDiskBytes)
  const workspace = createWorkspace(t, {
    "Main.ets": "export const main = 1\n",
    "A.ets": aContent,
    "B.ets": bContent,
  })
  const mainPath = path.join(workspace, "Main.ets")
  const aPath = path.join(workspace, "A.ets")
  const bPath = path.join(workspace, "B.ets")
  const driverRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-hydration-admission-driver-"))
  t.after(() => fs.rmSync(driverRoot, { recursive: true, force: true }))
  const { SemanticDocumentStore } = buildDocumentStoreDriver(driverRoot)
  const store = new SemanticDocumentStore({
    enumerateWorkspaceSources: () => [mainPath, aPath, bPath],
  })
  t.after(() => store.dispose())
  const position = syncPosition(store, workspace, mainPath)

  const originalOpen = fs.openSync
  const originalFstat = fs.fstatSync
  const originalRead = fs.readSync
  const originalClose = fs.closeSync
  const descriptorPaths = new Map()
  const openCounts = new Map()
  const fstatCounts = new Map()
  const readCounts = new Map()
  const closeCounts = new Map()
  fs.openSync = (filePath, ...args) => {
    const descriptor = originalOpen(filePath, ...args)
    const resolvedPath = path.resolve(String(filePath))
    if (resolvedPath === aPath || resolvedPath === bPath) {
      descriptorPaths.set(descriptor, resolvedPath)
      incrementCount(openCounts, resolvedPath)
    }
    return descriptor
  }
  fs.fstatSync = (descriptor, ...args) => {
    const descriptorPath = descriptorPaths.get(descriptor)
    if (descriptorPath) incrementCount(fstatCounts, descriptorPath)
    return originalFstat(descriptor, ...args)
  }
  fs.readSync = (descriptor, ...args) => {
    const descriptorPath = descriptorPaths.get(descriptor)
    if (descriptorPath) incrementCount(readCounts, descriptorPath)
    return originalRead(descriptor, ...args)
  }
  fs.closeSync = (descriptor) => {
    const descriptorPath = descriptorPaths.get(descriptor)
    const result = originalClose(descriptor)
    if (descriptorPath) {
      descriptorPaths.delete(descriptor)
      incrementCount(closeCounts, descriptorPath)
    }
    return result
  }
  t.after(() => {
    fs.openSync = originalOpen
    fs.fstatSync = originalFstat
    fs.readSync = originalRead
    fs.closeSync = originalClose
  })

  const first = store.prepare(position, true)

  assert.deepEqual(
    first.documents.map(({ path: documentPath }) => documentPath).sort(),
    [mainPath, aPath].sort(),
  )
  assert.ok((readCounts.get(aPath) ?? 0) > 0, "the admitted A file must be read")
  assert.equal(openCounts.get(bPath), 1, "B must be opened so its descriptor size can be admitted")
  assert.equal(fstatCounts.get(bPath), 1, "B admission must use the opened descriptor identity")
  assert.equal(readCounts.get(bPath) ?? 0, 0, "B must be rejected before allocation and read")
  assert.equal(closeCounts.get(bPath), 1, "budget rejection must close B's descriptor")

  fs.unlinkSync(aPath)
  store.workspaceFilesChanged({
    rootPath: workspace,
    rootDirty: false,
    changes: [{ path: aPath, kind: "deleted" }],
  })
  readCounts.set(bPath, 0)
  const retried = store.prepare(position, true)

  assert.deepEqual(
    retried.documents.map(({ path: documentPath }) => documentPath).sort(),
    [mainPath, bPath].sort(),
  )
  assert.ok(
    (readCounts.get(bPath) ?? 0) > 0,
    "a fresh retry must really read B; aggregate rejection must not pollute the cache",
  )
  assert.equal(Buffer.byteLength(documentContent(retried, bPath)), maxDiskBytes)
})

test("cold dependency traversal rolls back a loaded prefix and retries the full closure", (t) => {
  const mainContent = [
    'import { a } from "./A"',
    'import { b } from "./B"',
    "export const main = a + b",
    "",
  ].join("\n")
  const aContent = "export const a = 1\n"
  const bContent = "export const b = 2\n"
  const workspace = createWorkspace(t, {
    "Main.ets": mainContent,
    "A.ets": aContent,
    "B.ets": bContent,
  })
  const mainPath = path.join(workspace, "Main.ets")
  const aPath = path.join(workspace, "A.ets")
  const bPath = path.join(workspace, "B.ets")
  const cancellation = new Error("cancel cold dependency traversal")
  const driverRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-cold-closure-driver-"))
  t.after(() => fs.rmSync(driverRoot, { recursive: true, force: true }))
  const { SemanticDocumentStore } = buildDocumentStoreDriver(driverRoot)
  const originalOpen = fs.openSync
  const originalClose = fs.closeSync
  const descriptorPaths = new Map()
  const openCounts = new Map()
  let cancelAfterA = true
  let cancelled = false
  fs.openSync = (filePath, ...args) => {
    const descriptor = originalOpen(filePath, ...args)
    const resolvedPath = path.resolve(String(filePath))
    descriptorPaths.set(descriptor, resolvedPath)
    openCounts.set(resolvedPath, (openCounts.get(resolvedPath) ?? 0) + 1)
    return descriptor
  }
  fs.closeSync = (descriptor) => {
    const descriptorPath = descriptorPaths.get(descriptor)
    const result = originalClose(descriptor)
    descriptorPaths.delete(descriptor)
    if (cancelAfterA && descriptorPath === aPath) cancelled = true
    return result
  }
  t.after(() => {
    fs.openSync = originalOpen
    fs.closeSync = originalClose
  })
  const store = new SemanticDocumentStore({
    operationControl: {
      checkpoint() {
        if (cancelled) throw cancellation
      },
    },
  })
  t.after(() => store.dispose())
  const position = {
    path: mainPath,
    line: 1,
    column: 1,
    workspaceRoot: workspace,
  }

  assert.throws(
    () => store.prepare(position),
    (error) => error === cancellation,
  )
  assert.equal(openCounts.get(aPath), 1)
  assert.equal(openCounts.get(bPath) ?? 0, 0, "B must not open after A arms cancellation")

  cancelAfterA = false
  cancelled = false
  const retried = store.prepare(position)
  assert.equal(openCounts.get(aPath), 2, "a cancelled prefix must not remain in the document cache")
  assert.equal(openCounts.get(bPath), 1)
  assert.equal(retried.state.dependencyClosureCacheHit, false)
  assert.equal(documentContent(retried, aPath), aContent)
  assert.equal(documentContent(retried, bPath), bContent)

  const warm = store.prepare(position)
  assert.equal(warm.state.dependencyClosureCacheHit, true)
})

test("warm closure validation cancels after A stat, preserves the closure, and later invalidates", (t) => {
  const mainContent = [
    'import { a } from "./A"',
    'import { b } from "./B"',
    "export const main = a + b",
    "",
  ].join("\n")
  const originalA = "export const a = 1\n"
  const changedA = "export const a = 100\n"
  const bContent = "export const b = 2\n"
  const workspace = createWorkspace(t, {
    "Main.ets": mainContent,
    "A.ets": originalA,
    "B.ets": bContent,
  })
  const mainPath = path.join(workspace, "Main.ets")
  const aPath = path.join(workspace, "A.ets")
  const bPath = path.join(workspace, "B.ets")
  const cancellation = new Error("cancel warm closure validation")
  const staleStatUse = new Error("used A stat after cancellation")
  const driverRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-warm-closure-driver-"))
  t.after(() => fs.rmSync(driverRoot, { recursive: true, force: true }))
  const { SemanticDocumentStore } = buildDocumentStoreDriver(driverRoot)
  let cancelled = false
  const store = new SemanticDocumentStore({
    operationControl: {
      checkpoint() {
        if (cancelled) throw cancellation
      },
    },
  })
  t.after(() => store.dispose())
  const position = {
    path: mainPath,
    line: 1,
    column: 1,
    workspaceRoot: workspace,
  }
  store.prepare(position)
  assert.equal(store.prepare(position).state.dependencyClosureCacheHit, true)

  const originalStat = fs.statSync
  const dependencyStats = []
  let cancelOnAStat = true
  fs.statSync = (filePath, ...args) => {
    const stat = originalStat(filePath, ...args)
    const resolvedPath = path.resolve(String(filePath))
    if (resolvedPath === aPath || resolvedPath === bPath) dependencyStats.push(resolvedPath)
    if (!cancelOnAStat || resolvedPath !== aPath) return stat
    cancelled = true
    return new Proxy(stat, {
      get(target, property, receiver) {
        if (property === "mtimeMs") throw staleStatUse
        return Reflect.get(target, property, receiver)
      },
    })
  }
  t.after(() => { fs.statSync = originalStat })

  assert.throws(
    () => store.prepare(position),
    (error) => error === cancellation,
  )
  assert.deepEqual(dependencyStats, [aPath], "B must not be statted after A arms cancellation")

  cancelOnAStat = false
  cancelled = false
  dependencyStats.length = 0
  const retried = store.prepare(position)
  assert.equal(retried.state.dependencyClosureCacheHit, true)
  assert.deepEqual(dependencyStats, [aPath, bPath])

  fs.writeFileSync(aPath, changedA, "utf8")
  const invalidated = store.prepare(position)
  assert.equal(invalidated.state.dependencyClosureCacheHit, false)
  assert.equal(documentContent(invalidated, aPath), changedA)
  assert.equal(documentContent(invalidated, bPath), bContent)
  assert.equal(store.prepare(position).state.dependencyClosureCacheHit, true)
})

test("cancellation at workspace assembly preserves a removed dependency delta for TypeScript retry", (t) => {
  const mainContent = [
    'import { target } from "./A"',
    "export const result = target()",
    "",
  ].join("\n")
  const aContent = "export function target(): number { return 1 }\n"
  const workspace = createWorkspace(t, {
    "Main.ets": mainContent,
    "A.ets": aContent,
  })
  const mainPath = path.join(workspace, "Main.ets")
  const aPath = path.join(workspace, "A.ets")
  const cancellation = new Error("cancel final workspace assembly")
  const driverRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-removed-delta-driver-"))
  t.after(() => fs.rmSync(driverRoot, { recursive: true, force: true }))
  const { SemanticDocumentStore } = buildDocumentStoreDriver(driverRoot)
  const { TypeScriptLanguageServiceEngine } = buildTypeEngineDriver(t)
  let cancellationEnabled = false
  let cancelled = false
  let missingStatCalls = 0
  let checkpointsAfterAllMisses = 0
  const store = new SemanticDocumentStore({
    operationControl: {
      checkpoint() {
        if (cancelled) throw cancellation
        if (!cancellationEnabled || missingStatCalls < 5) return
        checkpointsAfterAllMisses += 1
        if (checkpointsAfterAllMisses === 3) {
          cancelled = true
          throw cancellation
        }
      },
    },
  })
  const engine = new TypeScriptLanguageServiceEngine(workspace)
  t.after(() => {
    store.dispose()
    engine.dispose()
  })
  const position = {
    path: mainPath,
    line: 2,
    column: "export const result = ".length + 2,
    workspaceRoot: workspace,
  }
  const initial = store.prepare(position)
  engine.prepare(initial)
  assert.deepEqual(definitionPaths(engine.define(position)), [aPath])

  fs.unlinkSync(aPath)
  const originalStat = fs.statSync
  fs.statSync = (filePath, ...args) => {
    try {
      return originalStat(filePath, ...args)
    } catch (error) {
      const resolvedPath = path.resolve(String(filePath))
      if (
        resolvedPath === aPath
        || resolvedPath === path.join(workspace, "A.ts")
        || resolvedPath === path.join(workspace, "A", "index.ets")
        || resolvedPath === path.join(workspace, "A", "index.ts")
      ) missingStatCalls += 1
      throw error
    }
  }
  t.after(() => { fs.statSync = originalStat })
  cancellationEnabled = true

  assert.throws(
    () => store.prepare(position),
    (error) => error === cancellation,
  )
  assert.equal(missingStatCalls, 5)
  assert.equal(checkpointsAfterAllMisses, 3)

  cancellationEnabled = false
  cancelled = false
  const retryOne = store.prepare(position)
  const retryTwo = store.prepare(position)
  engine.prepare(retryOne)
  engine.prepare(retryTwo)

  assert.deepEqual({
    retryOneRemovedPaths: retryOne.removedPaths,
    retryTwoRemovedPaths: retryTwo.removedPaths,
  }, {
    retryOneRemovedPaths: [aPath],
    retryTwoRemovedPaths: [],
  })
  assert.equal(
    definitionPaths(engine.define(position)).includes(aPath),
    false,
    "TypeScript must not retain the deleted dependency as a definition target",
  )
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

function sourceWithExactBytes(name, byteLength) {
  const prefix = `export const ${name} = "`
  const suffix = '"\n'
  const paddingBytes = byteLength - Buffer.byteLength(prefix) - Buffer.byteLength(suffix)
  assert.ok(paddingBytes >= 0)
  return `${prefix}${"x".repeat(paddingBytes)}${suffix}`
}

function incrementCount(counts, key) {
  counts.set(key, (counts.get(key) ?? 0) + 1)
}

function buildTypeEngineDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-store-type-engine-driver-"))
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  const outfile = path.join(outputRoot, "typescript-language-service.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "core", "types", "typescript-language-service.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
  })
  return createRequire(import.meta.url)(outfile)
}

function definitionPaths(definitions) {
  return [...new Set(definitions.map((definition) => path.resolve(definition.path)))].sort()
}
