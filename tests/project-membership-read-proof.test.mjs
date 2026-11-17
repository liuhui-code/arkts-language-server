import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { spawnSync } from "node:child_process"
import { buildSync } from "esbuild"
import { buildDocumentStoreDriver } from "./support/build-document-store-driver.mjs"

function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-admitted-read-"))
  const root = path.join(directory, "project"), alias = path.join(directory, "alias")
  fs.mkdirSync(root)
  const file = path.join(root, "名字 空间.ets"), content = "export class Target {}\n"
  fs.writeFileSync(file, content)
  fs.symlinkSync(root, alias, process.platform === "win32" ? "junction" : "dir")
  const { SemanticDocumentStore } = buildDocumentStoreDriver(directory)
  const store = new SemanticDocumentStore(options)
  t.after(() => { store.dispose(); fs.rmSync(directory, { recursive: true, force: true }) })
  return { directory, root, alias, file, content, store }
}

function admitted(store, root, file) {
  const membership = store.membershipFor(root)
  assert.equal(membership.status, "complete")
  const canonical = fs.realpathSync.native(root)
  const token = store.tokenFor(canonical, membership.revision, file)
  assert.ok(token)
  return () => store.read(canonical, membership.revision, file, token)
}

test("admitted reads retain lexical root aliases and reject a later replacement", t => {
  const f = fixture(t), file = path.join(f.alias, path.basename(f.file))
  const read = admitted(f.store, f.alias, file)
  assert.equal(read(), f.content)
  fs.renameSync(f.file, f.file + ".old")
  fs.writeFileSync(f.file, f.content)
  assert.equal(read(), null, "identical bytes do not renew an old inode token")
})

test("an opened admitted source cannot hide a directory retarget during its read", t => {
  const f = fixture(t), read = admitted(f.store, f.alias, path.join(f.alias, path.basename(f.file)))
  const other = path.join(f.directory, "other")
  fs.mkdirSync(other)
  fs.writeFileSync(path.join(other, path.basename(f.file)), f.content)
  const original = fs.openSync
  let changed = false
  fs.openSync = function (file, ...args) {
    const fd = Reflect.apply(original, this, [file, ...args])
    if (!changed && file === path.join(f.alias, path.basename(f.file))) {
      changed = true
      fs.unlinkSync(f.alias)
      fs.symlinkSync(other, f.alias, process.platform === "win32" ? "junction" : "dir")
    }
    return fd
  }
  try { assert.equal(read(), null) } finally { fs.openSync = original }
  assert.equal(changed, true, "the retarget must occur after the actual open")
})

test("admitted source cancellation propagates instead of becoming an unavailable input", t => {
  const cancelled = new Error("read cancelled")
  let armed = false
  const f = fixture(t, { operationControl: { checkpoint() { if (armed) throw cancelled } } })
  const read = admitted(f.store, f.root, f.file)
  armed = true
  assert.throws(read, error => error === cancelled)
})

test("a witnessed native catalog read performs only its two live path identity fences", t => {
  const f = fixture(t), file = path.join(f.alias, path.basename(f.file))
  const read = admitted(f.store, f.alias, file)
  const original = fs.realpathSync.native, paths = []
  fs.realpathSync.native = function (...args) {
    paths.push(args[0])
    return Reflect.apply(original, this, args)
  }
  try { assert.equal(read(), f.content) } finally { fs.realpathSync.native = original }
  assert.deepEqual(paths, [file, file], "retain both live fences, avoid a third initial canonicalization")
})

test("injected enumerations cannot supply directory-derived physical path authority", t => {
  const f = fixture(t, { enumerateWorkspaceSources: root => [path.join(root, "名字 空间.ets")] })
  const read = admitted(f.store, f.root, f.file), original = fs.realpathSync.native, paths = []
  fs.realpathSync.native = function (...args) {
    paths.push(args[0])
    return Reflect.apply(original, this, args)
  }
  try { assert.equal(read(), f.content) } finally { fs.realpathSync.native = original }
  assert.deepEqual(paths, [f.file, f.file, f.file])
})

