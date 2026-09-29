import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("usage-site anchor keeps transient isolation by default after a definition", async (t) => {
  const result = await replay(t)
  assert.equal(result.anchor.verifierIsolation, "transient-worker")
  assert.ok(result.anchor.preparedProgramSourceFiles > 0)
})

test("cold usage-site anchor trace separates compiler preparation from definition lookup", async (t) => {
  const { anchor, events } = await replay(t, { warm: false })
  assert.ok(Number.isFinite(anchor.workerStartupMs) && anchor.workerStartupMs >= 0,
    "anchor trace must distinguish worker startup from Program preparation")
  assert.ok(events.filter(event => event.event === "references.batch.complete")
    .every(event => Number.isFinite(event.workerStartupMs) && event.workerStartupMs >= 0),
    "each transient verifier must report its startup independently")
  for (const field of ["workerPrepareHostMs", "workerProgramReadyMs", "workerGetProgramMs",
    "workerCreateProgramMs", "workerGetTypeCheckerMs", "workerQueryMs"]) {
    assert.ok(Number.isFinite(anchor[field]) && anchor[field] >= 0, `missing anchor phase ${field}`)
  }
  assert.ok(anchor.workerCreateProgramMs > 0)
  assert.ok(anchor.workerGetProgramMs + anchor.workerGetTypeCheckerMs <= anchor.workerProgramReadyMs)
})

test("cold usage-site anchor keeps exact references without enabling compiler trace by default", async (t) => {
  const { anchor, events } = await replay(t, { warm: false, trace: false })
  for (const field of ["workerStartupMs", "workerGetProgramMs", "workerCreateProgramMs", "workerGetTypeCheckerMs"]) {
    assert.equal(anchor[field], undefined)
  }
  assert.equal(anchor.verifierIsolation, "transient-worker")
  assert.ok(!events.some(event => ["references.anchor.document-prepare.complete",
    "references.anchor.resolve.complete"].includes(event.event)))
  assert.ok(!events.some(event => event.event === "references.candidate-phase.complete"))
})

test("cold anchor trace distinguishes document preparation from isolated semantic resolution", async (t) => {
  const { events } = await replay(t, { warm: false })
  for (const phase of ["document-prepare", "resolve"]) {
    const event = events.find(event => event.event === `references.anchor.${phase}.complete`)
    assert.ok(event, `missing anchor ${phase} observation`)
    assert.ok(Number.isFinite(event.durationMs) && event.durationMs >= 0)
    assert.ok(event.traceId, "anchor subphases must correlate with the references request")
  }
})

test("cold references trace distinguishes candidate RPC and source resolution phases", async (t) => {
  const { events } = await replay(t, { warm: false })
  const selection = events.find(event => event.event === "references.candidate-selection.complete")
  for (const phase of ["admission", "direct-query", "direct-sources",
    "declaration-query", "declaration-sources"]) {
    const event = events.find(event => event.event === "references.candidate-phase.complete"
      && event.phase === phase)
    assert.ok(event, `missing candidate phase ${phase}`)
    assert.equal(event.traceId, selection.traceId)
    assert.ok(Number.isFinite(event.durationMs) && event.durationMs >= 0)
    assert.equal(event.outcome, "complete")
  }
})

test("opt-in cold local-export references validate the seed in the final compiler batch", async (t) => {
  const result = await replay(t, { warm: false, localExport: true, localSeed: true })
  assert.ok(result.events.some(event => event.event === "references.anchor.seed.accepted"))
  assert.ok(!result.events.some(event => event.event === "references.anchor.complete"),
    "a proven local seed must not need a standalone compiler anchor")
  assert.ok(result.events.filter(event => event.event === "references.batch.complete")
    .every(event => event.anchorVerified === true), "each batch must prove the actual query target")
})

test("local-export anchor seeding stays disabled by default", async (t) => {
  const result = await replay(t, { warm: false, localExport: true })
  assert.equal(result.anchor.verifierIsolation, "transient-worker")
  assert.ok(!result.events.some(event => event.event === "references.anchor.seed.accepted"))
})

