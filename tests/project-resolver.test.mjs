import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { buildSync } from "esbuild"

import { projectRoot } from "./support/lsp-process.mjs"

const output = path.join(projectRoot, "dist", "project-resolver-driver.cjs")
buildSync({
  entryPoints: [path.join(
    projectRoot,
    "tests",
    "fixtures",
    "project",
    "project-resolver-driver.ts",
  )],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: output,
})
const driver = createRequire(import.meta.url)(output)

test("selects the longest containing workspace root without prefix collisions", () => {
  assert.deepEqual(driver.resolveMultiRootDocuments(), {
    first: "file:///Workspace",
    nested: "file:///Workspace/packages/app",
    sibling: "file:///WorkspaceTwo",
    prefixCollision: "file:///Workspace",
  })
})

test("warm platform imports do not repeat ancestor filesystem traversal", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-package-owner-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const directory = path.join(root, "entry", "src", "main", "ets")
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(root, "entry", "oh-package.json5"), "{ dependencies: {} }")
  const containingFile = path.join(directory, "Index.ets")
  const resolver = new driver.LocalPackageResolver()
  assert.equal(resolver.resolve(root, containingFile, "@ohos.hilog"), undefined)

  const realpath = fs.realpathSync.native
  let filesystemLookups = 0
  t.mock.method(fs.realpathSync, "native", (...args) => {
    filesystemLookups += 1
    return realpath(...args)
  })
  for (let index = 0; index < 100; index += 1) {
    assert.equal(resolver.resolve(root, containingFile, "@ohos.hilog"), undefined)
  }
  assert.equal(filesystemLookups, 0, "warm undeclared imports must not repeat disk ownership checks")
})

test("negative ownership snapshots stay warm and observe a new manifest after invalidation", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-package-negative-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const directory = path.join(root, "entry", "src")
  const shared = path.join(root, "shared")
  fs.mkdirSync(directory, { recursive: true })
  fs.mkdirSync(shared)
  fs.writeFileSync(path.join(shared, "oh-package.json5"), "{ main: 'Index.ets' }")
  const entry = path.join(shared, "Index.ets")
  fs.writeFileSync(entry, "export class Shared {}")
  const containingFile = path.join(directory, "Index.ets")
  const resolver = new driver.LocalPackageResolver()
  assert.equal(resolver.resolve(root, containingFile, "shared"), undefined)

  const realpath = fs.realpathSync.native
  let filesystemLookups = 0
  t.mock.method(fs.realpathSync, "native", (...args) => {
    filesystemLookups += 1
    return realpath(...args)
  })
  assert.equal(resolver.resolve(root, containingFile, "shared"), undefined)
  assert.equal(filesystemLookups, 0)
  fs.writeFileSync(path.join(root, "entry", "oh-package.json5"), "{ dependencies: { shared: 'file:../shared' } }")
  resolver.invalidate(root)
  assert.deepEqual(resolver.resolve(root, containingFile, "shared"), { path: entry })
})

test("directory ownership retention is bounded while recently used imports remain warm", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-package-bounded-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.writeFileSync(path.join(root, "oh-package.json5"), "{ dependencies: {} }")
  const resolver = new driver.LocalPackageResolver()
  const sources = []
  for (let index = 0; index < 257; index += 1) {
    const directory = path.join(root, `source-${index}`)
    fs.mkdirSync(directory)
    const source = path.join(directory, "Index.ets")
    sources.push(source)
    assert.equal(resolver.resolve(root, source, "@ohos.hilog"), undefined)
  }
  const realpath = fs.realpathSync.native
  let filesystemLookups = 0
  t.mock.method(fs.realpathSync, "native", (...args) => {
    filesystemLookups += 1
    return realpath(...args)
  })
  assert.equal(resolver.resolve(root, sources.at(-1), "@ohos.hilog"), undefined)
  assert.equal(filesystemLookups, 0)
  assert.equal(resolver.resolve(root, sources[0], "@ohos.hilog"), undefined)
  assert.ok(filesystemLookups > 0, "old ownership snapshots must be evicted instead of growing indefinitely")
})

