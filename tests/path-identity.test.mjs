import assert from "node:assert/strict"
import { createRequire } from "node:module"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { buildSync } from "esbuild"
import { pathToFileURL } from "node:url"
import { buildPathIdentityDriver } from "./support/path-identity-driver.mjs"

test("physical workspace containment excludes its exact parent and siblings", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-path-identity-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const outfile = path.join(directory, "identity.cjs")
  buildSync({ entryPoints: ["src/core/workspace/physical-path-identity.ts"],
    bundle: true, platform: "node", format: "cjs", outfile })
  const { isInside } = createRequire(import.meta.url)(outfile)
  const root = path.join(directory, "workspace")
  assert.equal(isInside(root, directory), false)
  assert.equal(isInside(root, path.join(directory, "workspace2", "Main.ts")), false)
  assert.equal(isInside(root, root), false)
  assert.equal(isInside(root, path.join(root, "Main.ts")), true)
})

test("native index accepts Windows drive spelling without folding file names", async t => {
  const identity = await buildPathIdentityDriver(t, true)
  assert.equal(identity.isEquivalentWorkspaceIdentity("file:///d:/Photos/MixedCase", "D:\\Photos\\MixedCase"), true)
  assert.equal(identity.isEquivalentWorkspaceIdentity("file:///d:/Photos/MixedCase2", "D:\\Photos\\MixedCase"), false)
  assert.equal(identity.isEquivalentWorkspaceIdentity("file:///e:/Photos/MixedCase", "D:\\Photos\\MixedCase"), false)
  assert.equal(identity.isEquivalentWorkspaceIdentity("file:///d:/Photos/mixedcase", "D:\\Photos\\MixedCase"), false)
})

test("Worker accepts same-volume spelling and rejects parent, sibling and other drives", async t => {
  const api = await buildPathIdentityDriver(t, true)
  const root = "file:///D:/Photos"
  for (const check of [api.workerUriWithinRoot, api.isSemanticWorkerUriWithinRoot]) {
    assert.equal(check("file:///d:/Photos/MixedCase.ts", root), true)
    assert.equal(check("file:///d:/Photos", root), true)
    assert.equal(check("file:///d:/", root), false)
    assert.equal(check("file:///d:/Photos2/MixedCase.ts", root), false)
    assert.equal(check("file:///e:/Photos/MixedCase.ts", root), false)
    assert.equal(check("file:///d:/photos/MixedCase.ts", root), false)
  }
  const identity = { clientRootUri: root, workspaceIdentity: "file:///d:/Photos" }
  assert.equal(api.toWorkspaceIdentityUri(identity, "file:///D:/Photos/MixedCase.ts"),
    "file:///d:/Photos/MixedCase.ts")
  assert.equal(api.tryClientWorkspaceUri(identity, "file:///d:/Photos2/MixedCase.ts"), undefined)
})

test("filesystem evidence distinguishes case aliases from distinct directories", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-case-alias-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const root = path.join(directory, "MixedCase")
  fs.mkdirSync(root)
  const alias = path.join(directory, "mixedcase")
  fs.writeFileSync(path.join(root, "KeptCase.ts"), "export const value = 1\n")
  const api = await buildPathIdentityDriver(t)
  const rootUri = pathToFileURL(root).href
  const aliasUri = pathToFileURL(alias).href
  const fileUri = pathToFileURL(path.join(alias, "KeptCase.ts")).href
  if (!fs.existsSync(alias)) {
    fs.mkdirSync(alias)
    fs.writeFileSync(path.join(alias, "KeptCase.ts"), "export const value = 2\n")
    assert.equal(api.isEquivalentWorkspaceIdentity(aliasUri, root), false)
    assert.equal(api.workerUriWithinRoot(fileUri, rootUri), false)
    assert.equal(api.isSemanticWorkerUriWithinRoot(fileUri, rootUri), false)
    return
  }
  assert.equal(api.isEquivalentWorkspaceIdentity(aliasUri, root), true)
  assert.equal(api.workerUriWithinRoot(fileUri, rootUri), true)
  assert.equal(api.isSemanticWorkerUriWithinRoot(fileUri, rootUri), true)
  assert.equal(api.toWorkspaceIdentityUri({ clientRootUri: rootUri, workspaceIdentity: rootUri }, fileUri),
    pathToFileURL(path.join(root, "KeptCase.ts")).href)
})

test("Node accepts shared native URI vectors without changing filename case", async t => {
  const windows = await buildPathIdentityDriver(t, true)
  const native = await buildPathIdentityDriver(t)
  const vectors = fs.readFileSync(new URL("./fixtures/path-identity-vectors.tsv", import.meta.url), "utf8")
  for (const row of vectors.trim().split("\n")) {
    const [platform, filePath, uri] = row.split("\t")
    if (platform === "unix" && process.platform === "win32") continue
    const api = platform === "windows" ? windows : native
    assert.equal(api.isEquivalentWorkspaceIdentity(uri, filePath), true, row)
    const roundtrip = api.tryClientWorkspaceUri({ clientRootUri: uri, workspaceIdentity: uri }, uri)
    assert.equal(roundtrip, uri)
  }
})

test("resolved Windows scopes do not merge differently cased directories without evidence", async t => {
  const api = await buildPathIdentityDriver(t, true)
  assert.equal(api.containsResolvedPath("D:\\Root\\Case", "d:\\Root\\Case\\Member.ts"), true)
  assert.equal(api.containsResolvedPath("D:\\Root\\Case", "d:\\Root\\case\\Member.ts"), false)
})
