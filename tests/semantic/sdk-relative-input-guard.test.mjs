import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { LspSession } from "../support/lsp-session.mjs"
import { makeQueryLayerFixture } from "../support/query-layer-fixture.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

test("SDK relative candidates keep genuine load observations and reject later creation before configuration recovery",
  { timeout: 60_000 }, async t => {
    for (const reuse of [undefined, "0"]) {
      const source = "export const value: number = 1\nexport const selected = value\n"
      const range = { start: { line: 0, character: 13 }, end: { line: 0, character: 18 } }
      const fixture = await makeQueryLayerFixture(t, { files: { "Query.ets": source },
        target: { kind: "definition", file: "Query.ets", symbol: "value",
          position: positionAt(source, source.lastIndexOf("value")) },
        oracle: { schemaVersion: 1, locations: [{ file: "Query.ets", range }] },
      })
      const api = path.join(fixture.suite.sdk, "ets", "api")
      fs.mkdirSync(api)
      fs.writeFileSync(path.join(api, "SharedBase.d.ts"), "export interface SharedType { value: string }\n")
      const references = []
      for (let index = 0; index < 20; index++) {
        const name = `@ohos.sdkCandidate${index}.d.ts`
        fs.writeFileSync(path.join(api, name), 'export { SharedType } from "./SharedBase"\n')
        references.push(`/// <reference path="../api/${name}" />`)
      }
      fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "component", "common.d.ts"), references.join("\n") + "\n")
      const uri = pathToFileURL(path.join(fixture.suite.workspace, "Query.ets")).href
      const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
        rootUri: pathToFileURL(fixture.suite.workspace).href,
        capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
        env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
          ARKTS_LSP_LOG_DIR: path.join(fixture.directory, "logs"),
          ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"),
          ARKTS_QUERY_MODULE_RESOLUTION_REUSE: reuse,
          NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/sdk-candidate-io.cjs"))}` },
      })
      t.after(() => session.close().catch(() => {}))
      await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
      session.openDocument({ uri, version: 1, text: source })
      const response = await session.request("textDocument/definition", { textDocument: { uri },
        position: positionAt(source, source.lastIndexOf("value")) }, { timeoutMs: 10_000 })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      assert.deepEqual(response.result, [{ uri, range }])
      const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri && message.params.version === 1, 10_000)
      assert.deepEqual(diagnostic.params.diagnostics, [])
      const output = path.join(fixture.directory, "sdk-candidate-io.jsonl")
      assert.ok(fs.existsSync(output), "observe real SDK candidate lstat attempts")
      const rows = fs.readFileSync(output, "utf8").trim().split("\n").map(JSON.parse)
      assert.ok(rows.length > 0)
      assert.ok(rows.every(row => row.pid === session.transport.child.pid && row.threadId > 0
        && row.path === path.join(api, "SharedBase.ets") && row.kind === "native-sdk-candidate-lstat-attempt"))
      t.diagnostic(JSON.stringify({ reuse: reuse ?? "default", imports: 20, nativeCandidateProbes: rows.length }))
      fs.writeFileSync(path.join(api, "SharedBase.ets"), "export interface SharedType { value: number }\n",
        { flag: "wx" })
      const changed = await session.request("textDocument/definition", { textDocument: { uri },
        position: positionAt(source, source.lastIndexOf("value")) }, { timeoutMs: 10_000 })
      assert.equal(changed.error?.code, -32803, JSON.stringify(changed))
      assert.equal(changed.result, undefined, "later SDK creation cannot reuse the earlier absence as current proof")
      const recoveredSdk = path.join(fixture.directory, "sdk-recovered")
      fs.cpSync(fixture.suite.sdk, recoveredSdk, { recursive: true })
      session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
        params: { settings: { arkts: { sdk: { path: recoveredSdk } } } } })
      session.changeDocument({ uri, version: 2, text: source })
      const recovered = await session.request("textDocument/definition", { textDocument: { uri },
        position: positionAt(source, source.lastIndexOf("value")) }, { timeoutMs: 10_000 })
      assert.equal(recovered.error, undefined, JSON.stringify(recovered.error))
      assert.deepEqual(recovered.result, [{ uri, range }])
      const latest = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri && message.params.version === 2, 10_000)
      assert.deepEqual(latest.params.diagnostics, [])
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })
