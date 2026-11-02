import assert from "node:assert/strict"
import { after } from "node:test"
import test from "node:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { buildSync } from "esbuild"

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-index-directory-"))
after(() => fs.rmSync(temporary, { recursive: true, force: true }))
buildSync({ entryPoints: { cache: "src/index/cache-directory.ts", sidecar: "src/index/sidecar-path.ts",
  storage: "src/composition/index-storage.ts", symbols: "src/workspace/default-workspace-symbol-service.ts" },
  bundle: true, platform: "node", format: "cjs", target: "node20", outdir: temporary,
  outExtension: { ".js": ".cjs" } })
const require = createRequire(import.meta.url)
const cache = require(path.join(temporary, "cache.cjs"))
const sidecar = require(path.join(temporary, "sidecar.cjs"))
const { createIndexStorage } = require(path.join(temporary, "storage.cjs"))
const { DefaultWorkspaceSymbolService } = require(path.join(temporary, "symbols.cjs"))

test("Windows prefers an absolute D-drive index root independently of the profile drive", () => {
  assert.equal(cache.resolveIndexCacheDirectory({ platform: "win32", homeDirectory: "C:\\Users\\fixture",
    env: { LOCALAPPDATA: "C:\\LocalAppData" } }), "D:\\arkts-language-server\\index")
})

test("macOS, Linux, XDG and explicit cache paths retain their existing resolution", () => {
  assert.equal(cache.resolveIndexCacheDirectory({ platform: "darwin", homeDirectory: "/Users/fixture", env: {} }),
    "/Users/fixture/Library/Caches/arkts-language-server/index")
  assert.equal(cache.resolveIndexCacheDirectory({ platform: "linux", homeDirectory: "/home/fixture",
    env: { XDG_CACHE_HOME: "/xdg/cache" } }), "/xdg/cache/arkts-language-server/index")
  assert.equal(cache.resolveIndexCacheDirectory({ platform: "linux", homeDirectory: "/home/fixture", env: {} }),
    "/home/fixture/.cache/arkts-language-server/index")
  assert.equal(cache.resolveIndexCacheDirectory({ platform: "linux", env: { ARKTS_INDEX_CACHE_DIR: "/override/index-cache" } }),
    "/override/index-cache")
  assert.equal(cache.resolveIndexCacheDirectory({ platform: "win32", env: { ARKTS_INDEX_CACHE_DIR: "E:\\Index Cache\\用户" } }),
    "E:\\Index Cache\\用户")
})

test("explicit and portable sidecar paths keep the pre-existing public resolver contract", () => {
  const executable = process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar"
  assert.equal(sidecar.resolveIndexSidecarPath({ sidecarPath: "/explicit/arkts-sidecar", projectRoot: "/ignored", env: {} }),
    path.resolve("/explicit/arkts-sidecar"))
  assert.equal(sidecar.resolveIndexSidecarPath({ projectRoot: "/portable/arkts-language-server", env: {} }),
    path.join("/portable/arkts-language-server", "target", "release", executable))
  assert.equal(sidecar.resolveIndexSidecarPath({ projectRoot: "/ignored", env: { ARKTS_INDEX_SIDECAR_PATH: "/environment/arkts-sidecar" } }),
    path.resolve("/environment/arkts-sidecar"))
})

test("a missing Windows D drive falls back to the original profile cache with an actionable warning", async () => {
  const attempts = []
  const result = await cache.prepareIndexCacheDirectory({ platform: "win32", homeDirectory: "C:\\Users\\fixture",
    env: { LOCALAPPDATA: "C:\\LocalAppData" } }, async directory => {
    attempts.push(directory)
    if (directory.startsWith("D:")) throw Object.assign(new Error("drive not found"), { code: "ENOENT" })
  })
  assert.deepEqual(attempts, ["D:\\arkts-language-server\\index", "C:\\LocalAppData\\arkts-language-server\\index"])
  assert.equal(result.directory, attempts[1])
  assert.equal(result.source, "windows-fallback")
  assert.match(result.warning, /D:.*ENOENT.*C:.*ARKTS_INDEX_CACHE_DIR/)
})

