import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("re-export references expose the direct proof decision only when tracing is enabled", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-direct-proof-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sources = {
    "Target.ets": "export class Thing {}\n",
    "Barrel.ets": 'export { Thing as PublicThing } from "./Target"\n',
    "Use.ets": 'import { PublicThing } from "./Barrel"\nconst value = new PublicThing()\n',
    "Other.ets": "export class PublicThing {}\nconst unrelated = new PublicThing()\n",
  }
  for (const [file, source] of Object.entries(sources)) {
    fs.writeFileSync(path.join(root, file), source)
  }
  const traced = await replay(root, sources, true)
  const silent = await replay(root, sources, false)
  assert.deepEqual(traced.references, silent.references,
    "observation must not alter the compiler-verified Location set")
  assert.ok(traced.references.some(location => location.uri === fileUri(root, "Use.ets")),
    "the actual consumer must remain discoverable")
  assert.ok(!traced.references.some(location => location.uri === fileUri(root, "Other.ets")),
    "an independent same-name declaration must not be returned")
  const decision = traced.events.find(event => event.event === "references.index.direct-proof")
  assert.ok(decision, "trace must explain why a separate compiler anchor was needed")
  assert.equal(decision.reason, "unsupported")
  assert.equal(decision.supported, false)
  assert.ok(decision.traceId)
  assert.ok(!silent.events.some(event => event.event === "references.index.direct-proof"),
    "the default path must not emit direct-proof observations")
  assert.ok(!silent.events.some(event => event.event === "references.search.document-prepare.complete"),
    "the default path must not emit workspace-preparation timing")
  assert.ok(!silent.events.some(event => event.event === "references.search.document-prepare.phase"),
    "the default path must not emit workspace-preparation phases")
  const rejected = await replay(root, sources, true, { reexportSeed: true })
  assert.deepEqual(rejected.references, traced.references)
  assert.ok(!rejected.events.some(event => event.event === "references.anchor.seed.accepted"),
    "an aliased re-export must not be treated as an unaliased seed")
})

test("opt-in unaliased re-export seed avoids the separate anchor only after final compiler proof", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reexport-seed-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sources = {
    "Target.ets": "export class Thing {}\n",
    "Barrel.ets": 'export { Thing } from "./Target"\n',
    "Use.ets": 'import { Thing } from "./Barrel"\nconst value = new Thing()\n',
    "Other.ets": "export class Unrelated {}\nconst other = new Unrelated()\n",
  }
  for (const [file, source] of Object.entries(sources)) {
    fs.writeFileSync(path.join(root, file), source)
  }
  const control = await replay(root, sources, true, { position: 10 })
  const seeded = await replay(root, sources, true, { position: 10, reexportSeed: true })
  assert.deepEqual(seeded.references, control.references)
  assert.ok(seeded.references.some(location => location.uri === fileUri(root, "Use.ets")))
  assert.ok(control.events.some(event => event.event === "references.anchor.complete"))
  assert.ok(seeded.events.some(event => event.event === "references.anchor.seed.accepted"),
    "a unique export may be used only as a seed, pending final compiler verification")
  const preparation = seeded.events.find(event =>
    event.event === "references.search.document-prepare.complete")
  assert.ok(preparation, "the seeded path must expose workspace preparation separately")
  assert.ok(preparation.durationMs >= 0 && preparation.preparedDocuments >= 1)
  const phases = seeded.events.filter(event =>
    event.event === "references.search.document-prepare.phase")
  assert.deepEqual(phases.map(event => event.phase), [
    "current-load", "overlay-authority", "dependency-closure",
    "project-membership", "workspace-preload", "finalize",
  ], "the traced public request must attribute the complete preparation sequence")
  assert.ok(phases.every(event => Number.isFinite(event.durationMs) && event.durationMs >= 0))
  assert.ok(!seeded.events.some(event => event.event === "references.anchor.complete"),
    "the accepted seed should avoid a separate cold anchor Program")
  assert.ok(seeded.events.filter(event => event.event === "references.batch.complete")
    .every(event => event.anchorVerified === true),
  "every final batch must resolve the original cursor to the seeded declaration")
})

test("re-export seed preserves the declaration Location when requested", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reexport-declaration-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sources = {
    "Target.ets": "export class Thing {}\n",
    "Barrel.ets": 'export { Thing } from "./Target"\n',
    "Use.ets": 'import { Thing } from "./Barrel"\nconst value = new Thing()\n',
  }
  for (const [file, source] of Object.entries(sources)) {
    fs.writeFileSync(path.join(root, file), source)
  }
  const options = { position: 10, includeDeclaration: true }
  const control = await replay(root, sources, true, options)
  const seeded = await replay(root, sources, true, { ...options, reexportSeed: true })
  assert.deepEqual(seeded.references, control.references)
  assert.ok(seeded.references.some(location => location.uri === fileUri(root, "Target.ets")
    && location.range.start.line === 0 && location.range.start.character === 13
    && location.range.end.character === 18), "the declaration must not be lost")
  assert.ok(seeded.events.some(event => event.event === "references.anchor.seed.accepted"))
})

test("an unsaved edit cancels a seeded re-export batch and the retry sees the new reference", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reexport-overlay-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sources = {
    "Target.ets": "export class Thing {}\n",
    "Barrel.ets": 'export { Thing } from "./Target"\n',
    "Use.ets": 'import { Thing } from "./Barrel"\nconst value = new Thing()\n',
  }
  for (const [file, source] of Object.entries(sources)) {
    fs.writeFileSync(path.join(root, file), source)
  }
  const options = { position: 10, interrupt: "edit" }
  const control = await replay(root, sources, true, options)
  const seeded = await replay(root, sources, true, { ...options, reexportSeed: true })
  assert.deepEqual(seeded.references, control.references)
  assert.ok(seeded.references.some(location => location.uri === fileUri(root, "Use.ets")
    && location.range.start.line === 2),
  `the fresh unsaved reference must be present: ${JSON.stringify(seeded.references)}`)
  assert.ok(seeded.events.some(event => event.event === "references.anchor.seed.accepted"))
})

