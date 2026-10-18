import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { LspSession } from "./lsp-session.mjs"
import { makeQueryLayerFixture } from "./query-layer-fixture.mjs"
import { positionAt } from "./resident-interactive-lsp.mjs"

export async function startFixture(t, source, enabled, controls = {}) {
  const file = controls.file ?? "Query.ets"
  const declaration = source.indexOf("value")
  const fixture = await makeQueryLayerFixture(t, {
    files: { ...controls.files, [file]: source },
    target: { kind: "definition", file, symbol: "value",
      position: positionAt(source, source.lastIndexOf("value")) },
    oracle: { schemaVersion: 1, locations: [{ file, range: {
      start: positionAt(source, declaration), end: positionAt(source, declaration + 5),
    } }] },
  })
  const uri = pathToFileURL(path.join(fixture.suite.workspace, file)).href
  if (controls.diskless) fs.unlinkSync(path.join(fixture.suite.workspace, file))
  if (controls.sdkDeclaration) {
    const api = path.join(fixture.suite.sdk, "ets", "api")
    fs.mkdirSync(api, { recursive: true })
    fs.writeFileSync(path.join(api, "@ohos.snapshot.d.ts"), controls.sdkDeclaration)
  }
  const session = new LspSession({ command: process.execPath,
    args: [...(controls.residentGc ? ["--expose-gc"] : []), fixture.suite.server, "--stdio"],
    rootUri: pathToFileURL(fixture.suite.workspace).href,
    capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
      ARKTS_LSP_LOG_DIR: path.join(fixture.directory, "logs"),
      ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"),
      ARKTS_VERSIONED_OVERLAY_SNAPSHOTS: enabled,
      ARKTS_BENCHMARK_CONTROL: controls.pressure ? "1" : undefined,
      ARKTS_REFERENCES_TRACE: controls.pressure ? "1" : undefined,
      ARKTS_MEMORY_METRICS_FILE: controls.residentGc ? path.join(fixture.directory, "resident-gc-metrics.jsonl") : undefined,
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/snapshot-change-observer.cjs"))}`
        + (controls.residentGc ? ` --require=${JSON.stringify(path.resolve("tests/fixtures/resident-worker-gc.cjs"))}` : "")
        + (controls.slowGcReceipt ? ` --require=${JSON.stringify(path.resolve("tests/fixtures/resident-gc-slow-publish.cjs"))}` : "") },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000,
    initializationOptions: { sdk: { path: fixture.suite.sdk } } })
  session.openDocument({ uri, version: 1, text: source })
  await diagnostic(session, uri, 1)
  await definition(session, uri, source)
  fs.writeFileSync(path.join(fixture.directory, "arm-snapshot-observation"), JSON.stringify(controls))
  return { fixture, session, uri }
}

export async function definition(session, uri, text) {
  const response = await session.request("textDocument/definition", {
    textDocument: { uri }, position: positionAt(text, text.lastIndexOf("value")),
  }, { timeoutMs: 10_000 })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const offset = text.indexOf("value")
  assert.deepEqual(response.result, [{ uri, range: {
    start: positionAt(text, offset), end: positionAt(text, offset + 5),
  } }])
}

export async function diagnostic(session, uri, version, expectedCodes = []) {
  const message = await session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === uri && message.params.version === version, 10_000)
  if (expectedCodes !== null) assert.deepEqual(message.params.diagnostics.map(item => item.code), expectedCodes)
  return message.params.diagnostics
}

export function readObservations(fixture) {
  const file = path.join(fixture.directory, "snapshot-change-observation.jsonl")
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").map(JSON.parse) : []
}