test("a writable Windows D drive is used directly without probing the profile cache", async () => {
  const attempts = []
  const selected = await cache.prepareIndexCacheDirectory({ platform: "win32", env: {} },
    async directory => { attempts.push(directory) })
  assert.deepEqual(attempts, ["D:\\arkts-language-server\\index"])
  assert.equal(selected.directory, attempts[0])
  assert.equal(selected.source, "windows-default")
  assert.equal(selected.warning, undefined)
})

test("Windows permission failures fall back, including profiles without LOCALAPPDATA", async () => {
  for (const code of ["EACCES", "EPERM", "EROFS", "ENOSPC"]) {
    const attempts = []
    const selected = await cache.prepareIndexCacheDirectory({ platform: "win32", env: { LOCALAPPDATA: "" },
      homeDirectory: "C:\\Users\\Case用户" }, async directory => {
      attempts.push(directory)
      if (directory.startsWith("D:")) throw Object.assign(new Error("not writable"), { code })
    })
    assert.equal(selected.directory, "C:\\Users\\Case用户\\AppData\\Local\\arkts-language-server\\index")
    assert.equal(attempts.length, 2)
    assert.ok(selected.warning.includes(code))
  }
})

test("an explicitly configured directory failure never redirects writes to another drive", async () => {
  const attempts = []
  await assert.rejects(cache.prepareIndexCacheDirectory({ platform: "win32",
    env: { ARKTS_INDEX_CACHE_DIR: "E:\\MyCache\\用户", LOCALAPPDATA: "C:\\Local" } }, async directory => {
    attempts.push(directory)
    throw Object.assign(new Error("permission denied"), { code: "EACCES" })
  }), /configured.*E:.*EACCES.*Workspace indexing is unavailable.*ARKTS_INDEX_CACHE_DIR/)
  assert.deepEqual(attempts, ["E:\\MyCache\\用户"])
})

test("both default and fallback failures identify both paths and do not choose an implicit temp cache", async () => {
  const attempts = []
  await assert.rejects(cache.prepareIndexCacheDirectory({ platform: "win32", env: { LOCALAPPDATA: "C:\\Local" } },
    async directory => { attempts.push(directory); throw Object.assign(new Error("unavailable"), { code: "EACCES" }) }),
  /D:.*EACCES.*Profile fallback also unavailable: C:.*EACCES/)
  assert.equal(attempts.length, 2)
})

test("the real filesystem probe preserves all existing cache files and removes only its private probe", async () => {
  const directory = path.join(temporary, "Configured Cache 用户")
  fs.mkdirSync(directory)
  fs.writeFileSync(path.join(directory, "existing-index.sqlite3"), "unchanged database")
  fs.writeFileSync(path.join(directory, "existing-index.sqlite3-wal"), "uncheckpointed WAL")
  const before = fs.readdirSync(directory).sort().map(name => [name, fs.readFileSync(path.join(directory, name), "utf8")])
  const result = await cache.prepareIndexCacheDirectory({ env: { ARKTS_INDEX_CACHE_DIR: directory } })
  assert.equal(result.directory, directory)
  assert.equal(result.source, "environment")
  assert.equal(result.warning, undefined)
  assert.deepEqual(fs.readdirSync(directory).sort().map(name => [name, fs.readFileSync(path.join(directory, name), "utf8")]), before)
})

test("a configured file is rejected by the real filesystem while ordinary non-Windows defaults stay lazy", async () => {
  const file = path.join(temporary, "not-a-directory")
  fs.writeFileSync(file, "preserve me")
  await assert.rejects(cache.prepareIndexCacheDirectory({ env: { ARKTS_INDEX_CACHE_DIR: file } }), /configured.*EEXIST/)
  assert.equal(fs.readFileSync(file, "utf8"), "preserve me")
  for (const platform of ["darwin", "linux"]) {
    const result = await cache.prepareIndexCacheDirectory({ platform, env: {}, homeDirectory: "/unused-profile" },
      async () => { assert.fail("must not introduce probes on ordinary non-Windows defaults") })
    assert.equal(result.source, "platform-default")
  }
})

