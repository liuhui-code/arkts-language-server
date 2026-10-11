import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { LspSession } from "./lsp-session.mjs"
import { projectRoot } from "./lsp-process.mjs"

export function createFixture(t, { manyImplementations = 0, fillerCount = 270 } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resident-implementations-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const workspace = path.join(directory, "workspace")
  const sdk = path.join(directory, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
    JSON.stringify({ apiVersion: "24", version: "test" }))
  const sources = {
    "AWarm.ets": "export interface WarmContract { value: number }\n"
      + "export class WarmImplementation implements WarmContract { value = 1 }\n"
      + "export const warm = new WarmImplementation()\n",
    "ZContracts.ets": "/* 😀 */ export interface GenericContract<T> { run(value: T): T }\n"
      + "export abstract class AbstractTask { abstract execute(): number }\n",
    "ZNumber.ets": 'import { GenericContract as ContractAlias } from "./ZContracts"\n'
      + "export class NumberWorker implements ContractAlias<number> {\n"
      + "  run(value: number): number { return value }\n}\n",
    "ZText.ets": 'import { GenericContract } from "./ZContracts"\n'
      + "export class TextWorker implements GenericContract<string> {\n"
      + "  run(value: string): string { return value }\n}\n",
    "ZConcrete.ets": 'import { AbstractTask } from "./ZContracts"\n'
      + "export class ConcreteTask extends AbstractTask { execute(): number { return 1 } }\n",
    "ZDerived.ets": 'import { ConcreteTask } from "./ZConcrete"\n'
      + "export class DerivedTask extends ConcreteTask { execute(): number { return 2 } }\n",
    "ZHomonym.ets": "export interface GenericContract<T> { run(value: T): T }\n"
      + "export class UnrelatedWorker implements GenericContract<number> {\n"
      + "  run(value: number): number { return value }\n}\n",
  }
  for (let index = 0; index < fillerCount; index++) {
    sources[`Filler${String(index).padStart(3, "0")}.ets`] = `export const filler${index} = ${index}\n`
  }
  if (manyImplementations) sources["ZMany.ets"] = 'import { GenericContract } from "./ZContracts"\n'
    + Array.from({ length: manyImplementations }, (_, index) =>
      `export class ExtraWorker${index} implements GenericContract<number> { run(value: number): number { return value } }\n`).join("")
  for (const [name, source] of Object.entries(sources)) fs.writeFileSync(path.join(workspace, name), source)
  return { directory, workspace, sdk, sources, manyImplementations,
    uri: name => pathToFileURL(path.join(workspace, name)).href }
}

export async function startSession(t, fixture, enabled, env = {}, roots) {
  fixture.runCount = (fixture.runCount ?? 0) + 1
  fixture.logs = path.join(fixture.directory, `logs-${fixture.runCount}`)
  const session = new LspSession({
    command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot, rootUri: pathToFileURL(fixture.workspace).href,
    capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: {
      ARKLINE_HARMONY_SDK_PATH: fixture.sdk, DEVECO_SDK_HOME: fixture.sdk,
      ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, `cache-${fixture.runCount}`),
      ARKTS_LSP_LOG_DIR: fixture.logs,
      ARKTS_REFERENCES_STRATEGY: "indexed-batched",
      ARKTS_REFERENCES_SDK_AMBIENT_PROFILE: "full",
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      ARKTS_REFERENCES_TRACE: "1",
      ARKTS_BENCHMARK_CONTROL: "1",
      ARKTS_L02_SAME_CONTENT_PROMOTION: enabled ? "1" : "0",
      ARKTS_L03_PRESSURE_WORKER_RECYCLE: "0",
      ARKTS_MEMORY_BUDGET_MB: "1024",
      ...env,
    },
  })
  t.after(() => session.close().catch(() => {}))
  let initialized
  if (roots) {
    initialized = await session.request("initialize", {
      processId: process.pid, rootUri: session.rootUri,
      workspaceFolders: roots.map((root, index) => ({ name: `root-${index}`, uri: pathToFileURL(root.workspace).href })),
      capabilities: session.capabilities, initializationOptions: { sdk: { path: fixture.sdk } },
    }, { timeoutMs: 10_000 })
    assert.equal(initialized.error, undefined, JSON.stringify(initialized.error))
    session.transport.send({ jsonrpc: "2.0", method: "initialized", params: {} })
    session.initialized = true
  } else initialized = await session.initialize({ timeoutMs: 10_000,
    initializationOptions: { sdk: { path: fixture.sdk } } })
  assert.equal(initialized.result.capabilities.implementationProvider, true)
  return session
}