test("seeded multi-batch references prove the same anchor in every batch", async (t) => {
  const { events } = await replay(t, {
    warm: false, localExport: true, localSeed: true, batchRoots: 1,
  })
  const batches = events.filter(event => event.event === "references.batch.complete")
  assert.ok(batches.length > 1, "the transcript must actually cross a batch boundary")
  assert.ok(batches.every(event => event.anchorVerified === true))
  assert.ok(!events.some(event => event.event === "references.anchor.complete"))
})

test("seeded references preserve the declaration policy across multiple batches", async (t) => {
  await replay(t, {
    warm: false, localExport: true, localSeed: true, batchRoots: 1, includeDeclaration: true,
  })
})

test("incomplete local-export proof explains its rejection without losing exact references", async (t) => {
  const { events } = await replay(t, {
    warm: false, localExport: true, localSeed: true, unclassifiedOccurrence: true,
  })
  const rejected = events.find(event => event.event === "references.anchor.seed.proof-rejected")
  assert.ok(rejected, "a rejected discovery seed must identify the failed proof gate")
  assert.equal(rejected.reason, "identity-incomplete")
  assert.equal(rejected.identityComplete, false)
  assert.equal(rejected.servedGeneration, rejected.seedGeneration)
  assert.ok(!events.some(event => event.event === "references.anchor.seed.accepted"))
})

test("seed-proof rejection tracing stays off without the trace flag", async (t) => {
  const { events } = await replay(t, {
    warm: false, localExport: true, localSeed: true, unclassifiedOccurrence: true, trace: false,
  })
  assert.ok(!events.some(event => event.event === "references.anchor.seed.proof-rejected"))
})

