import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

for (const { implicitTargets, localPackage, packageReferences } of [
  { implicitTargets: false, localPackage: false },
  { implicitTargets: true, localPackage: false },
  { implicitTargets: false, localPackage: true },
  { implicitTargets: false, localPackage: true, packageReferences: true },
]) {
test(packageReferences
  ? "references in a non-module package fail closed rather than returning a partial set"
  : localPackage
  ? "local package dependencies preserve full-scope references without inventing a project module"
  : implicitTargets
  ? "implicit production targets exclude ohosTest without losing full-scope constructor references"
  : "conservative semantic-unit batches preserve constructor references without index exclusion", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-conservative-units-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  fs.mkdirSync(workspace)
  const sources = {
    "common/src/main/ets/Target.ets": "export class Thing {\n  constructor() {}\n}\nexport const seed = new Thing()\n",
    "common/src/main/ets/Barrel.ets": 'export { Thing as PublicThing } from "./Target"\n',
    "entry/src/main/ets/Consumer.ets": 'import { PublicThing } from "../../../../common/src/main/ets/Barrel"\nexport const use = new PublicThing()\n',
    "entry/src/main/ets/Derived.ets": 'import { Thing } from "../../../../common/src/main/ets/Target"\nexport class Child extends Thing {\n  constructor() { super() }\n}\n',
    "entry/src/ohosTest/ets/TestOnly.ets": 'import { Thing } from "../../../../common/src/main/ets/Target"\nexport const excluded = new Thing()\n',
    "unrelated/src/main/ets/SameName.ets": "export class Thing { constructor() {} }\nexport const other = new Thing()\n",
    "unrelated/src/main/ets/Other.ets": "export const inert = 1\n",
  }
  if (localPackage) {
    sources["packages/bridge/Index.ets"] = 'export {}\n'
    if (packageReferences) {
      sources["entry/src/main/ets/Consumer.ets"] = 'import { PublicThing } from "bridge"\nexport const use = new PublicThing()\n'
      sources["packages/bridge/Index.ets"] = 'export { PublicThing } from "common"\n'
    }
  }
  fs.writeFileSync(path.join(workspace, "build-profile.json5"), JSON.stringify({
    app: { products: [{ name: "default" }] },
    modules: ["common", "entry", "unrelated"].map(name => ({
      name, srcPath: `./${name}`,
      ...(implicitTargets ? {} : { targets: [{ name: "default", applyToProducts: ["default"] }] }),
    })),
  }))
  for (const [file, text] of Object.entries(sources)) {
    const destination = path.join(workspace, file)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, text)
  }
  for (const name of ["common", "entry", "unrelated"]) {
    fs.writeFileSync(path.join(workspace, name, "build-profile.json5"), implicitTargets
      ? "{ targets: [{ name: 'default' }, { name: 'ohosTest' }] }"
      : "{ targets: [{ name: 'default' }] }")
    fs.writeFileSync(path.join(workspace, name, "oh-package.json5"), JSON.stringify({
      name, main: "./src/main/ets/Barrel.ets",
      dependencies: name === "entry"
        ? localPackage ? { common: "file:../common", bridge: "file:../packages/bridge" } : { common: "file:../common" }
        : {},
    }))
  }
  if (localPackage) fs.writeFileSync(path.join(workspace, "packages/bridge/oh-package.json5"),
    JSON.stringify({ name: "bridge", main: "Index.ets", dependencies: { common: "file:../../common" } }))
  const queryFile = "common/src/main/ets/Target.ets"
  const queryUri = pathToFileURL(path.join(workspace, queryFile)).href
  const consumerFile = "entry/src/main/ets/Consumer.ets"
  const consumerUri = pathToFileURL(path.join(workspace, consumerFile)).href
  const overlay = sources[consumerFile] + "export const unsaved = new PublicThing()\n"
  const results = []
  for (const profile of ["legacy", "default", "semantic-units"]) {
    const logDirectory = path.join(root, `${profile}-logs`)
    const session = new LspSession({
      command: process.execPath, args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
      cwd: projectRoot, rootUri: pathToFileURL(workspace).href,
      capabilities: { window: { workDoneProgress: true } },
      env: {
        ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
        DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
        ARKTS_INDEX_CACHE_DIR: path.join(root, `${profile}-cache`),
        ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "target", "release", "arkts-index-sidecar"),
        ARKTS_LSP_LOG_DIR: logDirectory,
        ARKTS_REFERENCES_STRATEGY: profile === "legacy" ? "legacy" : "indexed-batched",
        ARKTS_REFERENCES_BATCH_ROOTS: "1", ARKTS_REFERENCES_TRACE: "1",
        ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS: profile === "semantic-units" ? "1" : "0",
        ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR: "0", ARKTS_REFERENCES_ANCHOR_REUSE: "0",
      },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000 })
    const create = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
    session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
    await session.transport.progress(create.params.token, message => message.params.value.kind === "end", 10_000)
    session.openDocument({ uri: queryUri, version: 1, text: sources[queryFile] })
    session.openDocument({ uri: consumerUri, version: 1, text: overlay })
    const locations = []
    for (const includeDeclaration of [false, true]) {
      const response = await session.request("textDocument/references", {
        textDocument: { uri: queryUri }, position: { line: 3, character: 26 },
        context: { includeDeclaration },
      }, { timeoutMs: 30_000 })
      if (packageReferences) {
        assert.equal(response.error?.code, -32803, "unsupported package scope cannot return partial success")
        assert.equal(response.result, undefined)
        locations.push(response.error.code)
        continue
      }
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      assert.ok(response.result.some(location => location.uri === consumerUri && location.range.start.line === 2),
        "unsaved alias construction must be included")
      assert.ok(response.result.some(location => location.uri.endsWith("/Derived.ets") && location.range.start.line === 2),
        "derived super construction must be included")
      assert.ok(!response.result.some(location => location.uri.endsWith("/SameName.ets")))
      assert.ok(!response.result.some(location => location.uri.endsWith("/TestOnly.ets")),
        "an implicit production target must not include the test source tree")
      locations.push(response.result.map(location => JSON.stringify(location)).sort())
    }
    await session.close({ timeoutMs: 5_000 })
    const events = fs.readFileSync(path.join(logDirectory, "server.log"), "utf8")
      .split("\n").filter(Boolean).map(JSON.parse)
    results.push({ locations, events })
  }
  assert.deepEqual(results[1].locations, results[0].locations)
  assert.deepEqual(results[2].locations, results[0].locations)
  if (packageReferences) return
  const batches = result => result.events.filter(event => event.event === "references.batch.complete")
  const experiment = batches(results[2])
  assert.ok(experiment.length > 0)
  assert.ok(experiment.every(event => event.candidateMode === "conservative"))
  assert.ok(experiment.every(event => event.semanticUnitMode === "project-graph"),
    "a complete ProjectGraph must be usable without an index candidate set")
  assert.ok(experiment.every(event => event.candidateFiles === event.membershipFiles),
    "this optimization must not exclude any legal candidate")
  assert.ok(experiment.length < batches(results[1]).length, "whole-unit grouping avoids redundant Programs")
  assert.ok(batches(results[1]).every(event => event.semanticUnitMode === "conservative"),
    "the new experiment must remain default-off")
})
}