test("cancelling a seeded re-export batch returns no partial result and retry stays exact", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reexport-cancel-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sources = {
    "Target.ets": "export class Thing {}\n",
    "Barrel.ets": 'export { Thing } from "./Target"\n',
    "Use.ets": 'import { Thing } from "./Barrel"\nconst value = new Thing()\n',
  }
  for (const [file, source] of Object.entries(sources)) {
    fs.writeFileSync(path.join(root, file), source)
  }
  const options = { position: 10, interrupt: "cancel" }
  const control = await replay(root, sources, true, options)
  const seeded = await replay(root, sources, true, { ...options, reexportSeed: true })
  assert.deepEqual(seeded.references, control.references)
  assert.ok(seeded.references.some(location => location.uri === fileUri(root, "Use.ets")))
  assert.ok(seeded.events.some(event => event.event === "references.anchor.seed.accepted"))
})

test("a unique but wrong class seed is rejected without losing function references", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-wrong-reexport-seed-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sources = {
    "Target.ets": "export function Thing() {}\n",
    "Barrel.ets": 'export { Thing } from "./Target"\n',
    "Use.ets": 'import { Thing } from "./Barrel"\nThing()\n',
    "Other.ets": "export class Thing {}\nconst unrelated = new Thing()\n",
  }
  for (const [file, source] of Object.entries(sources)) {
    fs.writeFileSync(path.join(root, file), source)
  }
  const control = await replay(root, sources, true, { position: 10 })
  const seeded = await replay(root, sources, true, { position: 10, reexportSeed: true })
  assert.deepEqual(seeded.references, control.references)
  assert.ok(seeded.references.some(location => location.uri === fileUri(root, "Use.ets")))
  assert.ok(!seeded.references.some(location => location.uri === fileUri(root, "Other.ets")))
  assert.ok(seeded.events.some(event => event.event === "references.anchor.seed.rejected"))
  assert.ok(seeded.events.some(event => event.event === "references.anchor.seed.fallback"))
})

async function replay(root, sources, trace,
  { position = 20, reexportSeed = false, includeDeclaration = false, interrupt } = {}) {
  const name = `${trace ? "traced" : "silent"}-${reexportSeed ? "seed" : "control"}`
  const logs = path.join(root, `${name}-logs`)
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(root).href,
    capabilities: { window: { workDoneProgress: true } },
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, `${name}-cache`),
      ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "target", "release", "arkts-index-sidecar"),
      ARKTS_LSP_LOG_DIR: logs,
      ARKTS_REFERENCES_STRATEGY: "indexed-batched",
      ARKTS_REFERENCES_TRACE: trace ? "1" : "0",
      ARKTS_REFERENCES_ANCHOR_REUSE: "0",
      ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR: "0",
      ARKTS_REFERENCES_REEXPORT_ANCHOR_SEED: reexportSeed ? "1" : "0",
      ARKTS_TEST_REFERENCE_VERIFIER_DELAY_MS: interrupt ? "1000" : undefined,
    },
  })
  try {
    await session.initialize({ timeoutMs: 10_000 })
    const create = await session.transport.serverRequest(
      "window/workDoneProgress/create", () => true, 10_000,
    )
    session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
    await session.transport.progress(
      create.params.token, message => message.params.value.kind === "end", 10_000,
    )
    const uri = fileUri(root, "Barrel.ets")
    session.openDocument({ uri, version: 1, text: sources["Barrel.ets"] })
    if (interrupt === "edit") session.openDocument({ uri: fileUri(root, "Use.ets"),
      version: 1, text: sources["Use.ets"] })
    const params = {
      textDocument: { uri }, position: { line: 0, character: position },
      context: { includeDeclaration },
    }
    if (interrupt) {
      const id = 900
      session.transport.send({ jsonrpc: "2.0", id, method: "textDocument/references", params })
      await waitForBatch(logs)
      if (interrupt === "edit") {
        session.changeDocument({ uri, version: 2,
          text: sources["Barrel.ets"] + "// unsaved edit invalidates the query\n" })
        session.changeDocument({ uri: fileUri(root, "Use.ets"), version: 2,
          text: sources["Use.ets"] + "const fresh = new Thing()\n" })
      } else session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
      const interrupted = await session.transport.response(id, 10_000)
      assert.equal(interrupted.error?.code, interrupt === "edit" ? -32801 : -32800)
      assert.equal(interrupted.result, undefined)
    }
    const response = await session.request("textDocument/references", params, { timeoutMs: 30_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    await session.close({ timeoutMs: 5_000 })
    const log = path.join(logs, "server.log")
    const events = fs.existsSync(log)
      ? fs.readFileSync(log, "utf8").split("\n").filter(Boolean).map(JSON.parse) : []
    return { references: response.result, events }
  } finally {
    await session.close().catch(() => {})
  }
}

async function waitForBatch(logDirectory) {
  const log = path.join(logDirectory, "server.log")
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (fs.existsSync(log) && fs.readFileSync(log, "utf8").split("\n")
      .filter(Boolean).map(JSON.parse).some(event => event.event === "references.batch.start")) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error("Timed out waiting for the transient reference batch")
}

function fileUri(root, file) {
  return pathToFileURL(path.join(root, file)).href
}