test("explicit constructor references preserve their own identity across aliases and inheritance", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-constructor-anchor-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sources = {
    "Target.ets": "export class Thing {\n  constructor() {}\n  static make() { return new this() }\n}\nexport const seed = new Thing()\n",
    "Barrel.ets": 'export { Thing as PublicThing } from "./Target"\n',
    "Consumer.ets": 'import { PublicThing } from "./Barrel"\nexport const use = new PublicThing()\n',
    "Direct.ets": 'import { Thing as Maker } from "./Target"\nexport const direct = new Maker()\n',
    "Derived.ets": 'import { Thing } from "./Target"\nexport class Child extends Thing {\n  constructor() { super() }\n}\n',
    "Implicit.ets": 'import { Thing } from "./Target"\nexport class Implicit extends Thing {}\n',
    "Inherited.ets": 'import { Implicit } from "./Implicit"\nexport class Inherited extends Implicit {}\n',
    "AliasConstruct.ets": 'import { Inherited as Leaf } from "./Inherited"\nexport const inherited = new Leaf()\n',
    "OwnInherited.ets": 'import { Child } from "./Derived"\nexport class OwnInherited extends Child {}\n',
    "OwnConstruct.ets": 'import { OwnInherited as Leaf } from "./OwnInherited"\nexport const own = new Leaf()\n',
    "SameName.ets": "export class Thing { constructor() {} }\nexport const other = new Thing()\n",
    "DefaultBase.ets": "export class Root {}\nexport const seed = new Root()\n",
    "DefaultDirect.ets": 'import { Root as Maker } from "./DefaultBase"\nexport const direct = new Maker()\n',
    "DefaultDerived.ets": 'import { Root } from "./DefaultBase"\nexport class Branch extends Root {}\n',
    "DefaultInherited.ets": 'import { Branch } from "./DefaultDerived"\nexport class Crown extends Branch {}\n',
    "DefaultLeaf.ets": 'import { Crown as Leaf } from "./DefaultInherited"\nexport const leaf = new Leaf()\n',
  }
  for (const [file, text] of Object.entries(sources)) fs.writeFileSync(path.join(root, file), text)
  const uri = file => pathToFileURL(path.join(root, file)).href
  const snapshots = []
  for (const profile of ["legacy", "indexed-batched", "conservative-semantic-units", "trace-off"]) {
    const strategy = profile === "legacy" ? "legacy" : "indexed-batched"
    const logs = path.join(root, `${profile}-logs`)
    const session = new LspSession({
      command: process.execPath, args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
      cwd: projectRoot, rootUri: pathToFileURL(root).href,
      capabilities: { window: { workDoneProgress: true } },
      env: {
        ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
        DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
        ARKTS_INDEX_CACHE_DIR: path.join(root, `${profile}-cache`),
        ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "target", "release", "arkts-index-sidecar"),
        ARKTS_LSP_LOG_DIR: logs, ARKTS_REFERENCES_STRATEGY: strategy,
        ARKTS_REFERENCES_BATCH_ROOTS: "1", ARKTS_REFERENCES_TRACE: profile === "trace-off" ? "0" : "1",
        ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR: "1", ARKTS_REFERENCES_ANCHOR_REUSE: "0",
        ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS: profile === "conservative-semantic-units" ? "1" : "0",
      },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000 })
    const create = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
    session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
    await session.transport.progress(create.params.token, message => message.params.value.kind === "end", 10_000)
    session.openDocument({ uri: uri("Target.ets"), version: 1, text: sources["Target.ets"] })
    const results = []
    for (const [file, position] of [
      ["Target.ets", { line: 0, character: 14 }],
      ["Target.ets", { line: 4, character: 26 }],
      ["Direct.ets", { line: 1, character: 27 }],
      ["DefaultBase.ets", { line: 1, character: 25 }],
      ["DefaultDirect.ets", { line: 1, character: 27 }],
    ]) {
      if (file !== "Target.ets") session.openDocument({ uri: uri(file), version: 1, text: sources[file] })
      const definition = await session.request("textDocument/definition", {
        textDocument: { uri: uri(file) }, position,
      }, { timeoutMs: 20_000 })
      assert.equal(definition.error, undefined)
      assert.equal(definition.result.length, 1)
      if (file === "Direct.ets") assert.deepEqual(definition.result[0].range.start, results[3],
        `${profile}: direct-import construction must resolve to the same constructor`)
      results.push(definition.result[0].range.start)
      for (const includeDeclaration of [false, true]) {
        const response = await session.request("textDocument/references", {
          textDocument: { uri: uri(file) }, position, context: { includeDeclaration },
        }, { timeoutMs: 30_000 })
        assert.equal(response.error, undefined, JSON.stringify(response.error))
        const implicitBase = file.startsWith("Default")
        assert.ok(response.result.some(location => location.uri === uri(implicitBase ? "DefaultBase.ets" : "Target.ets")
          && location.range.start.line === (implicitBase ? 1 : 4)), "the real construction must be found")
        assert.ok(!response.result.some(location => location.uri === uri("SameName.ets")),
          "independent same-name construction is not a reference")
        if (position.line !== 0 && !implicitBase) {
          assert.ok(response.result.some(location => location.uri === uri("Target.ets")
            && location.range.start.line === 2), "constructor search must find static new this without the class lexeme")
          assert.ok(!response.result.some(location => location.uri === uri("OwnConstruct.ets")),
            "a derived own constructor stops base constructor call inheritance")
          assert.ok(response.result.some(location => location.uri === uri("Derived.ets")
            && location.range.start.line === 2), "constructor search must include the derived super call")
          assert.ok(response.result.some(location => location.uri === uri("AliasConstruct.ets")
            && location.range.start.line === 1), `${profile}/${file}: inherited constructor alias calls have no base-class lexeme`)
        }
        results.push(response.result.map(location => JSON.stringify(location)).sort())
      }
    }
    await session.close({ timeoutMs: 5_000 })
    if (profile === "indexed-batched") {
      const events = fs.readFileSync(path.join(logs, "server.log"), "utf8").split("\n").filter(Boolean).map(JSON.parse)
      assert.ok(events.some(event => event.event === "references.anchor.seed.rejected"),
        "compiler must reject class-export proof at a direct-import construction")
      assert.ok(events.some(event => event.event === "references.anchor.seed.fallback"))
      assert.ok(!events.some(event => event.event === "references.anchor.complete"),
        "a rejected discovery anchor must use complete scope without a second cold definition Worker")
      assert.ok(events.some(event => event.event === "references.plan.complete"
        && event.candidateFiles === event.membershipFiles), "retry must cover the full legal scope")
    }
    if (profile === "conservative-semantic-units") {
      const events = fs.readFileSync(path.join(logs, "server.log"), "utf8").split("\n").filter(Boolean).map(JSON.parse)
      const batches = events.filter(event => event.event === "references.batch.complete")
      assert.ok(batches.length > 0)
      assert.ok(batches.every(event => event.semanticUnitMode === "conservative"),
        "a workspace without a complete ProjectGraph must retain file batching")
    }
    snapshots.push(results)
  }
  assert.deepEqual(snapshots[1], snapshots[0], "each query must match its own fresh compiler oracle")
  assert.deepEqual(snapshots[2], snapshots[0], "an unavailable graph cannot change the result")
  assert.deepEqual(snapshots[3], snapshots[0], "anchor correctness must not depend on tracing")
  assert.notDeepEqual(snapshots[0][0], snapshots[0][3], "class and constructor definitions are distinct")
  assert.notDeepEqual(snapshots[0][1], snapshots[0][4], "do not normalize constructor references to class results")
})

