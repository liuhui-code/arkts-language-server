import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import test from "node:test"
import { buildSync } from "esbuild"
import { projectRoot } from "./support/lsp-process.mjs"

function driver(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-config-authority-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const outfile = path.join(directory, "driver.cjs")
  buildSync({ stdin: { contents: `export * from './src/lsp/workspace-file-change-coordinator.ts';
    export * from './src/semantic/worker-protocol.ts';
    export * from './src/semantic/semantic-worker-command-codec.ts';
    export * from './src/semantic/semantic-worker-mutation-coalescing.ts';`, resolveDir: projectRoot },
    bundle: true, platform: "node", target: "node20", format: "cjs", outfile })
  return { ...createRequire(import.meta.url)(outfile), directory, rootUri: pathToFileURL(directory).href }
}

for (const sequence of ["overflow", "configuration", "overflow-configuration", "configuration-overflow"]) {
  test(`configuration provenance survives ${sequence} without conflating source overflow`, t => {
    const { WorkspaceFileChangeCoordinator, directory, rootUri } = driver(t)
    const coordinator = new WorkspaceFileChangeCoordinator({ rootUris: [rootUri], maxPendingPaths: 1 })
    const source = name => ({ uri: pathToFileURL(path.join(directory, name)).href, type: 2 })
    for (const step of sequence.split("-")) coordinator.accept(step === "overflow"
      ? [source("A.ets"), source("B.ets")] : [source("local.properties")])
    const [batch] = coordinator.drain()
    assert.equal(batch.rootDirty, true)
    assert.equal(batch.configurationChanged === true, sequence.includes("configuration"))
    coordinator.accept([source("A.ets"), source("B.ets")])
    assert.equal(coordinator.drain()[0].configurationChanged === true, false, "authority expires at drain")
  })
}

for (const authority of [undefined, false, true]) {
  test(`configuration provenance survives canonical input and wire decoding: ${authority}`, t => {
    const { canonicalMutationInput, wireMutation, decodeSemanticWorkerMutation, rootUri } = driver(t)
    const input = { kind: "workspaceFilesChanged", rootUri, rootDirty: true, resourceDirty: false,
      resourceChanged: false, changes: [], ...(authority === undefined ? {} : { configurationChanged: authority }) }
    const canonical = canonicalMutationInput(1, input)
    assert.equal(canonical.configurationChanged === true, authority === true)
    const wire = wireMutation(1, 2, canonical)
    assert.equal(decodeSemanticWorkerMutation(structuredClone(wire)).configurationChanged === true, authority === true)
    assert.equal(Object.isFrozen(wire), true)
  })
}

test("configuration authority requires a boolean and root invalidation", t => {
  const { wireMutation, rootUri } = driver(t)
  const input = { kind: "workspaceFilesChanged", rootUri, rootDirty: true, resourceDirty: false,
    resourceChanged: false, changes: [], configurationChanged: "true" }
  assert.throws(() => wireMutation(1, 2, input))
  assert.throws(() => wireMutation(1, 2, { ...input, rootDirty: false, configurationChanged: true }))
})

test("configuration events preserve a workspace directory alias without following the configuration link", (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-config-alias-"))
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  const physicalRoot = path.join(base, "workspace")
  const aliasRoot = path.join(base, "workspace-alias")
  const shared = path.join(base, "shared.properties")
  fs.mkdirSync(physicalRoot)
  fs.symlinkSync(physicalRoot, aliasRoot, "dir")
  fs.writeFileSync(shared, "sdk.dir=/shared/sdk\n")
  fs.symlinkSync(shared, path.join(physicalRoot, "local.properties"), "file")
  const rootUri = pathToFileURL(aliasRoot).href
  const { WorkspaceFileChangeCoordinator } = driver(t)
  const coordinator = new WorkspaceFileChangeCoordinator({ rootUris: [rootUri] })
  coordinator.accept([{ uri: pathToFileURL(path.join(physicalRoot, "local.properties")).href, type: 2 }])
  assert.deepEqual(coordinator.drain(), [{ rootUri, rootDirty: true, configurationChanged: true, changes: [] }])
})

for (const order of ["config-first", "config-last", "source-only"]) {
  test(`coalesced worker invalidation retains only explicit authority: ${order}`, t => {
    const { mergeWorkspaceInvalidations, rootUri } = driver(t)
    const source = { kind: "workspaceFilesChanged", rootUri, rootDirty: true, resourceDirty: false,
      resourceChanged: false, changes: [] }
    const config = { ...source, configurationChanged: true }
    const merged = mergeWorkspaceInvalidations(1, order === "config-first" ? config : source,
      order === "config-last" ? config : source)
    assert.equal(merged.configurationChanged === true, order !== "source-only")
  })
}