export async function warmAndPromote(session, fixture) {
  const warm = fixture.sources["AWarm.ets"]
  session.openDocument({ uri: fixture.uri("AWarm.ets"), version: 1, text: warm })
  assert.deepEqual((await diagnostic(session, fixture.uri("AWarm.ets"), 1)).params.diagnostics, [])
  const response = await session.request("textDocument/implementation", {
    textDocument: { uri: fixture.uri("AWarm.ets") },
    position: positionAt(warm, warm.indexOf("WarmContract") + 1),
  }, { timeoutMs: 20_000 })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(response.result, [location(fixture, "AWarm.ets", warm,
    warm.indexOf("WarmImplementation"), "WarmImplementation")])
  session.openDocument({ uri: fixture.uri("ZContracts.ets"), version: 1,
    text: fixture.sources["ZContracts.ets"] })
  assert.deepEqual((await diagnostic(session, fixture.uri("ZContracts.ets"), 1)).params.diagnostics, [])
}

export async function assertGenericImplementations(session, fixture, { textSource = fixture.sources["ZText.ets"] } = {}) {
  const contracts = fixture.sources["ZContracts.ets"]
  const response = await session.request("textDocument/implementation", {
    textDocument: { uri: fixture.uri("ZContracts.ets") },
    position: positionAt(contracts, contracts.indexOf("GenericContract") + 1),
  }, { timeoutMs: 20_000 })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const number = fixture.sources["ZNumber.ets"]
  // The pinned compiler includes the imported name in a renamed import's
  // implementation chain. Preserve that authority instead of a class-only set.
  const expected = ["NumberWorker", "GenericContract"].map(symbol =>
    location(fixture, "ZNumber.ets", number, number.indexOf(symbol), symbol))
  if (textSource !== null) expected.push(location(fixture, "ZText.ets", textSource,
    textSource.indexOf("TextWorker"), "TextWorker"))
  for (let index = 0; index < fixture.manyImplementations; index++) {
    const symbol = `ExtraWorker${index}`
    const source = fixture.sources["ZMany.ets"]
    expected.push(location(fixture, "ZMany.ets", source, source.indexOf(`${symbol} implements`), symbol))
  }
  assert.deepEqual(response.result.map(JSON.stringify).sort(), expected.map(JSON.stringify).sort())
}

export function diagnostic(session, uri, version) {
  return session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === uri && message.params.version === version, 20_000)
}

export function positionAt(source, offset) {
  const prefix = source.slice(0, offset).split("\n")
  return { line: prefix.length - 1, character: prefix.at(-1).length }
}

export function location(fixture, name, source, offset, symbol) {
  return { uri: fixture.uri(name), range: {
    start: positionAt(source, offset), end: positionAt(source, offset + symbol.length),
  } }
}

export function readEvents(fixture) {
  return fs.readFileSync(path.join(fixture.logs, "server.log"), "utf8")
    .trim().split("\n").map(JSON.parse)
}

export async function waitForEvent(fixture, predicate, afterEntry = 0) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const event = readEvents(fixture).slice(afterEntry).find(predicate)
    if (event) return event
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.fail("timed out waiting for implementation lifecycle witness")
}