test("rejected-anchor metrics stay disabled without the trace flag", async (t) => {
  const { events } = await replay(t, {
    warm: false, localExport: true, localSeed: true, shadow: true, trace: false,
  })
  assert.equal(events.some(event => event.event === "references.anchor.seed.rejected"), false)
  assert.equal(events.some(event => event.workerCreateProgramMs !== undefined), false)
})

test("local-export seed cannot confuse a same-name parameter with the exported class", async (t) => {
  const result = await replay(t, { warm: false, localExport: true, localSeed: true, shadow: true })
  assert.ok(result.events.some(event => event.event === "references.anchor.seed.rejected"))
  const rejected = result.events.find(event => event.event === "references.anchor.seed.rejected")
  for (const field of ["workerStartupMs", "workerPrepareHostMs", "workerProgramReadyMs",
    "workerCreateProgramMs", "workerGetTypeCheckerMs", "workerQueryMs", "preparedProgramSourceFiles",
    "preparedSdkSourceFiles", "preparedRss", "preparedHeapUsed", "rss", "heapUsed", "durationMs"]) {
    assert.ok(Number.isFinite(rejected[field]) && rejected[field] >= 0,
      `rejected verifier must retain its actual ${field} observation`)
  }
  assert.ok(rejected.workerCreateProgramMs > 0)
  assert.equal(rejected.verifierIsolation, "transient-worker")
  assert.ok(!result.events.some(event => event.event === "references.batch.complete"
    && event.referenceSession === rejected.referenceSession && event.batchIndex === rejected.batchIndex),
    "a rejected attempt must not be counted as a successful batch")
  assert.ok(result.events.some(event => event.event === "references.anchor.seed.fallback"))
  assert.ok(!result.events.some(event => event.event === "references.anchor.complete"),
    "a rejected shadowed seed must use complete compiler scope without redundant anchoring")
})

for (const interrupt of ["cancel", "edit"]) {
  test(`${interrupt} during rejected-anchor complete retry rejects old work and permits exact recovery`, async (t) => {
    const { events } = await replay(t, { warm: false, localExport: true, localSeed: true,
      shadow: true, interrupt, interruptAfterRejection: true })
    assert.ok(events.some(event => event.event === "references.anchor.seed.fallback"
      && event.strategy === "complete-scope"))
    assert.ok(!events.some(event => event.event === "references.anchor.complete"))
  })
}

