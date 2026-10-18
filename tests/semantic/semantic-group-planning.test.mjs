import assert from "node:assert/strict"
import { createRequire } from "node:module"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { buildSync } from "esbuild"

test("group root discovery is reused across queries and content revisions, then invalidated by membership or build identity", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-group-plan-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const outfile = path.join(directory, "groups.cjs")
  buildSync({ entryPoints: ["src/core/types/semantic-groups.ts"], outfile, bundle: true, platform: "node", format: "cjs" })
  const { SemanticGroups } = createRequire(import.meta.url)(outfile)
  const unit = { identity: { workspace: "/workspace", product: "default", module: "a", target: "default" },
    moduleRoot: "/workspace/a", sourceRoots: ["/workspace/a/src/main"], dependencies: [], reverseDependencies: [] }
  let graph = { status: "ready", complete: true, units: [unit] }
  const model = { semanticGraph: () => graph, scopeFor: () => ({ moduleRoot: unit.moduleRoot }) }
  const groups = new SemanticGroups({ projectFor: () => model })
  const membership = { status: "complete", revision: 1, paths: ["/workspace/a/src/main/A.ets", "/workspace/a/src/main/B.ets"] }
  const workspace = { rootPath: "/workspace", canonicalRootId: "/workspace", state: { path: membership.paths[0] },
    projectMembership: membership, documents: [] }
  const first = groups.select(workspace, membership)
  const query = groups.select({ ...workspace, state: { path: membership.paths[1] }, contentRevision: 2 },
    { ...membership, paths: [...membership.paths], revision: 2 })
  assert.equal(query.id, first.id)
  assert.equal(query.workspace.semanticRootPaths, first.workspace.semanticRootPaths,
    "editing text or moving the query must reuse the discovered root list")
  const removed = groups.select(workspace, { ...membership, paths: membership.paths.slice(0, 1), revision: 3 })
  assert.deepEqual(removed.workspace.semanticRootPaths, [membership.paths[0]])
  assert.notEqual(removed.workspace.semanticRootPaths, first.workspace.semanticRootPaths)
  graph = { ...graph, units: [{ ...unit, identity: { ...unit.identity, target: "preview" } }] }
  const configured = groups.select(workspace, membership)
  assert.notEqual(configured.id, first.id)
  assert.notEqual(configured.workspace.semanticRootPaths, first.workspace.semanticRootPaths)
  const moved = groups.select({ ...workspace, canonicalRootId: "/another-physical-root" }, membership)
  assert.notEqual(moved.id, configured.id)
})
