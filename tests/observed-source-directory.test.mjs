import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { createRequire } from "node:module"
import { buildSync } from "esbuild"
import { projectRoot } from "./support/lsp-process.mjs"

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-observed-directory-"))
  const source = path.join(root, "source")
  fs.mkdirSync(source)
  const first = path.join(source, "First.ts"), second = path.join(source, "Second.ts")
  fs.writeFileSync(first, "export class First {}\n")
  fs.writeFileSync(second, "export class Second {}\n")
  const entry = path.join(root, "entry.ts"), bundle = path.join(root, "entry.cjs")
  fs.writeFileSync(entry, [
    `export * from ${JSON.stringify(path.join(projectRoot, "src/project/validated-source-directory.ts"))}`,
    `export * from ${JSON.stringify(path.join(projectRoot, "src/project/request-input-validation.ts"))}`,
    `export * from ${JSON.stringify(path.join(projectRoot, "src/project/source-file-identity.ts"))}`,
  ].join("\n"))
  buildSync({ entryPoints: [entry], outfile: bundle, bundle: true, platform: "node", format: "cjs", target: "node20" })
  const api = { ...createRequire(import.meta.url)(bundle) }
  const stamp = api.diskIdentity(first).stamp, other = api.diskIdentity(second).stamp
  const physicalPath = fs.realpathSync.native(source), names = new Set(fs.readdirSync(source))
  const directoryStamp = () => {
    const stat = fs.lstatSync(source)
    return JSON.stringify([stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeMs, stat.ctimeMs])
  }
  const originalDirectory = directoryStamp()
  const provider = directory => directory === source || directory === physicalPath ? {
    physicalPath, names, bytes: 1024,
    current: () => directoryStamp() === originalDirectory && fs.realpathSync.native(source) === physicalPath,
  } : undefined
  const observed = api.observedSourceIdentity
  api.observedSourceIdentity = (file, expected, checkpoint) => observed(file, expected, checkpoint, provider)
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const unavailable = () => { throw Error("current namespace unavailable") }
  return { root, source, first, second, stamp, other, api, unavailable }
}

test("final directory guard rejects a leaf renamed after that leaf's final validation", t => {
  const { first, second, stamp, other, api, unavailable } = fixture(t)
  const a = {}, b = {}
  let validations = 0
  assert.throws(() => api.withRequestInputValidation(() => {
    assert.equal(api.validateRequestInput(a, 0, 0, () => api.observedSourceIdentity(first, stamp)?.stamp === stamp), true)
    assert.equal(api.validateRequestInput(b, 0, 0, () => {
      if (++validations === 2) fs.renameSync(first, first + ".moved")
      return api.observedSourceIdentity(second, other)?.stamp === other
    }), true)
    return "must not publish"
  }, unavailable), /current namespace unavailable/)
  assert.equal(validations, 2, "the change occurs in the real final union after the first owner")
})

test("a failed directory fence leaves no poisoned request or namespace cache", t => {
  const { first, stamp, api, unavailable } = fixture(t)
  assert.throws(() => api.withRequestInputValidation(() => {
    assert.equal(api.observedSourceIdentity(first, stamp)?.stamp, stamp)
    fs.writeFileSync(path.join(path.dirname(first), "Added.ts"), "export {}\n")
  }, unavailable), /current namespace unavailable/)
  const current = api.withRequestInputValidation(() => api.observedSourceIdentity(first, stamp), unavailable)
  assert.equal(current.stamp, stamp)
})

test("exact directory spelling prevents stale case-only physical identities", t => {
  const { first, api, unavailable } = fixture(t)
  const renamed = path.join(path.dirname(first), "FIRST.ts")
  const originalPhysicalPath = fs.realpathSync.native(first)
  fs.renameSync(first, renamed)
  // Even filesystems with unchanged leaf timestamps cannot lend the old spelling.
  const expected = api.regularSourceIdentity(originalPhysicalPath, fs.lstatSync(renamed)).stamp
  const observed = api.withRequestInputValidation(() => api.observedSourceIdentity(first, expected), unavailable)
  assert.notEqual(observed?.stamp, expected)
  if (observed) assert.equal(observed.physicalPath, fs.realpathSync.native(renamed))
})

test("weak file identities and a direct symlink retain full native resolution", t => {
  const { first, root, stamp, api, unavailable } = fixture(t)
  const link = path.join(root, "Alias.ts")
  fs.symlinkSync(first, link)
  let calls = 0
  const native = fs.realpathSync.native, lstat = fs.lstatSync
  try {
    fs.realpathSync.native = function(...args) { calls++; return Reflect.apply(native, this, args) }
    fs.lstatSync = function(file, ...args) {
      const stat = Reflect.apply(lstat, this, [file, ...args])
      if (file !== first) return stat
      const weak = Object.create(stat)
      Object.defineProperty(weak, "ino", { value: 0 })
      return weak
    }
    assert.equal(api.withRequestInputValidation(() => api.observedSourceIdentity(first, stamp), unavailable).stamp, stamp)
    assert.ok(calls > 0, "unknown inode must use the original physical check")
    fs.lstatSync = lstat
    const original = api.diskIdentity(link)
    assert.deepEqual(api.withRequestInputValidation(() => api.observedSourceIdentity(link, original.stamp), unavailable), original)
  } finally { fs.realpathSync.native = native; fs.lstatSync = lstat }
})

test("an over-budget directory is not re-enumerated for every source leaf", t => {
  const { api, unavailable } = fixture(t)
  let captures = 0
  api.withRequestInputValidation(() => {
    for (let index = 0; index < 100; index++) assert.equal(api.requestValidationDirectory("directory-" + index, budget => {
      captures++
      return { physicalPath: "unused", names: new Set(), bytes: budget + 1, current: () => true }
    }), undefined)
  }, unavailable)
  assert.equal(captures, 1)
})

test("cancellation during namespace witness validation propagates without opening directories", t => {
  const { first, stamp, api, unavailable } = fixture(t)
  const open = fs.opendirSync
  let opened = 0, checkpoints = 0
  const cancellation = Error("cancelled at source directory")
  try {
    fs.opendirSync = function(...args) { opened++; return Reflect.apply(open, this, args) }
    assert.throws(() => api.withRequestInputValidation(() => api.observedSourceIdentity(first, stamp,
      () => { if (++checkpoints >= 3) throw cancellation }), unavailable), error => error === cancellation)
    assert.equal(opened, 0)
  } finally { fs.opendirSync = open }
})