test("cancelling seeded verification returns no partial result and permits exact recovery", async (t) => {
  await replay(t, { warm: false, localExport: true, localSeed: true, interrupt: "cancel" })
})

test("editing during seeded verification rejects the snapshot and finds the unsaved local reference", async (t) => {
  await replay(t, { warm: false, localExport: true, localSeed: true, interrupt: "edit" })
})

test("local-export seeding preserves exactness after a pre-query unsaved comment edit", async (t) => {
  await replay(t, { warm: false, localExport: true, localSeed: true, edit: true })
})

test("opt-in usage-site anchor reuses a compiler-validated definition at the same snapshot", async (t) => {
  const result = await replay(t, { reuse: true })
  assert.equal(result.anchor.verifierIsolation, "validated-definition")
  assert.equal(result.anchor.anchorWorkerStarts, 0)
  assert.equal(result.anchor.anchorProgramBuilds, 0)
  assert.ok(result.events.filter(event => event.event === "references.batch.complete")
    .every(event => event.verifierIsolation === "transient-worker"))
})

test("opt-in anchor falls back after an unsaved overlay edit", async (t) => {
  const result = await replay(t, { reuse: true, edit: true })
  assert.equal(result.anchor.verifierIsolation, "transient-worker")
})

test("opt-in anchor falls back without a compiler-validated definition", async (t) => {
  const result = await replay(t, { reuse: true, warm: false })
  assert.equal(result.anchor.verifierIsolation, "transient-worker")
})

test("opt-in anchor cannot reuse a definition from a different SDK ambient profile", async (t) => {
  const result = await replay(t, { reuse: true, interactiveSdkProfile: "core" })
  assert.equal(result.anchor.verifierIsolation, "transient-worker")
})

test("opt-in anchor falls back when another open document changes the root snapshot", async (t) => {
  const result = await replay(t, { reuse: true, editDependency: true })
  assert.equal(result.anchor.verifierIsolation, "transient-worker")
})

test("opt-in anchor cannot reuse a definition from another position", async (t) => {
  const result = await replay(t, { reuse: true, warmImport: true })
  assert.equal(result.anchor.verifierIsolation, "transient-worker")
})

test("opt-in anchor falls back when an open dependency is reopened at the same version", async (t) => {
  const result = await replay(t, { reuse: true, reopenDependency: true })
  assert.equal(result.anchor.verifierIsolation, "transient-worker")
})

test("opt-in anchor falls back when an unopened dependency changes on disk", async (t) => {
  const result = await replay(t, { reuse: true, editDiskDependency: true })
  assert.equal(result.anchor.verifierIsolation, "transient-worker")
})

test("opt-in references include the moved declaration after an unwatched disk edit", async (t) => {
  const result = await replay(t, { reuse: true, moveDiskDeclaration: true })
  assert.equal(result.anchor.verifierIsolation, "transient-worker")
})

test("cancelling references after anchor reuse returns no partial result and permits exact recovery", async (t) => {
  const result = await replay(t, { reuse: true, interrupt: "cancel" })
  assert.equal(result.anchor.verifierIsolation, "validated-definition")
  assert.equal(result.recoveryAnchor.verifierIsolation, "transient-worker")
})

test("editing during reused-anchor verification rejects the old snapshot and finds the new reference", async (t) => {
  const result = await replay(t, { reuse: true, interrupt: "edit" })
  assert.equal(result.anchor.verifierIsolation, "validated-definition")
  assert.equal(result.recoveryAnchor.verifierIsolation, "transient-worker")
})

