import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { buildSync } from "esbuild"

test("late peer admission cannot resend a physically retired peer role", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-managed-scope-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const output = path.join(directory, "scope.mjs")
  buildSync({ entryPoints: [new URL("../src/index/workspace-cache-namespaces.ts", import.meta.url).pathname],
    outfile: output, bundle: true, platform: "node", format: "esm" })
  const { WorkspaceCacheNamespaces } = await import(pathToFileURL(output).href)
  const a = path.join(directory, "a"), b = path.join(directory, "b"), c = path.join(directory, "c")
  for (const root of [a, b, c]) fs.mkdirSync(root)
  const roots = [a, b, c].map(root => fs.realpathSync.native(root))
  const calls = [], policies = [], reschedules = []
  const scope = new WorkspaceCacheNamespaces(async (root, rows) => policies.push({ root, rows }), root => reschedules.push(root))
  function owner(root, id) {
    const leaf = path.join(roots[0], "Cache/workspaces", id)
    fs.mkdirSync(leaf, { recursive: true })
    const stat = fs.lstatSync(leaf, { bigint: true })
    const uri = pathToFileURL(root).href
    // Boundary fixture: actual directory identity; the Native attestation path is independently LSP-tested.
    const namespace = { source: { directory: leaf, dev: String(stat.dev), ino: String(stat.ino),
      birthtimeNs: String(stat.birthtimeNs) }, native: { directory: leaf, workspaceIdentity: uri, objectId: id } }
    const session = { workspaceIdentity: uri, versioned: { capability: { sourceNamespaces: true },
      sourceNamespacesChanged(rows) { calls.push({ root: uri, rows }) } } }
    return { namespace, session, uri }
  }
  const first = owner(roots[0], "owner-a"), peer = owner(roots[1], "owner-b")
  await scope.add("a", first.uri, roots[0], first.session, first.namespace)
  await scope.add("b", peer.uri, roots[1], peer.session, peer.namespace)
  assert.deepEqual(calls.at(-1).rows, [peer.namespace.native])
  assert.deepEqual(reschedules, [], "the first catalog consumes staged policies; no duplicate bootstrap is needed")
  assert.equal(scope.needsOpeningBarrier("a"), true, "initial source-overlapping cache needs the complete owner set")
  assert.equal(scope.needsOpeningBarrier("b"), false, "external caches must not wait for unrelated roots")
  scope.catalogStarting("a")
  assert.equal(scope.needsOpeningBarrier("a"), false, "later reconciliations use input barriers, not a global opening wait")
  fs.renameSync(peer.namespace.source.directory, path.join(directory, "retired-b"))
  fs.mkdirSync(peer.namespace.source.directory)
  const latest = owner(roots[2], "owner-c")
  await scope.add("c", latest.uri, roots[2], latest.session, latest.namespace)
  assert.deepEqual(calls.filter(call => call.root === first.uri).at(-1).rows, [latest.namespace.native],
    "a stale B proof must not poison the newly delivered C policy")
  assert.deepEqual(policies.filter(call => call.root === first.uri).at(-1).rows,
    [first.namespace.source, latest.namespace.source])
  assert.deepEqual(reschedules, [first.uri], "a later source-policy change must schedule the already started root")
})