test("partial catalogs keep the ordinary canonical path admission", t => {
  const f = fixture(t, { projectFileSetLimits: { maxPaths: 1 } })
  fs.writeFileSync(path.join(f.root, "Other.ets"), "export const other = 1\n")
  const membership = f.store.membershipFor(f.root)
  assert.equal(membership.status, "partial")
  const file = membership.paths[0], content = fs.readFileSync(file, "utf8")
  const canonical = fs.realpathSync.native(f.root)
  const token = f.store.tokenFor(canonical, membership.revision, file)
  assert.ok(token)
  const original = fs.realpathSync.native, paths = []
  fs.realpathSync.native = function (...args) {
    paths.push(args[0])
    return Reflect.apply(original, this, args)
  }
  try { assert.equal(f.store.read(canonical, membership.revision, file, token), content) }
  finally { fs.realpathSync.native = original }
  assert.deepEqual(paths, [file, file, file])
})

test("a same-inode alias retarget after the pre-read proof still fails the final path fence", t => {
  const f = fixture(t), other = path.join(f.directory, "other")
  fs.mkdirSync(other)
  fs.linkSync(f.file, path.join(other, path.basename(f.file)))
  const file = path.join(f.alias, path.basename(f.file)), read = admitted(f.store, f.alias, file)
  const original = fs.realpathSync.native
  let changed = false
  fs.realpathSync.native = function (...args) {
    const physical = Reflect.apply(original, this, args)
    if (!changed && args[0] === file) {
      changed = true
      fs.unlinkSync(f.alias)
      fs.symlinkSync(other, f.alias, process.platform === "win32" ? "junction" : "dir")
    }
    return physical
  }
  try { assert.equal(read(), null) } finally { fs.realpathSync.native = original }
  assert.equal(changed, true)
})


test("replaced complete catalogs release their previous public snapshots", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-catalog-lifetime-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const runtime = path.join(directory, "catalog-lifetime.cjs")
  buildSync({ stdin: { resolveDir: process.cwd(), sourcefile: "catalog-lifetime-entry.ts", contents: String.raw`
    import fs from "node:fs"
    import path from "node:path"
    import assert from "node:assert/strict"
    import { SemanticDocumentStore } from "./src/core/workspace/document-store.js"
    import { LocalPackageResolver } from "./src/core/sdk/local-package-resolver.js"
    async function main() {
      const root = path.join(${JSON.stringify(directory)}, "project")
      fs.mkdirSync(root)
      fs.writeFileSync(path.join(root, "Main.ets"), "export const value = 1\n")
      const resolver = new LocalPackageResolver()
      resolver.enableConfigurationWitness()
      const store = new SemanticDocumentStore({ packageResolver: resolver })
      const replace = (index) => {
        const previous = new WeakRef(store.membershipFor(root))
        fs.writeFileSync(path.join(root, "Source" + index + ".ets"), "export {}\n")
        assert.equal(store.refreshProjectMembership(root).changed, true)
        return previous
      }
      const previous = Array.from({ length: 8 }, (_, index) => replace(index))
      const control = new WeakRef({ kind: "unowned-control" })
      for (let iteration = 0; iteration < 8; iteration++) {
        await new Promise(resolve => setImmediate(resolve))
        global.gc()
      }
      assert.equal(control.deref(), undefined, "forced collection must be observable")
      const retained = previous.filter(ref => ref.deref() !== undefined).length
      console.log(JSON.stringify({ replacements: previous.length, retainedSnapshots: retained }))
      assert.equal(retained, 0, "a current namespace proof must not retain previous catalog generations")
      assert.equal(store.membershipFor(root).paths.length, 9)
      store.dispose()
    }
    main().catch(error => { console.error(error); process.exitCode = 1 })
  ` }, bundle: true, platform: "node", target: "node20", format: "cjs", outfile: runtime })
  const result = spawnSync(process.execPath, ["--expose-gc", runtime], { encoding: "utf8", timeout: 15_000 })
  assert.equal(result.signal, null, result.stderr)
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { replacements: 8, retainedSnapshots: 0 })
})