async function replay(t, { reuse = false, edit = false, warm = true,
  interactiveSdkProfile = "full", editDependency = false, warmImport = false,
  reopenDependency = false, editDiskDependency = false, moveDiskDeclaration = false,
  interrupt, trace = true, localExport = false, localSeed = false, shadow = false,
  batchRoots, includeDeclaration = false, unclassifiedOccurrence = false,
  interruptAfterRejection = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-anchor-reuse-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const logDirectory = path.join(root, "logs")
  fs.mkdirSync(workspace)
  const sources = {
    "Target.ets": "export class Thing {}\n",
    "Barrel.ets": 'export { Thing as PublicThing } from "./Target"\n',
    "Query.ets": 'import { PublicThing } from "./Barrel"\nexport const query = new PublicThing()\n',
    "Use.ets": 'import { PublicThing } from "./Barrel"\nexport const use = new PublicThing()\n',
    "SameName.ets": "export class PublicThing {}\nexport const unrelated = new PublicThing()\n",
  }
  if (localExport) sources["Target.ets"] += "export const seed = new Thing()\n"
  if (shadow) sources["Target.ets"] = "export class Thing {}\nexport function f(Thing: number) { return Thing }\n"
  if (unclassifiedOccurrence) sources["Unclassified.ets"] = "export const unrelated = unknown.Thing\n"
  for (const [file, text] of Object.entries(sources)) {
    fs.writeFileSync(path.join(workspace, file), text)
  }
  const uri = file => pathToFileURL(path.join(workspace, file)).href
  const queryUri = uri(localExport ? "Target.ets" : "Query.ets")
  const queryText = sources[localExport ? "Target.ets" : "Query.ets"]
  const position = { line: 1, character: (shadow ? queryText.split("\n")[1].lastIndexOf("Thing")
    : queryText.split("\n")[1].indexOf(localExport ? "Thing" : "PublicThing")) + 1 }
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_INDEX_SIDECAR_PATH: localExport
        ? path.join(projectRoot, "target", "release", "arkts-index-sidecar")
        : path.join(projectRoot, "tests", "fixtures", "index", "scripted-catalog-sidecar.mjs"),
      ARKTS_LSP_LOG_DIR: logDirectory,
      ARKTS_REFERENCES_STRATEGY: "indexed-batched",
      ARKTS_REFERENCES_BATCH_ROOTS: batchRoots?.toString(),
      ARKTS_REFERENCES_TRACE: trace ? "1" : undefined,
      ARKTS_REFERENCES_ANCHOR_REUSE: reuse ? "1" : undefined,
      ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR: localSeed ? "1" : undefined,
      ARKTS_TEST_REFERENCE_VERIFIER_DELAY_MS: interrupt ? "1000" : undefined,
      ARKTS_INTERACTIVE_SDK_AMBIENT_PROFILE: interactiveSdkProfile,
    },
    capabilities: { window: { workDoneProgress: true } },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  const create = await session.transport.serverRequest("window/workDoneProgress/create",
    () => true, 10_000)
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  await session.transport.progress(create.params.token,
    message => message.params.value.kind === "end", 10_000)
  session.openDocument({ uri: queryUri, version: 1, text: queryText })
  if (reopenDependency) session.openDocument({ uri: uri("Barrel.ets"), version: 1,
    text: sources["Barrel.ets"] })
  if (warm) {
    const definition = await session.request("textDocument/definition", {
      textDocument: { uri: queryUri },
      position: warmImport ? { line: 0, character: 10 } : position,
    }, { timeoutMs: 20_000 })
    assert.equal(definition.error, undefined, JSON.stringify(definition.error))
    assert.deepEqual(definition.result, [{ uri: uri("Target.ets"), range: {
      start: { line: 0, character: 13 }, end: { line: 0, character: 18 },
    } }])
  }
  if (edit) session.changeDocument({ uri: queryUri, version: 2,
    text: queryText + "// unsaved comment invalidates the anchor snapshot\n" })
  if (editDependency) session.openDocument({ uri: uri("Barrel.ets"), version: 1,
    text: sources["Barrel.ets"] + "// changed open dependency\n" })
  if (editDiskDependency) fs.writeFileSync(path.join(workspace, "Target.ets"),
    sources["Target.ets"] + "// disk dependency changed before watcher delivery\n")
  if (moveDiskDeclaration) fs.writeFileSync(path.join(workspace, "Target.ets"),
    "// declaration moved before watcher delivery\n" + sources["Target.ets"])
  if (reopenDependency) {
    session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose",
      params: { textDocument: { uri: uri("Barrel.ets") } } })
    session.openDocument({ uri: uri("Barrel.ets"), version: 1,
      text: sources["Barrel.ets"] + "// reopened with different text at version 1\n" })
  }
  const referenceParams = {
    textDocument: { uri: queryUri }, position,
    context: { includeDeclaration: includeDeclaration || moveDiskDeclaration || shadow },
  }
  if (interrupt) {
    const id = 900
    session.transport.send({ jsonrpc: "2.0", id, method: "textDocument/references",
      params: referenceParams })
    await waitForBatch(logDirectory, interruptAfterRejection
      ? "references.anchor.seed.fallback" : "references.batch.start")
    if (interrupt === "edit") session.changeDocument({ uri: queryUri, version: 2,
      text: queryText + `export const fresh = new ${localExport ? "Thing" : "PublicThing"}()\n` })
    else session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
    const interrupted = await session.transport.response(id, 10_000)
    assert.equal(interrupted.error?.code, interrupt === "edit" ? -32801 : -32800)
    assert.equal(interrupted.result, undefined, "interrupted work must never return partial Locations")
  }
  const response = await session.request("textDocument/references", referenceParams,
    { timeoutMs: 30_000 })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const expected = (shadow ? [["Target.ets", 1, 18, 23], ["Target.ets", 1, 42, 47]] : [
    ...(localExport ? [["Target.ets", 1, 24, 29]] : []),
    ...(includeDeclaration ? [["Target.ets", 0, 13, 18]] : []),
    ...(moveDiskDeclaration ? [["Target.ets", 1, 13, 18]] : []),
    ...(interrupt === "edit" ? [[localExport ? "Target.ets" : "Query.ets", 2, 25,
      localExport ? 30 : 36]] : []),
    ["Barrel.ets", 0, 9, 14], ["Barrel.ets", 0, 18, 29],
    ["Query.ets", 0, 9, 20], ["Query.ets", 1, 25, 36],
    ["Use.ets", 0, 9, 20], ["Use.ets", 1, 23, 34],
  ]).map(([file, line, start, end]) => ({ uri: uri(file), range: {
    start: { line, character: start }, end: { line, character: end },
  } }))
  const normalize = locations => locations.map(({ uri, range }) => JSON.stringify([
    uri, range.start.line, range.start.character, range.end.line, range.end.character,
  ])).sort()
  assert.deepEqual(normalize(response.result), normalize(expected))
  await session.close({ timeoutMs: 5_000 })
  const events = fs.readFileSync(path.join(logDirectory, "server.log"), "utf8")
    .split("\n").filter(Boolean).map(JSON.parse)
  const anchor = events.find(event => event.event === "references.anchor.complete")
    ?? events.find(event => event.event === "references.anchor.seed.accepted")
  assert.ok(anchor, "usage-site lookup must exercise the compiler anchor path")
  if (unclassifiedOccurrence) {
    assert.notEqual(events.find(event => event.event === "references.index.accepted")?.anchorMode,
      "indexed-local-export-seed")
  } else assert.equal(events.find(event => event.event === "references.index.accepted")?.anchorMode,
    localSeed ? "indexed-local-export-seed" : "compiler-definition-identity")
  const recoveryAnchor = events.filter(event => event.event === "references.anchor.complete")[1]
  return { anchor, recoveryAnchor, events }
}

async function waitForBatch(logDirectory, eventName = "references.batch.start") {
  const logPath = path.join(logDirectory, "server.log")
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (fs.existsSync(logPath) && fs.readFileSync(logPath, "utf8").split("\n")
      .filter(Boolean).map(JSON.parse).some(event => event.event === eventName)) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error("Timed out waiting for the transient reference batch")
}
