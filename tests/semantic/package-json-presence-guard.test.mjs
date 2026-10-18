import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { LspSession } from "../support/lsp-session.mjs"
import { makeQueryLayerFixture } from "../support/query-layer-fixture.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

test("an unrelated package-parent directory change does not reject exact auto-import through a workspace alias",
  { timeout: 60_000 }, async t => {
    const source = "export const selected = WindowProbe\n"
    const target = "export class WindowProbeThing {}\n"
    const fixture = await makeQueryLayerFixture(t, { files: { "Query.ets": source, "Target.ets": target },
      target: { kind: "definition", file: "Target.ets", symbol: "WindowProbeThing", position: { line: 0, character: 14 } },
      oracle: { schemaVersion: 1, locations: [{ file: "Target.ets", range: {
        start: { line: 0, character: 13 }, end: { line: 0, character: 29 } } }] },
    })
    const alias = path.join(fixture.directory, "workspace-alias")
    fs.symlinkSync(fixture.suite.workspace, alias, "dir")
    const uri = pathToFileURL(path.join(alias, "Query.ets")).href
    const logs = path.join(fixture.directory, "logs")
    const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
      rootUri: pathToFileURL(alias).href,
      env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk, ARKTS_LSP_LOG_DIR: logs,
        ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"),
        NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/package-json-presence-window.cjs"))}` },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
    session.openDocument({ uri, version: 1, text: source })
    const response = await session.request("textDocument/completion", { textDocument: { uri },
      position: positionAt(source, source.indexOf("WindowProbe") + "WindowProbe".length) }, { timeoutMs: 10_000 })
    const marker = path.join(logs, "package-presence-window.json")
    assert.ok(fs.existsSync(marker), "consume a genuine negative package.json lookup before unrelated namespace mutation")
    const observation = JSON.parse(fs.readFileSync(marker, "utf8"))
    assert.equal(observation.pid, session.transport.child.pid)
    assert.ok(observation.threadId > 0 && observation.remainsAbsent === true)
    assert.equal(observation.genuineNativeError, "ENOENT")
    assert.equal(fs.existsSync(observation.target), false)
    assert.equal(fs.existsSync(observation.unrelatedDirectory), false)
    t.diagnostic(JSON.stringify({ qualification: "GENUINE_ABSENT_PACKAGE_LOOKUP_WITH_UNRELATED_OWNED_NAMESPACE_CHANGE", observation,
      responseError: response.error ?? null }))
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    assert.deepEqual(response.result.items.map(item => item.label), ["WindowProbeThing"])
    fs.writeFileSync(observation.target, JSON.stringify({ name: "actual-new-package" }), { flag: "wx" })
    const changed = await session.request("textDocument/completion", { textDocument: { uri },
      position: positionAt(source, source.indexOf("WindowProbe") + "WindowProbe".length) }, { timeoutMs: 10_000 })
    assert.equal(changed.error?.code, -32803, JSON.stringify(changed))
    assert.equal(changed.result, undefined, "a genuinely created package must revoke the earlier absence proof")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    const fresh = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
      rootUri: pathToFileURL(alias).href,
      env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk, ARKTS_LSP_LOG_DIR: path.join(fixture.directory, "fresh-logs"),
        ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "fresh-index") },
    })
    t.after(() => fresh.close().catch(() => {}))
    await fresh.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
    fresh.openDocument({ uri, version: 1, text: source })
    const recovered = await fresh.request("textDocument/completion", { textDocument: { uri },
      position: positionAt(source, source.indexOf("WindowProbe") + "WindowProbe".length) }, { timeoutMs: 10_000 })
    assert.equal(recovered.error, undefined, JSON.stringify(recovered.error))
    assert.deepEqual(recovered.result.items.map(item => item.label), ["WindowProbeThing"])
    t.diagnostic(JSON.stringify({ actualCreatedPackageRejected: changed.error.code, freshProcessLabelsExact: true }))
    assert.deepEqual((await fresh.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
