import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test, { after } from "node:test"
import { buildDocumentStoreDriver } from "./support/build-document-store-driver.mjs"

const driver = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-partial-delivery-driver-"))
after(() => fs.rmSync(driver, { recursive: true, force: true }))
const { SemanticDocumentStore } = buildDocumentStoreDriver(driver)

function prepare(t, maxPaths, main = "export const main = 1\n") {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-partial-delivery-"))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const files = { "Main.ets": main, "One.ets": "export const one = 1\n", "Two.ets": "export const two = 2\n" }
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(workspace, name), text)
  const paths = Object.keys(files).map(name => path.join(workspace, name))
  const store = new SemanticDocumentStore({ enumerateWorkspaceSources: () => paths,
    projectFileSetLimits: { maxPaths } })
  t.after(() => store.dispose())
  store.sync({ path: paths[0], content: main, workspaceRoot: workspace, documentVersion: 1 })
  const view = store.prepare({ path: paths[0], workspaceRoot: workspace, documentVersion: 1, line: 1, column: 1 }, true)
  return { view, paths }
}

test("membership path bounds remain distinct from partial source-body delivery", t => {
  const { view, paths } = prepare(t, 2)
  assert.equal(view.projectMembership.status, "partial")
  assert.equal(view.projectMembership.reason, "path-count-limit")
  assert.deepEqual(view.projectMembership.paths, paths.slice(0, 2).sort())
  assert.deepEqual(view.documents.map(document => document.path), [paths[0]],
    "do not preload unrelated bodies from an incomplete catalog")
})

test("complete membership still preloads its admitted source bodies", t => {
  const { view, paths } = prepare(t, 3)
  assert.equal(view.projectMembership.status, "complete")
  assert.deepEqual(view.projectMembership.paths, [...paths].sort())
  assert.deepEqual(view.documents.map(document => document.path).sort(), [...paths].sort())
})

test("partial membership never truncates an actual target dependency to the catalog prefix", t => {
  const { view, paths } = prepare(t, 2, "import { two } from './Two'\nexport const main = two\n")
  assert.equal(view.projectMembership.status, "partial")
  assert.deepEqual(view.projectMembership.paths, paths.slice(0, 2).sort())
  assert.deepEqual(view.documents.map(document => document.path).sort(), [paths[0], paths[2]].sort())
  assert.equal(view.documents.find(document => document.path === paths[2]).content, "export const two = 2\n")
})
