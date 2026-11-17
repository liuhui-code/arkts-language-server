import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { buildSync } from "esbuild"

function fixture(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watch-lifetime-")))
  const physical = path.join(root, "Physical")
  const alias = path.join(root, "Alias")
  const outside = path.join(root, "Outside")
  fs.mkdirSync(physical)
  fs.mkdirSync(outside)
  fs.symlinkSync(physical, alias, process.platform === "win32" ? "junction" : "dir")
  const output = path.join(root, "coordinator.cjs")
  buildSync({ entryPoints: [new URL("../src/lsp/workspace-file-change-coordinator.ts", import.meta.url).pathname],
    outfile: output, platform: "node", format: "cjs", bundle: true })
  return import("node:module").then(({ createRequire }) => {
    const { WorkspaceFileChangeCoordinator } = createRequire(import.meta.url)(output)
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    const rootUri = pathToFileURL(alias).href
    return { root, physical, alias, outside, rootUri, WorkspaceFileChangeCoordinator,
      coordinator: new WorkspaceFileChangeCoordinator({ rootUris: [rootUri] }) }
  })
}

test("a deleted source remains routed through an aliased root after several parent directories disappear", async t => {
  const f = await fixture(t)
  fs.mkdirSync(path.join(f.physical, "Nested", "Leaf"), { recursive: true })
  fs.writeFileSync(path.join(f.physical, "Nested", "Leaf", "Source.ets"), "class Source {}")
  const uri = pathToFileURL(path.join(f.alias, "Nested", "Leaf", "Source.ets")).href
  fs.rmSync(path.join(f.physical, "Nested"), { recursive: true })
  f.coordinator.accept([{ uri, type: 3 }])
  assert.deepEqual(f.coordinator.drain(), [{ rootUri: f.rootUri, rootDirty: false,
    changes: [{ uri, kind: "deleted" }] }])
})

test("a missing tail behind a real outside symlink remains outside the workspace", async t => {
  const f = await fixture(t)
  fs.symlinkSync(f.outside, path.join(f.physical, "Escape"), process.platform === "win32" ? "junction" : "dir")
  const uri = pathToFileURL(path.join(f.alias, "Escape", "Missing", "Source.ets")).href
  f.coordinator.accept([{ uri, type: 3 }])
  assert.deepEqual(f.coordinator.drain(), [])
})

test("a dangling symlink is unknown admission and dirties the root instead of fabricating a removed source", async t => {
  const f = await fixture(t)
  fs.symlinkSync(path.join(f.outside, "Missing"), path.join(f.physical, "Unknown"),
    process.platform === "win32" ? "junction" : "dir")
  f.coordinator.accept([{ uri: pathToFileURL(path.join(f.alias, "Unknown", "Source.ets")).href, type: 3 }])
  assert.deepEqual(f.coordinator.drain(), [{ rootUri: f.rootUri, rootDirty: true, changes: [] }])
})

test("a workspace never owns its exact parent directory even when that directory ends in .ets", async t => {
  const f = await fixture(t)
  const parent = path.join(f.root, "Container.ets")
  const child = path.join(parent, "Child")
  fs.mkdirSync(child, { recursive: true })
  const coordinator = new f.WorkspaceFileChangeCoordinator({ rootUris: [pathToFileURL(child).href] })
  coordinator.accept([{ uri: pathToFileURL(parent).href, type: 3 }])
  assert.deepEqual(coordinator.drain(), [])
})

test("opaque directory lifecycle invalidates namespace and resources without admitting a source URI", async t => {
  const f = await fixture(t)
  const directory = path.join(f.physical, "opaque.module")
  const source = path.join(f.physical, "ExactCase.ets")
  fs.mkdirSync(directory)
  fs.writeFileSync(source, "export class ExactCase {}\n")
  const directoryUri = pathToFileURL(directory).href
  const expected = [{ rootUri: f.rootUri, rootDirty: true, resourceDirty: true,
    resourceChanged: true, namespaceUncertain: true, changes: [] }]
  f.coordinator.accept([{ uri: directoryUri, type: 1 }])
  assert.deepEqual(f.coordinator.drain(), expected)
  fs.rmdirSync(directory)
  f.coordinator.accept([{ uri: directoryUri, type: 3 }])
  assert.deepEqual(f.coordinator.drain(), expected)
  const sourceUri = pathToFileURL(source).href
  f.coordinator.accept([{ uri: sourceUri, type: 2 }])
  assert.deepEqual(f.coordinator.drain(), [{ rootUri: f.rootUri, rootDirty: false,
    changes: [{ uri: sourceUri, kind: "changed" }] }])
})

test("opaque namespace hints keep physical boundaries and honor an explicit source namespace exclusion", async t => {
  const f = await fixture(t)
  fs.mkdirSync(path.join(f.outside, "Directory"))
  const file = path.join(f.physical, "notes.json")
  fs.writeFileSync(file, "{}")
  const excluded = new f.WorkspaceFileChangeCoordinator({ rootUris: [f.rootUri], isSourceNamespace: () => false })
  excluded.accept([{ uri: pathToFileURL(path.join(f.outside, "Directory")).href, type: 2 },
    { uri: pathToFileURL(file).href, type: 2 }])
  assert.deepEqual(excluded.drain(), [])
  f.coordinator.accept([{ uri: f.rootUri, type: 2 }])
  assert.equal(f.coordinator.drain()[0].namespaceUncertain, true,
    "a root namespace event is not an individual source admission")
})
