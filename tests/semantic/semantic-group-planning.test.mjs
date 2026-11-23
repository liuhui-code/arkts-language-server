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

test("group classification preserves the original containment rule for overlaps, cycles, declarations and spelling", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-group-containment-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const outfile = path.join(directory, "groups.cjs")
  buildSync({ stdin: { contents: [
    `export * from ${JSON.stringify(path.resolve("src/core/types/semantic-groups.ts"))}`,
    `export * from ${JSON.stringify(path.resolve("src/project/resolved-path-containment.ts"))}`,
  ].join("\n"), resolveDir: process.cwd() }, outfile, bundle: true, platform: "node", format: "cjs" })
  const { SemanticGroups, containsResolvedPath } = createRequire(import.meta.url)(outfile)
  const root = path.resolve("containment-workspace"), app = path.join(root, "App")
  const make = (name, sourceRoots, dependencies = []) => ({ identity: { module: name },
    moduleRoot: path.join(root, name), sourceRoots, dependencies: dependencies.map(module => ({ module })) })
  const units = [make("App", [app + path.sep, path.join(app, "sub", "..")], ["Nested"]),
    make("Nested", [path.join(app, "nested")], ["App"]), make("Other", [path.join(root, "Other")])]
  const graph = { status: "ready", complete: true, units }
  const membership = { status: "complete", revision: 1, paths: [path.join(app, "A.ets"),
    path.join(root, "AppSibling", "Wrong.ets"), path.join(app, "nested", "B.ets"),
    path.join(root, "app", "DifferentCase.ets"), path.join(root, "Other", "C.ts"),
    path.join(root, "outside", "Global.d.ts"), path.join(root, "outside", "Global.d.ets"),
    path.join(root, "outside", "NotGlobal.D.ts")] }
  const model = { semanticGraph: () => graph }, groups = new SemanticGroups({ projectFor: () => model })
  const actual = groups.all({ rootPath: root, canonicalRootId: root, projectMembership: membership, documents: [] })
  for (let index = 0; index < units.length; index++) {
    const closure = new Set(), queue = [units[index]]
    for (const unit of queue) if (!closure.has(unit)) {
      closure.add(unit)
      for (const dependency of unit.dependencies) queue.push(units.find(candidate => candidate.identity.module === dependency.module))
    }
    const roots = [...closure].flatMap(unit => unit.sourceRoots)
    const expected = membership.paths.filter(file => roots.some(source => containsResolvedPath(source, file))
      || /\.d\.(?:ets|ts)$/.test(file))
    assert.deepEqual(actual[index].workspace.semanticRootPaths, expected)
  }
})
