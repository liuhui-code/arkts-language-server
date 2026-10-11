import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { LspSession } from "./lsp-session.mjs"
import { projectRoot } from "./lsp-process.mjs"

export const selectedL03Policy = {
  ARKTS_REFERENCES_CONTEXT_RETENTION: "budget-aware",
  ARKTS_L03_COST_AWARE_EVICTION: "1",
  ARKTS_L01_PRESSURE_ADMISSION: "1",
  ARKTS_L01_TRANSIENT_DIAGNOSTICS: "1",
  ARKTS_L01_SEMANTIC_WORKER_RECYCLE: "0",
  ARKTS_L03_PRESSURE_WORKER_RECYCLE: "0",
  ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
}

export function createFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resident-interactive-"))
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
      + "export class WarmImplementation implements WarmContract { value = 1 }\n",
    "ZTarget.ets": "/* 😀 */ export class ValueTarget {\n  value: number = 1\n"
      + "  run(count: number, label: string): string { return label + count }\n}\n",
    "ZConsumer.ets": 'import { ValueTarget } from "./ZTarget"\n'
      + "export const selected = new ValueTarget()\n"
      + "export const typed: ValueTarget = selected\n"
      + 'export const displayed = selected.run(1, "label")\n'
      + "export const numberValue = selected.value\n",
    "ZHomonym.ets": "export class ValueTarget { value = false }\n",
    "ZAutoConsumer.ets": "/* 😀 */ export const selected = ValueTar\n",
    "ZSnippet.ets": 'import { ValueTarget } from "./ZTarget"\n'
      + "export class Stub extends ValueTarget {\n  ru\n}\n",
  }
  for (let index = 0; index < 270; index++) {
    sources[`Filler${String(index).padStart(3, "0")}.ets`] = `export const filler${index} = ${index}\n`
  }
  for (const [name, source] of Object.entries(sources)) fs.writeFileSync(path.join(workspace, name), source)
  return { directory, workspace, sdk, sources,
    uri: name => pathToFileURL(path.join(workspace, name)).href }
}

export async function startSession(t, fixture, enabled, env = {}, textDocumentCapabilities = {}) {
  fixture.runCount = (fixture.runCount ?? 0) + 1
  fixture.logs = path.join(fixture.directory, `logs-${fixture.runCount}`)
  const session = new LspSession({
    command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot, rootUri: pathToFileURL(fixture.workspace).href,
    capabilities: { textDocument: { publishDiagnostics: { versionSupport: true },
      hover: { contentFormat: ["markdown"] }, signatureHelp: { contextSupport: true },
      ...textDocumentCapabilities } },
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
  const initialized = await session.initialize({ timeoutMs: 10_000,
    initializationOptions: { sdk: { path: fixture.sdk } } })
  for (const capability of ["definitionProvider", "typeDefinitionProvider", "hoverProvider"]) {
    assert.equal(initialized.result.capabilities[capability], true)
  }
  assert.deepEqual(initialized.result.capabilities.signatureHelpProvider,
    { triggerCharacters: ["(", ",", "<"], retriggerCharacters: [")"] })
  return session
}

export async function warmAndPromote(session, fixture) {
  const warm = fixture.sources["AWarm.ets"]
  session.openDocument({ uri: fixture.uri("AWarm.ets"), version: 1, text: warm })
  const diagnostics = [(await diagnostic(session, fixture.uri("AWarm.ets"), 1)).params]
  assert.deepEqual(diagnostics[0].diagnostics, [])
  const response = await session.request("textDocument/implementation", {
    textDocument: { uri: fixture.uri("AWarm.ets") },
    position: positionAt(warm, warm.indexOf("WarmContract") + 1),
  }, { timeoutMs: 20_000 })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(response.result, [location(fixture, "AWarm.ets", warm,
    warm.indexOf("WarmImplementation"), "WarmImplementation")])
  session.openDocument({ uri: fixture.uri("ZConsumer.ets"), version: 1,
    text: fixture.sources["ZConsumer.ets"] })
  diagnostics.push((await diagnostic(session, fixture.uri("ZConsumer.ets"), 1)).params)
  assert.deepEqual(diagnostics[1].diagnostics, [])
  return diagnostics
}

export async function assertNavigation(session, fixture, {
  consumer = fixture.sources["ZConsumer.ets"], target = fixture.sources["ZTarget.ets"],
  valueType = "number", countType = "number",
} = {}) {
  const uri = fixture.uri("ZConsumer.ets")
  const valueOffset = consumer.lastIndexOf("value")
  const query = async (method, offset, extra = {}) => {
    const response = await session.request(`textDocument/${method}`, {
      textDocument: { uri }, position: positionAt(consumer, offset + 1), ...extra,
    }, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    return response.result
  }
  const definition = await query("definition", valueOffset)
  assert.deepEqual(definition, [location(fixture, "ZTarget.ets", target, target.indexOf("value"), "value")])
  const typeDefinition = await query("typeDefinition", consumer.lastIndexOf("selected"))
  assert.deepEqual(typeDefinition, [location(fixture, "ZTarget.ets", target,
    target.indexOf("ValueTarget"), "ValueTarget")])
  const hover = await query("hover", valueOffset)
  assert.deepEqual(hover, { contents: { kind: "markdown",
    value: `\`\`\`arkts\n(property) ValueTarget.value: ${valueType}\n\`\`\`` },
  range: location(fixture, "ZConsumer.ets", consumer, valueOffset, "value").range })
  const signature = await query("signatureHelp", consumer.indexOf(', "label"'), {
    context: { triggerKind: 2, triggerCharacter: ",", isRetrigger: false },
  })
  assert.deepEqual(signature, { signatures: [{
    label: `run(count: ${countType}, label: string): string`,
    parameters: [{ label: `count: ${countType}` }, { label: "label: string" }],
  }], activeSignature: 0, activeParameter: 1 })
  return { definition, typeDefinition, hover, signature }
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

export function canonicalCompletion(item) {
  assert.deepEqual(Object.keys(item.data ?? {}), ["arktsCompletionId"])
  assert.match(item.data.arktsCompletionId, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/)
  const { data: _opaqueSessionHandle, ...semanticPayload } = item
  return semanticPayload
}

export async function waitForEvent(fixture, predicate) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const event = readEvents(fixture).find(predicate)
    if (event) return event
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.fail("timed out waiting for interactive lifecycle witness")
}