test("a disposed cache owner does not create new directories or issue warnings", async () => {
  const directory = path.join(temporary, "late-start-must-not-exist")
  const warnings = []
  const owner = createIndexStorage({ ARKTS_INDEX_CACHE_DIR: directory }, { info() {}, error() {} })
  await owner.dispose()
  await assert.rejects(owner.directory(message => warnings.push(message)), /disposed/)
  assert.equal(fs.existsSync(directory), false)
  assert.deepEqual(warnings, [])
})

test("concurrent roots share one directory failure notice instead of retrying per workspace", async () => {
  const file = path.join(temporary, "bad-shared-cache")
  fs.writeFileSync(file, "keep")
  const warnings = [], errors = []
  const owner = createIndexStorage({ ARKTS_INDEX_CACHE_DIR: file }, { info() {}, error(event) { errors.push(event) } })
  const results = await Promise.allSettled([owner.directory(message => warnings.push(message)), owner.directory(message => warnings.push(message))])
  assert.ok(results.every(result => result.status === "rejected"))
  assert.equal(warnings.length, 1)
  assert.deepEqual(errors, ["index.cache.directory.unavailable"])
  assert.equal(fs.readFileSync(file, "utf8"), "keep")
  await owner.dispose()
})

test("closing a workspace during async storage preparation never opens the sidecar afterwards", async () => {
  let release
  const pending = new Promise(resolve => { release = resolve })
  let opens = 0, catalogs = 0
  const service = new DefaultWorkspaceSymbolService({ index: { async open() { opens++ }, async close() {} },
    catalog: { async start() { catalogs++ } }, semantic: {}, cacheDirectory: () => pending })
  service.start([{ id: "closing-root", rootUri: "file:///closing-root" }], () => {})
  const closing = service.dispose()
  release(temporary)
  await closing
  assert.equal(opens, 0)
  assert.equal(catalogs, 0)
})

test("startup storage configuration is a snapshot, not a live mutable environment", async () => {
  const first = path.join(temporary, "startup-choice")
  const changed = path.join(temporary, "later-environment")
  const environment = { ARKTS_INDEX_CACHE_DIR: first, ARKTS_INDEX_CACHE_GC: "off" }
  const owner = createIndexStorage(environment, { info() {}, error() {} })
  environment.ARKTS_INDEX_CACHE_DIR = changed
  assert.equal(await owner.directory(() => assert.fail("writable directory must not warn")), first)
  assert.equal(fs.existsSync(changed), false)
  await owner.dispose()
})

test("Windows environment-name casing survives snapshots without folding configured path casing", async () => {
  const environment = { arkts_index_cache_dir: "E:\\CaseSensitive用户", localappdata: "C:\\Local",
    arkts_index_cache_gc: "off", Path: "preserve-other-environment" }
  assert.equal(cache.resolveIndexCacheDirectory({ platform: "win32", env: environment }), "E:\\CaseSensitive用户")
  const attempts = []
  const selected = await cache.prepareIndexCacheDirectory({ platform: "win32", env: environment },
    async directory => { attempts.push(directory) })
  assert.equal(selected.source, "environment")
  assert.deepEqual(attempts, ["E:\\CaseSensitive用户"])
  const snapshot = cache.snapshotIndexEnvironment(environment, "win32")
  assert.equal(snapshot.ARKTS_INDEX_CACHE_GC, "off")
  assert.equal(snapshot.LOCALAPPDATA, "C:\\Local")
  assert.equal(snapshot.Path, environment.Path)
  assert.equal(snapshot.PATH, undefined)
  const fallback = await cache.prepareIndexCacheDirectory({ platform: "win32", env: { localappdata: "C:\\CaseFallback" } },
    async directory => { if (directory.startsWith("D:")) throw Object.assign(new Error("missing drive"), { code: "ENOENT" }) })
  assert.equal(fallback.directory, "C:\\CaseFallback\\arkts-language-server\\index")
  assert.equal(cache.resolveIndexCacheDirectory({ platform: "linux", homeDirectory: "/home/fixture", env: environment }),
    "/home/fixture/.cache/arkts-language-server/index")
})
