import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { LspSession } from "./lsp-session.mjs"
import { projectRoot } from "./lsp-process.mjs"
import { releasePreparedOwner } from "./semantic-preparation-state.mjs"

export function createFixture(t, { disconnected = false, namedPackage = false, installedPackage = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-coverage-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sources = {
    "Target.ets": [
      'import "./Consumer"', 'import "./Derived"', 'import "./SameName"',
      "export class Thing {", "  constructor() {}",
      "  static make() { return new this() }", "}",
      "export const seed = new Thing()", "",
    ].join("\n"),
    "Consumer.ets": 'import { Thing as Maker } from "./Target"\nexport const use = new Maker()\n',
    "Derived.ets": 'import { Thing } from "./Target"\nexport class Child extends Thing {}\nexport const leaf = new Child()\n',
    "SameName.ets": "export class Thing { constructor() {} }\nexport const other = new Thing()\n",
  }
  if (disconnected) sources["ZHidden.ets"] =
    'import { Child as Leaf } from "./Derived"\nexport const hidden = new Leaf()\n'
  if (namedPackage) {
    sources["Target.ets"] = sources["Target.ets"].replace('import "./SameName"',
      'import "./SameName"; import "./PackageConsumer"')
    sources["PackageConsumer.ets"] =
      'import { Thing as PackageThing } from "shared"\nexport const use = new PackageThing()\n'
    sources["shared/A.ets"] = 'export { Thing } from "../Target"\n'
    sources["shared/B.ets"] = "export class Thing { constructor() {} }\n"
    fs.mkdirSync(path.join(root, "shared"))
    fs.writeFileSync(path.join(root, "oh-package.json5"), "{ dependencies: { shared: 'file:./shared' } }")
    fs.writeFileSync(path.join(root, "shared/oh-package.json5"), "{ main: 'A.ets' }")
  }
  if (installedPackage) {
    delete sources["shared/A.ets"]
    delete sources["shared/B.ets"]
    sources["shared/A/Index.ets"] = 'export { Thing } from "../../Target"\n'
    sources["shared/B/Index.ets"] = "export class Thing { constructor() {} }\n"
    for (const entry of ["A", "B"]) {
      fs.mkdirSync(path.join(root, "shared", entry))
      fs.writeFileSync(path.join(root, "shared", entry, "oh-package.json5"), "{ main: 'Index.ets' }")
    }
    fs.writeFileSync(path.join(root, "oh-package.json5"), "{ dependencies: { shared: '1.0.0' } }")
    fs.mkdirSync(path.join(root, "oh_modules"))
    fs.symlinkSync(path.join(root, "shared/A"), path.join(root, "oh_modules/shared"),
      process.platform === "win32" ? "junction" : "dir")
  }
  for (const [file, text] of Object.entries(sources)) fs.writeFileSync(path.join(root, file), text)
  return { root, sources, uri: file => pathToFileURL(path.join(root, file)).href }
}

export async function replay(t, fixture, strategy, {
  noAnchor = false, localSeed = false, trace = true, warm = false, resident = false, afterWarm,
  benchmarkControl = false, runtimeEnv = {}, expectedReferencesError, afterRejectedReferences,
  includeDeclarations = [false, true], settleBeforeWarm = false, afterReference,
} = {}) {
  const { root, sources, uri } = fixture
  fixture.replayCount = (fixture.replayCount ?? 0) + 1
  const runId = `${strategy}-${localSeed}-${trace}-${fixture.replayCount}`
  const logs = path.join(root, `${runId}-logs`)
  const session = new LspSession({
    command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot, rootUri: pathToFileURL(root).href,
    capabilities: { window: { workDoneProgress: true },
      ...(expectedReferencesError === undefined ? {} : { textDocument: { publishDiagnostics: { versionSupport: true } } }) },
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, `${runId}-cache`),
      ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "target/release/arkts-index-sidecar"),
      ARKTS_LSP_LOG_DIR: logs, ARKTS_REFERENCES_STRATEGY: strategy,
      ARKTS_REFERENCES_BATCH_ROOTS: "1", ARKTS_REFERENCES_TRACE: trace ? "1" : "0",
      ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR: localSeed ? "1" : "0", ARKTS_REFERENCES_ANCHOR_REUSE: "0",
      ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS: "0",
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: resident ? "1" : "0",
      ARKTS_BENCHMARK_CONTROL: benchmarkControl || warm === "selective" ? "1" : "0",
      ...runtimeEnv,
    },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  const create = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  await session.transport.progress(create.params.token, message => message.params.value.kind === "end", 10_000)
  if (warm === "selective") await releasePreparedOwner(session, pathToFileURL(root).href)
  session.openDocument({ uri: uri("Target.ets"), version: 1, text: sources["Target.ets"] })
  const overlay = fixture.overlay ?? sources["Consumer.ets"] + "export const unsaved = new Maker()\n"
  session.openDocument({ uri: uri("Consumer.ets"), version: 1, text: overlay })
  if (settleBeforeWarm) await Promise.all(["Target.ets", "Consumer.ets"].map(file =>
    session.transport.notification("textDocument/publishDiagnostics", message => message.params.uri === uri(file), 10_000)))
  if (warm) {
    const response = await session.request(warm === "selective" ? "textDocument/definition"
      : "textDocument/implementation", {
      textDocument: { uri: uri("Target.ets") },
      position: positionAt(sources["Target.ets"], sources["Target.ets"].indexOf("Thing") + 1),
    }, { timeoutMs: 30_000 })
    if (warm === "incomplete-implementation") {
      assert.equal(response.error?.code, -32803, JSON.stringify(response))
      assert.equal(response.result, undefined, "unknown warm inputs cannot masquerade as a complete implementation")
    } else assert.equal(response.error, undefined, JSON.stringify(response.error))
  }
  await afterWarm?.(session, logs)
  // Both policies must exercise resident/batch admission rather than the first cursor's result cache.
  const ask = includeDeclaration => session.request("textDocument/references", {
      textDocument: { uri: uri("Target.ets") },
      position: positionAt(sources["Target.ets"], noAnchor ? sources["Target.ets"].length
        : sources["Target.ets"].lastIndexOf("Thing") + 1 + Number(includeDeclaration)),
      context: { includeDeclaration },
    }, { timeoutMs: 30_000 })
  if (expectedReferencesError !== undefined) {
    for (const includeDeclaration of [false, true]) {
      const response = await ask(includeDeclaration)
      assert.equal(response.error?.code, expectedReferencesError, JSON.stringify(response))
      assert.equal(response.result, undefined, "unproved inputs cannot publish successful partial references")
    }
    await afterRejectedReferences?.(session, logs)
  }
  const results = []
  for (const includeDeclaration of includeDeclarations) {
    const response = await ask(includeDeclaration)
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    results.push(response.result.map(location => JSON.stringify(location)).sort())
    await afterReference?.(session, includeDeclaration)
  }
  await session.close({ timeoutMs: 5_000 })
  const events = fs.readFileSync(path.join(logs, "server.log"), "utf8")
    .split("\n").filter(Boolean).map(JSON.parse)
  return { results, events }
}