test("warm ownership does not cache entry existence or an open overlay", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-package-live-entry-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const directory = path.join(root, "entry", "src")
  const shared = path.join(root, "shared")
  fs.mkdirSync(directory, { recursive: true })
  fs.mkdirSync(shared)
  fs.writeFileSync(path.join(root, "entry", "oh-package.json5"), "{ dependencies: { shared: 'file:../shared' } }")
  fs.writeFileSync(path.join(shared, "oh-package.json5"), "{ main: 'Index.ets' }")
  const entry = path.join(shared, "Index.ets")
  fs.writeFileSync(entry, "export class Shared {}")
  const containingFile = path.join(directory, "Index.ets")
  const resolver = new driver.LocalPackageResolver()
  assert.deepEqual(resolver.resolve(root, containingFile, "shared"), { path: entry })
  fs.unlinkSync(entry)
  assert.deepEqual(resolver.resolve(root, containingFile, "shared"), { path: null })
  assert.deepEqual(resolver.resolve(root, containingFile, "shared", { hasOverlay: (file) => file === entry }), { path: entry })
  assert.deepEqual(resolver.resolve(root, containingFile, "shared"), { path: null })
})

test("one canonical package entry snapshot drives overlay lookup and containment", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-package-entry-snapshot-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const directory = path.join(root, "entry", "src")
  const shared = path.join(root, "shared")
  fs.mkdirSync(directory, { recursive: true })
  fs.mkdirSync(shared)
  fs.writeFileSync(
    path.join(root, "entry", "oh-package.json5"),
    "{ dependencies: { shared: 'file:../shared' } }",
  )
  fs.writeFileSync(path.join(shared, "oh-package.json5"), "{ main: 'Index.ets' }")
  const entry = path.join(shared, "Index.ets")
  fs.writeFileSync(entry, "export class Shared {}")
  const containingFile = path.join(directory, "Index.ets")
  const resolver = new driver.LocalPackageResolver()
  const realpath = fs.realpathSync.native
  const canonicalEntry = realpath(entry)
  let entrySnapshots = 0
  t.mock.method(fs.realpathSync, "native", (...args) => {
    if (path.resolve(String(args[0])) === entry) entrySnapshots += 1
    return realpath(...args)
  })
  const overlayQueries = []

  assert.deepEqual(resolver.resolve(root, containingFile, "shared", {
    overlayPath(physicalPath) {
      overlayQueries.push(physicalPath)
      return undefined
    },
  }), { path: entry })
  assert.deepEqual(overlayQueries, [canonicalEntry])
  assert.equal(
    entrySnapshots,
    1,
    "one immutable physical identity must serve both overlay selection and containment",
  )
})

test("reuses the canonical workspace root across relative source resolutions", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-relative-root-snapshot-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const containingFile = path.join(root, "Main.ets")
  const candidate = path.join(root, "Target.ets")
  fs.writeFileSync(containingFile, "import { target } from './Target'\n")
  fs.writeFileSync(candidate, "export const target = 1\n")
  const resolver = new driver.LocalPackageResolver()
  const realpath = fs.realpathSync.native
  let rootSnapshots = 0
  t.mock.method(fs.realpathSync, "native", (...args) => {
    if (path.resolve(String(args[0])) === root) rootSnapshots += 1
    return realpath(...args)
  })

  for (let index = 0; index < 100; index += 1) {
    assert.equal(
      resolver.installedSourcePath(root, containingFile, candidate, () => undefined),
      candidate,
    )
  }
  assert.equal(rootSnapshots, 1, "relative imports must share one canonical root snapshot")
})

