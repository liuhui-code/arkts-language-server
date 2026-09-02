import assert from "node:assert/strict"
import { createRequire } from "node:module"
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
