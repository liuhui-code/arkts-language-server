import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { runSingleReferenceRequest, positionAt, pathFingerprint } from "../support/reference-batching-lsp.mjs"

test("indexed batching keeps declared project semantic units intact", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "arkts-references-units-"))
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const entryRoot = path.join(workspace, "entry")
  const sharedRoot = path.join(workspace, "shared")
  const unrelatedRoot = path.join(workspace, "unrelated")
  const entrySource = path.join(entryRoot, "src", "main", "ets")
  const sharedSource = path.join(sharedRoot, "src", "main", "ets")
  const unrelatedSource = path.join(unrelatedRoot, "src", "main", "ets")
  await Promise.all([entrySource, sharedSource, unrelatedSource].map(directory => (
    fs.promises.mkdir(directory, { recursive: true })
  )))
  await fs.promises.writeFile(path.join(workspace, "build-profile.json5"), JSON.stringify({
    app: { products: [{ name: "default" }] },
    modules: [
      { name: "entry", srcPath: "./entry", targets: [{ name: "default", applyToProducts: ["default"] }] },
      { name: "shared", srcPath: "./shared", targets: [{ name: "default", applyToProducts: ["default"] }] },
      { name: "unrelated", srcPath: "./unrelated", targets: [{ name: "default", applyToProducts: ["default"] }] },
    ],
  }))
  await Promise.all([entryRoot, sharedRoot, unrelatedRoot].map(moduleRoot => (
    fs.promises.writeFile(path.join(moduleRoot, "build-profile.json5"),
      "{ targets: [{ name: 'default' }] }")
  )))
  await fs.promises.writeFile(path.join(entryRoot, "oh-package.json5"),
    "{ name: 'entry', dependencies: { shared: 'file:../shared' } }")
  await fs.promises.writeFile(path.join(sharedRoot, "oh-package.json5"),
    "{ name: 'shared', dependencies: {} }")
  await fs.promises.writeFile(path.join(unrelatedRoot, "oh-package.json5"),
    "{ name: 'unrelated', dependencies: {} }")
  const queryText = [
    'import { PublicThing } from "../../../../shared/src/main/ets/Barrel"',
    "export const query = new PublicThing()",
    "",
  ].join("\n")
  await Promise.all([
    fs.promises.writeFile(path.join(sharedSource, "Target.ets"), "export class Thing {}\n"),
    fs.promises.writeFile(path.join(sharedSource, "Barrel.ets"),
      'export { Thing as PublicThing } from "./Target"\n'),
    fs.promises.writeFile(path.join(entrySource, "Query.ets"), queryText),
    fs.promises.writeFile(path.join(entrySource, "Use.ets"), [
      'import { PublicThing } from "../../../../shared/src/main/ets/Barrel"',
      "export const use = new PublicThing()",
      "",
    ].join("\n")),
    ...Array.from({ length: 6 }, (_, index) => (
      fs.promises.writeFile(path.join(unrelatedSource, `Other${index}.ets`),
        `export class Other${index} {}\n`)
    )),
  ])
  const queryUri = pathToFileURL(path.join(entrySource, "Query.ets")).href
  const position = positionAt(queryText, queryText.lastIndexOf("PublicThing") + 1)
  const originalBuildProfile = fs.readFileSync(path.join(workspace, "build-profile.json5"), "utf8")
  const conservative = await runSingleReferenceRequest(t, {
    root, workspace, queryUri, queryText, position,
    strategy: "batched",
    batchRoots: "1",
  })
  let firstQualification
  const result = await runSingleReferenceRequest(t, {
    root, workspace, queryUri, queryText, position,
    strategy: "indexed-batched",
    awaitIndexReady: true,
    indexScenario: "semantic-units",
    batchRoots: "1",
    afterFirstRequest: async (session) => {
      firstQualification = readRows(path.join(root, "logs-indexed-batched", "server.log"))
        .findLast(row => row.event === "index.maintenance.phase" && row.outcome === "qualified"
          && row.currentInput && row.scope !== "file")
      assert.ok(firstQualification, "the initial candidate set requires actual Native qualification")
      await fs.promises.writeFile(path.join(workspace, "build-profile.json5"), JSON.stringify({
        app: { products: [{ name: "default" }] },
        modules: [
          { name: "entry", srcPath: "./entry", targets: [{ name: "default", applyToProducts: ["default"] }] },
          { name: "shared", srcPath: "./shared", targets: [{ name: "default", applyToProducts: ["default"] }] },
        ],
      }))
      session.transport.send({
        jsonrpc: "2.0",
        method: "workspace/didChangeWatchedFiles",
        params: { changes: [{
          uri: pathToFileURL(path.join(workspace, "build-profile.json5")).href,
          type: 2,
        }] },
      })
      // Repeat immediately: watched-file invalidation must precede the next read without a test barrier.
    },
    afterRepeatedRequest: async (session, initialLocations) => {
      // Config-only reconcile can qualify the same data head. It does not prove
      // that Native's retained 10-file scope equals the active 4-file project.
      const qualification = await waitQualification(root, firstQualification.inputRevision)
      const events = readRows(path.join(root, "logs-indexed-batched", "server.log"))
      assert.equal(events.filter(event => event.event === "references.index.accepted").length, 1,
        "the old active-module qualification cannot authorize the changed project scope")
      const recovered = await session.request("textDocument/references", {
        // Same symbol, distinct cursor: exercise index re-admission rather than the valid fallback result cache.
        textDocument: { uri: queryUri }, position: { ...position, character: position.character + 1 },
        context: { includeDeclaration: true },
      }, { timeoutMs: 30_000 })
      assert.equal(recovered.error, undefined, JSON.stringify(recovered.error))
      const sorted = locations => locations.map(location => JSON.stringify(location)).sort()
      assert.deepEqual(sorted(recovered.result), sorted(initialLocations))
      const after = readRows(path.join(root, "logs-indexed-batched", "server.log"))
      assert.equal(after.filter(row => row.event === "references.index.accepted").length, 1)
      if (!after.some(row => row.event === "references.index.fallback"
        && row.reason === "semantic-input-scope-mismatch")) {
        assert.ok(after.some(row => row.event === "references.index.fallback" && row.reason === "workspace-changed"))
        // Store observes the changed active namespace on the first request; its
        // independent reconcile must complete before testing fresh scope equality.
        await waitQualification(root, qualification.inputRevision)
        const current = await session.request("textDocument/references", {
          textDocument: { uri: queryUri }, position, context: { includeDeclaration: true },
        }, { timeoutMs: 30_000 })
        assert.equal(current.error, undefined, JSON.stringify(current))
        assert.deepEqual(sorted(current.result), sorted(initialLocations))
      }
      const currentEvents = readRows(path.join(root, "logs-indexed-batched", "server.log"))
      assert.equal(currentEvents.filter(row => row.event === "references.index.accepted").length, 1)
      assert.ok(currentEvents.some(row => row.event === "references.index.fallback"
        && row.reason === "semantic-input-scope-mismatch"),
      JSON.stringify(currentEvents.filter(row => /references.index.|index.maintenance./u.test(row.event))))
    },
  })

  assert.deepEqual(result.locations, conservative.locations)
  const initialBatchEvents = result.batchEvents.filter(event => event.referenceSession === 1)
  assert.equal(initialBatchEvents.length, 2, JSON.stringify(result.batchEvents))
  assert.ok(initialBatchEvents.every(event => event.semanticUnitMode === "project-graph"))
  assert.ok(initialBatchEvents.every(event => event.semanticUnits === 3))
  assert.ok(initialBatchEvents.every(event => event.admittedProjectFiles === 4))
  assert.ok(initialBatchEvents.every(event => event.admittedProjectFiles < event.membershipFiles))
  assert.ok(initialBatchEvents.some(event => event.batchCandidateRoots === 2),
    "Target and Barrel from the shared unit must stay in one batch")
  const accepted = result.indexEvents.find(event => event.event === "references.index.accepted")
  const scopedRequest = result.indexRequests.find(request => (
    request.method === "references/candidates"
    && request.params.declarationUri.endsWith("/shared/src/main/ets/Target.ets")
  ))
  assert.deepEqual(scopedRequest?.params.admittedRootUris?.map(uri => (
    new URL(uri).pathname.slice(new URL(uri).pathname.indexOf("/workspace/"))
  )), [
    "/workspace/entry/src/main",
    "/workspace/shared/src/main",
    "/workspace/unrelated/src/main",
  ])
  assert.equal(accepted?.anchorMode, "compiler-definition-identity",
    JSON.stringify(result.referenceEvents))
  assert.equal(accepted?.candidateFiles, 4)
  const scopedRequests = result.indexRequests.filter(request => (
    request.method === "references/candidates"
    && request.params.declarationUri.endsWith("/shared/src/main/ets/Target.ets")
  ))
  assert.equal(scopedRequests.length, 1, "scope mismatch must stop before another declaration candidate lookup")
  const afterProjectChange = result.indexRequests.filter(request => request.method === "references/candidates")
    .findLast(request => request.params.admittedRootUris?.length === 2)
  assert.deepEqual(afterProjectChange?.params.admittedRootUris.map(uri => (
    new URL(uri).pathname.slice(new URL(uri).pathname.indexOf("/workspace/"))
  )), ["/workspace/entry/src/main", "/workspace/shared/src/main"])
  assert.deepEqual(result.indexEvents.filter(event => event.event === "references.index.accepted")
    .map(event => event.servedGeneration), [firstQualification.head])
  assert.ok(result.referenceEvents.some(event => (
    event.event === "references.index.fallback" && event.reason === "workspace-changed"
  )))
  assert.deepEqual([...new Set(result.locations.map(location => (
    path.basename(new URL(location.uri).pathname)
  )))].sort(), [
    "Barrel.ets", "Query.ets", "Target.ets", "Use.ets",
  ])

  // Independent dependency-underdeclaration control: restore matching Native/
  // semantic scopes instead of letting the preceding scope mismatch hide it.
  await fs.promises.writeFile(path.join(workspace, "build-profile.json5"), originalBuildProfile)
  await fs.promises.writeFile(path.join(entryRoot, "oh-package.json5"),
    "{ name: 'entry', dependencies: {} }")
  const underdeclared = await runSingleReferenceRequest(t, {
    root, workspace, queryUri, queryText, position,
    strategy: "indexed-batched",
    awaitIndexReady: true,
    indexScenario: "semantic-units",
    batchRoots: "1",
    runId: "underdeclared",
  })
  assert.deepEqual(underdeclared.locations, conservative.locations)
  assert.ok(underdeclared.batchEvents.every(event => (
    event.semanticUnitMode === "project-graph"
  )), JSON.stringify(underdeclared.referenceEvents))
  assert.equal(underdeclared.referenceEvents.some(event => (
    event.event === "references.semantic-unit.fallback"
  )), false, JSON.stringify(underdeclared.referenceEvents))
  const expanded = underdeclared.referenceEvents.filter(event => (
    event.event === "references.semantic-unit.expanded"
  ))
  assert.equal(expanded.length, 1, JSON.stringify(underdeclared.referenceEvents))
  assert.equal(expanded[0].reason, "source-unavailable")
  assert.equal(expanded[0].addedSemanticUnits, 1)
  assert.ok(expanded[0].addedProjectFiles > 0)
  assert.ok(expanded[0].unavailableProjectFiles > 0)
  assert.match(expanded[0].unavailableProjectPathFingerprints, /^(?:[0-9a-f]{16})(?:,[0-9a-f]{16})*$/u)
  assert.ok(expanded[0].unavailableProjectPathFingerprints.split(",").includes(
    pathFingerprint(workspace, path.join(sharedSource, "Barrel.ets")),
  ))
  assert.equal(Object.hasOwn(expanded[0], "paths"), false)
})

function readRows(file) {
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse)
}

async function waitQualification(root, previousRevision) {
  const deadline = Date.now() + 10_000
  while (Date.now() <= deadline) {
    const receipt = readRows(path.join(root, "logs-indexed-batched", "server.log")).findLast(event => (
      event.event === "index.maintenance.phase" && event.outcome === "qualified" && event.currentInput
      && event.inputRevision > previousRevision && event.scope !== "file"
    ))
    if (receipt) return receipt
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw Error(`missing current Native qualification after ${previousRevision}`)
}
