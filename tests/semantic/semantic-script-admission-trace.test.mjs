import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("script admission is observable per prepare only with semantic tracing enabled", async t => {
  const traced = await replay(t, true)
  const silent = await replay(t, false)

  assert.deepEqual(silent.definition, traced.definition,
    "observing admission must not change the exact definition")
  assert.deepEqual(silent.diagnostics, traced.diagnostics,
    "normal automatic diagnostics must remain enabled and exact")
  assert.deepEqual(silent.events.filter(entry => entry.event === "semantic.prepare.script-admission"), [],
    "the default path must not emit script-admission observations")

  const admissions = traced.events.filter(entry => entry.event === "semantic.prepare.script-admission")
  assert.ok(admissions.length >= 2, "each prepared open document must expose admission counters")
  assert.ok(admissions.some(entry => entry.newResidentScripts > 0),
    "at least one prepare must admit a new ScriptRecord")
  assert.ok(admissions.some(entry => entry.residentScriptsAfter >= 2),
    "preparing the second open file must account for both open scripts")
  for (const entry of admissions) {
    for (const field of ["residentScriptsBefore", "residentScriptsAfter", "newResidentScripts",
      "generationBefore", "generationAfter", "promotedFromLazy", "promotedWithMatchingFingerprint"]) {
      assert.ok(Number.isSafeInteger(entry[field]) && entry[field] >= 0,
        `${field} must be a nonnegative integer: ${JSON.stringify(entry)}`)
    }
    assert.ok(entry.generationAfter >= entry.generationBefore,
      "preparation must not move the compiler generation backwards")
    assert.ok(entry.promotedWithMatchingFingerprint <= entry.promotedFromLazy
      && entry.promotedFromLazy <= entry.newResidentScripts,
    "lazy promotion counters must be bounded by new ScriptRecords")
  }
})

async function replay(t, trace) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-script-admission-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const logs = path.join(root, "logs")
  fs.mkdirSync(workspace)
  const sources = {
    "Target.ets": "export class TargetThing {}\n",
    "Extra.ets": "export const EXTRA = 1\n",
    "Use.ets": 'import { TargetThing } from "./Target"\n'
      + 'import { EXTRA } from "./Extra"\n'
      + "export const selected = new TargetThing()\nexport const value = EXTRA\n",
  }
  for (const [name, source] of Object.entries(sources)) {
    fs.writeFileSync(path.join(workspace, name), source)
  }
  const uri = name => pathToFileURL(path.join(workspace, name)).href
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_LSP_LOG_DIR: logs,
      ARKTS_REFERENCES_TRACE: trace ? "1" : "0",
      ARKTS_REFERENCES_STRATEGY: "legacy",
    },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })

  const diagnostics = []
  for (const name of ["Target.ets", "Use.ets"]) {
    const publication = session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri(name) && message.params.version === 1, 20_000)
    session.openDocument({ uri: uri(name), version: 1, text: sources[name] })
    const message = await publication
    diagnostics.push({ uri: message.params.uri, version: message.params.version,
      values: message.params.diagnostics })
    if (name === "Target.ets") {
      const response = await session.request("textDocument/references", {
        textDocument: { uri: uri(name) },
        position: positionAt(sources[name], sources[name].indexOf("TargetThing") + 1),
        context: { includeDeclaration: true },
      }, { timeoutMs: 20_000 })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      assert.ok(response.result.length >= 2, "global references must scan unopened usage files")
    }
  }

  const source = sources["Use.ets"]
  const response = await session.request("textDocument/definition", {
    textDocument: { uri: uri("Use.ets") },
    position: positionAt(source, source.lastIndexOf("TargetThing") + 1),
  }, { timeoutMs: 20_000 })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const definition = [{ uri: uri("Target.ets"),
    range: rangeAt(sources["Target.ets"], sources["Target.ets"].indexOf("TargetThing"), "TargetThing") }]
  assert.deepEqual(response.result, definition)
  const closed = await session.close({ timeoutMs: 5_000 })
  assert.deepEqual(closed.exit, { code: 0, signal: null })

  const file = path.join(logs, "server.log")
  const events = fs.existsSync(file)
    ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse) : []
  return { definition: response.result.map(location => ({ ...location,
    uri: path.basename(new URL(location.uri).pathname) })),
  diagnostics: diagnostics.map(({ version, values }) => ({ version, values })), events }
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  return { line: prefix.split("\n").length - 1,
    character: offset - prefix.lastIndexOf("\n") - 1 }
}

function rangeAt(source, offset, name) {
  return { start: positionAt(source, offset), end: positionAt(source, offset + name.length) }
}