export function assertKnownReferences(fixture, results) {
  for (const result of results) {
    const locations = result.map(value => JSON.parse(value))
    for (const [file, line] of [["Target.ets", 5], ["Target.ets", 7],
      ["Consumer.ets", 1], ["Consumer.ets", 2], ["Derived.ets", 2]]) {
      assert.ok(locations.some(location => location.uri === fixture.uri(file)
        && location.range.start.line === line), `missing known reference ${file}:${line}`)
    }
    assert.ok(!locations.some(location => location.uri === fixture.uri("SameName.ets")))
  }
}

export function positionAt(text, offset) {
  const prefix = text.slice(0, offset).split("\n")
  return { line: prefix.length - 1, character: prefix.at(-1).length }
}

export function createTestSdk(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resident-sdk-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const directory of ["toolchains", "ets/component", "ets/build-tools/ets-loader"]) {
    fs.mkdirSync(path.join(root, directory), { recursive: true })
  }
  fs.writeFileSync(path.join(root, "ets/oh-uni-package.json"),
    JSON.stringify({ path: "ets", apiVersion: "24", version: "resident-test" }))
  fs.writeFileSync(path.join(root, "ets/component/common.d.ts"), "interface ResidentSdkMarker {}\n")
  fs.writeFileSync(path.join(root, "ets/build-tools/ets-loader/tsconfig.json"),
    JSON.stringify({ compilerOptions: { ets: {} } }))
  return root
}

export async function waitForEvent(logs, event, timeoutMs = 10_000) {
  const file = path.join(logs, "server.log")
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    if (fs.existsSync(file) && fs.readFileSync(file, "utf8").split("\n")
      .filter(Boolean).some(line => JSON.parse(line).event === event)) return
    await new Promise(resolve => setTimeout(resolve, 2))
  }
  throw new Error(`timed out waiting for ${event}`)
}
