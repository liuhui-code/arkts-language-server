import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test, { after } from "node:test"

import { buildDocumentStoreDriver } from "./support/build-document-store-driver.mjs"

const driverRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-path-consistency-driver-"))
after(() => fs.rmSync(driverRoot, { recursive: true, force: true }))
const { SemanticDocumentStore } = buildDocumentStoreDriver(driverRoot)

test("relative dependency resolution stays inside the physical workspace", (t) => {
  const workspace = createWorkspace(t, "relative-dependency", {
    "Main.ets": [
      "import { SECRET_OUTSIDE } from './Leak'",
      "export const value = SECRET_OUTSIDE",
      "",
    ].join("\n"),
  })
  const outside = createWorkspace(t, "relative-dependency-outside", {
    "Outside.ets": "export const SECRET_OUTSIDE = 42\n",
  })
  const mainPath = path.join(workspace, "Main.ets")
  const leakPath = path.join(workspace, "Leak.ets")
  fs.symlinkSync(path.join(outside, "Outside.ets"), leakPath, "file")
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())

  const prepared = store.prepare(syncPosition(store, workspace, mainPath), true)

  assert.deepEqual({
    loadedOutsideContent: prepared.documents.some((document) => (
      document.content.includes("SECRET_OUTSIDE = 42")
    )),
    documentsContainLeak: documentPaths(prepared).includes(leakPath),
  }, {
    loadedOutsideContent: false,
    documentsContainLeak: false,
  })
})

test("a watched source becomes unavailable when its physical identity changes before consumption", (t) => {
  const workspace = createStageWorkspace(t, "watcher-identity-change")
  const outside = createWorkspace(t, "watcher-identity-change-outside", {
    "Outside.ets": "export const SECRET_OUTSIDE = 42\n",
  })
  const mainPath = path.join(workspace, "entry", "src", "main", "ets", "Main.ets")
  const tabletRoot = path.join(workspace, "entry", "src", "tablet")
  const leakPath = path.join(tabletRoot, "Leak.ets")
  const insideTarget = path.join(tabletRoot, "Inside.ets")
  const outsideTarget = path.join(outside, "Outside.ets")
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  const position = syncPosition(store, workspace, mainPath)

  const warm = store.prepare(position, true)
  assert.equal(warm.projectMembership.status, "complete")
  assert.equal(warm.projectMembership.paths.includes(leakPath), false)

  fs.mkdirSync(tabletRoot, { recursive: true })
  fs.writeFileSync(insideTarget, "export const safe = 1\n", "utf8")
  fs.symlinkSync(insideTarget, leakPath, "file")
  store.workspaceFilesChanged({
    rootPath: workspace,
    rootDirty: false,
    changes: [{ path: leakPath, kind: "created" }],
  })

  fs.unlinkSync(leakPath)
  fs.symlinkSync(outsideTarget, leakPath, "file")
  const prepared = store.prepare(position, true)

  assert.deepEqual({
    loadedOutsideContent: prepared.documents.some((document) => (
      document.content.includes("SECRET_OUTSIDE")
    )),
    documentsContainLeak: documentPaths(prepared).includes(leakPath),
    membershipComplete: prepared.projectMembership.status === "complete",
    membershipContainsLeak: prepared.projectMembership.paths.includes(leakPath),
  }, {
    loadedOutsideContent: false,
    documentsContainLeak: false,
    membershipComplete: true,
    membershipContainsLeak: false,
  })
})

test("an active lexical source cannot add an inactive physical target to membership", (t) => {
  const workspace = createStageWorkspace(t, "inactive-physical-target", {
    includeDesktop: true,
  })
  const mainPath = path.join(workspace, "entry", "src", "main", "ets", "Main.ets")
  const tabletRoot = path.join(workspace, "entry", "src", "tablet")
  const desktopRoot = path.join(workspace, "entry", "src", "desktop")
  const inactiveTarget = path.join(desktopRoot, "Secret.ets")
  const leakPath = path.join(tabletRoot, "Leak.ets")
  fs.mkdirSync(desktopRoot, { recursive: true })
  fs.writeFileSync(inactiveTarget, "export const INACTIVE_SECRET = 42\n", "utf8")
  const store = new SemanticDocumentStore()
  t.after(() => store.dispose?.())
  const position = syncPosition(store, workspace, mainPath)

  const warm = store.prepare(position, true)
  assert.equal(warm.projectMembership.status, "complete")
  assert.equal(warm.projectMembership.paths.includes(inactiveTarget), false)

  fs.mkdirSync(tabletRoot, { recursive: true })
  fs.symlinkSync(inactiveTarget, leakPath, "file")
  store.workspaceFilesChanged({
    rootPath: workspace,
    rootDirty: false,
    changes: [{ path: leakPath, kind: "created" }],
  })
  const prepared = store.prepare(position, true)

  assert.deepEqual({
    loadedInactiveContent: prepared.documents.some((document) => (
      document.content.includes("INACTIVE_SECRET")
    )),
    documentsContainLeak: documentPaths(prepared).includes(leakPath),
    membershipContainsLeak: prepared.projectMembership.paths.includes(leakPath),
  }, {
    loadedInactiveContent: false,
    documentsContainLeak: false,
    membershipContainsLeak: false,
  })
})

function createStageWorkspace(t, name, { includeDesktop = false } = {}) {
  const files = {
    "build-profile.json5": JSON.stringify({
      app: { products: [{ name: "default" }] },
      modules: [{
        name: "entry",
        srcPath: "./entry",
        targets: [{ name: "tablet", applyToProducts: ["default"] }],
      }],
    }),
    "entry/build-profile.json5": JSON.stringify({
      targets: [
        { name: "tablet", source: { sourceRoots: ["./src/tablet"] } },
        ...(includeDesktop
          ? [{ name: "desktop", source: { sourceRoots: ["./src/desktop"] } }]
          : []),
      ],
    }),
    "entry/src/main/ets/Main.ets": "export const main = 1\n",
  }
  return createWorkspace(t, name, files)
}

function createWorkspace(t, name, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `arkts-path-consistency-${name}-`))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, "utf8")
  }
  return root
}

function syncPosition(store, workspaceRoot, documentPath, version = 1) {
  const content = fs.readFileSync(documentPath, "utf8")
  store.sync({
    path: documentPath,
    content,
    documentVersion: version,
    workspaceRoot,
  })
  return {
    path: documentPath,
    line: 1,
    column: 1,
    documentVersion: version,
    workspaceRoot,
  }
}

function documentPaths(view) {
  return view.documents.map((document) => document.path).sort()
}