test("declared installed imports resolve directly without enumerating oh_modules or its store", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-package-direct-installed-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const directory = path.join(root, "entry", "src")
  const modules = path.join(root, "entry", "oh_modules")
  const shared = path.join(modules, "@example", "shared")
  fs.mkdirSync(directory, { recursive: true })
  fs.mkdirSync(shared, { recursive: true })
  fs.mkdirSync(path.join(modules, ".ohpm", "unrelated@1.0.0"), { recursive: true })
  fs.writeFileSync(path.join(root, "entry", "oh-package.json5"), "{ dependencies: { '@example/shared': '^1.0.0' } }")
  fs.writeFileSync(path.join(shared, "oh-package.json5"), "{ types: 'Index.d.ets' }")
  const entry = path.join(shared, "Index.d.ets")
  fs.writeFileSync(entry, "export declare class Shared {}")
  const resolver = new driver.LocalPackageResolver()

  let directoryEnumerations = 0
  for (const method of ["readdirSync", "opendirSync"]) {
    t.mock.method(fs, method, () => {
      directoryEnumerations += 1
      throw new Error("Installed named imports must not enumerate dependency directories")
    })
  }
  for (let index = 0; index < 100; index += 1) {
    assert.deepEqual(resolver.resolve(root, path.join(directory, "Index.ets"), "@example/shared"), { path: entry })
  }
  assert.equal(directoryEnumerations, 0, "cold and warm imports must select only the declared package")
})

test("an installed but undeclared dependency is neither resolved nor inspected", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-package-undeclared-installed-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const directory = path.join(root, "entry", "src")
  const shared = path.join(root, "entry", "oh_modules", "@example", "shared")
  fs.mkdirSync(directory, { recursive: true })
  fs.mkdirSync(shared, { recursive: true })
  fs.writeFileSync(path.join(root, "entry", "oh-package.json5"), "{ dependencies: {} }")
  fs.writeFileSync(path.join(shared, "oh-package.json5"), "{ types: 'Index.d.ets' }")
  fs.writeFileSync(path.join(shared, "Index.d.ets"), "export declare class Shared {}")
  const resolver = new driver.LocalPackageResolver()

  const dependencyAccesses = []
  function observe(method, original) {
    return (...args) => {
      if (/(?:^|[/\\])oh_modules(?:[/\\]|$)/.test(String(args[0]))) {
        dependencyAccesses.push({ method, path: String(args[0]) })
      }
      return original(...args)
    }
  }
  for (const method of ["openSync", "readFileSync", "statSync", "lstatSync", "accessSync", "existsSync", "readdirSync", "opendirSync"]) {
    t.mock.method(fs, method, observe(method, fs[method]))
  }
  t.mock.method(fs.realpathSync, "native", observe("realpathSync.native", fs.realpathSync.native))

  for (let index = 0; index < 100; index += 1) {
    assert.equal(resolver.resolve(root, path.join(directory, "Index.ets"), "@example/shared"), undefined)
  }
  assert.deepEqual(dependencyAccesses, [], "installation alone must not authorize dependency lookup")
})

test("warm installed imports do not repeat ancestor candidate probes", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-installed-warm-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, "entry", "src", "main", "ets", "deep", "Page.ets")
  const installed = path.join(root, "entry", "oh_modules", "shared")
  fs.mkdirSync(path.dirname(source), { recursive: true })
  fs.mkdirSync(installed, { recursive: true })
  fs.writeFileSync(path.join(root, "entry", "oh-package.json5"), "{ dependencies: { shared: '1.0.0' } }")
  fs.writeFileSync(path.join(installed, "oh-package.json5"), "{ main: 'Index.ets' }")
  const entry = path.join(installed, "Index.ets")
  fs.writeFileSync(entry, "export class Shared {}")
  const resolver = new driver.LocalPackageResolver()
  assert.deepEqual(resolver.resolve(root, source, "shared"), { path: entry })
  const lstat = fs.lstatSync
  let ancestorProbes = 0
  t.mock.method(fs, "lstatSync", (...args) => {
    ancestorProbes += 1
    return lstat(...args)
  })
  for (let index = 0; index < 100; index += 1) {
    assert.deepEqual(resolver.resolve(root, source, "shared"), { path: entry })
  }
  assert.equal(ancestorProbes, 0, "unchanged installed imports must reuse bounded installation lookup metadata")
})

test("installation lookup retention is bounded while recently used candidates stay warm", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-installed-bounded-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const installed = path.join(root, "oh_modules", "shared")
  fs.mkdirSync(installed, { recursive: true })
  fs.writeFileSync(path.join(root, "oh-package.json5"), "{ dependencies: { shared: '1.0.0' } }")
  fs.writeFileSync(path.join(installed, "oh-package.json5"), "{ main: 'Index.ets' }")
  const entry = path.join(installed, "Index.ets")
  fs.writeFileSync(entry, "export class Shared {}")
  const resolver = new driver.LocalPackageResolver()
  const sources = []
  for (let index = 0; index < 257; index += 1) {
    const directory = path.join(root, `source-${index}`)
    fs.mkdirSync(directory)
    const source = path.join(directory, "Index.ets")
    sources.push(source)
    assert.deepEqual(resolver.resolve(root, source, "shared"), { path: entry })
  }
  const lstat = fs.lstatSync
  let probes = 0
  t.mock.method(fs, "lstatSync", (...args) => {
    probes += 1
    return lstat(...args)
  })
  assert.deepEqual(resolver.resolve(root, sources[256], "shared"), { path: entry })
  assert.equal(probes, 0)
  assert.deepEqual(resolver.resolve(root, sources[0], "shared"), { path: entry })
  assert.ok(probes > 0, "an evicted candidate must be rediscovered instead of retained without a bound")
})

test("installation invalidation selects a newly installed nearer package", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-installed-invalidate-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, "entry", "src", "Page.ets")
  const outer = path.join(root, "oh_modules", "shared")
  fs.mkdirSync(path.dirname(source), { recursive: true })
  fs.mkdirSync(outer, { recursive: true })
  fs.writeFileSync(path.join(root, "entry", "oh-package.json5"), "{ dependencies: { shared: '1.0.0' } }")
  fs.writeFileSync(path.join(outer, "oh-package.json5"), "{ main: 'Outer.ets' }")
  fs.writeFileSync(path.join(outer, "Outer.ets"), "export class Shared {}")
  const resolver = new driver.LocalPackageResolver()
  assert.deepEqual(resolver.resolve(root, source, "shared"), { path: path.join(outer, "Outer.ets") })
  const nearer = path.join(root, "entry", "oh_modules", "shared")
  fs.mkdirSync(nearer, { recursive: true })
  fs.writeFileSync(path.join(nearer, "oh-package.json5"), "{ types: 'Nearer.d.ets' }")
  fs.writeFileSync(path.join(nearer, "Nearer.d.ets"), "export declare class Shared {}")
  resolver.invalidate(root)
  assert.deepEqual(resolver.resolve(root, source, "shared"), { path: path.join(nearer, "Nearer.d.ets") })
})

test("installation misses and entry overlays remain live outside the lookup cache", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-installed-live-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, "entry", "src", "Page.ets")
  const installed = path.join(root, "entry", "oh_modules", "shared")
  fs.mkdirSync(path.dirname(source), { recursive: true })
  fs.writeFileSync(path.join(root, "entry", "oh-package.json5"), "{ dependencies: { shared: '1.0.0' } }")
  const resolver = new driver.LocalPackageResolver()
  assert.deepEqual(resolver.resolve(root, source, "shared"), { path: null })
  fs.mkdirSync(installed, { recursive: true })
  fs.writeFileSync(path.join(installed, "oh-package.json5"), "{ main: 'Index.ets' }")
  const entry = path.join(installed, "Index.ets")
  fs.writeFileSync(entry, "export class Shared {}")
  assert.deepEqual(resolver.resolve(root, source, "shared"), { path: entry })
  fs.unlinkSync(entry)
  assert.deepEqual(resolver.resolve(root, source, "shared"), { path: null })
  assert.deepEqual(resolver.resolve(root, source, "shared", { hasOverlay: (candidate) => candidate === entry }), { path: entry })
  assert.deepEqual(resolver.resolve(root, source, "shared"), { path: null })
})
