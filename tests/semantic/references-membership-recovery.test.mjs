import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

for (const failure of ["directory", "source"]) for (const strategy of ["legacy", "batched"]) {
  test(`references recover a failed membership scan in the same session (${strategy}/${failure})`, async t => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-membership-retry-"))
    const workspace = path.join(temporary, "workspace")
    const nested = path.join(workspace, "nested")
    const gate = path.join(temporary, "allow-enumeration")
    const audit = path.join(temporary, "enumeration-errors.txt")
    const preload = path.join(temporary, "enumeration-gate.cjs")
    fs.mkdirSync(nested, { recursive: true })
    const source = "export class RecoveryTarget {}\nexport const direct = new RecoveryTarget()\n"
    fs.writeFileSync(path.join(workspace, "Target.ets"), source)
    fs.writeFileSync(path.join(nested, "Use.ets"),
      'import { RecoveryTarget } from "../Target"\nexport const nestedUse = new RecoveryTarget()\n')
    fs.writeFileSync(preload, `const fs = require("node:fs"); const path = require("node:path");
const method = ${JSON.stringify(failure === "directory" ? "opendirSync" : "lstatSync")};
const open = fs[method];
fs[method] = function(directory, ...args) {
  if (path.resolve(directory) === ${JSON.stringify(failure === "directory" ? nested : path.join(nested, "Use.ets"))} && !fs.existsSync(${JSON.stringify(gate)})) {
    fs.appendFileSync(${JSON.stringify(audit)}, "blocked\\n");
    const error = new Error("controlled unavailable source directory"); error.code = "EACCES"; throw error;
  }
  return open.call(fs, directory, ...args);
};\n`)
    const session = new LspSession({
      command: process.execPath,
      args: ["--require", preload, path.join(projectRoot, "dist/server.cjs"), "--stdio"],
      rootUri: pathToFileURL(workspace).href,
      capabilities: { window: { workDoneProgress: true } },
      env: { ARKTS_INDEX_CACHE_DIR: path.join(temporary, "cache"),
        ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "target/release/arkts-index-sidecar"),
        ARKTS_LSP_LOG_DIR: path.join(temporary, "logs"),
        ARKLINE_HARMONY_SDK_PATH: path.join(temporary, "missing-sdk"),
        DEVECO_SDK_HOME: path.join(temporary, "missing-deveco"),
        ARKTS_REFERENCES_STRATEGY: strategy, ARKTS_REFERENCES_BATCH_ROOTS: "1",
        ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0" },
    })
    t.after(async () => {
      await session.close().catch(() => {})
      if (process.env.ARKTS_TEST_EVIDENCE_DIR) {
        const target = path.join(process.env.ARKTS_TEST_EVIDENCE_DIR, `membership-retry-${strategy}-${failure}`)
        fs.mkdirSync(target, { recursive: true })
        fs.cpSync(path.join(temporary, "logs"), path.join(target, "logs"), { recursive: true })
        fs.copyFileSync(audit, path.join(target, "enumeration-errors.txt"))
        await session.transport.writeFailureEvidence(target, { name: "session" })
      }
      fs.rmSync(temporary, { recursive: true, force: true })
    })
    await session.initialize({ timeoutMs: 10_000 })
    const progress = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
    session.transport.send({ jsonrpc: "2.0", id: progress.id, result: null })
    const prepared = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.phase === "complete", 10_000)
    assert.equal(prepared.params.report.semanticState, "degraded")
    assert.ok(prepared.params.report.unavailableReasons.includes("project-membership-incomplete"))
    await session.transport.progress(progress.params.token, message => message.params.value.kind === "end", 10_000)
    assert.ok(fs.readFileSync(audit, "utf8").includes("blocked"))
    const uri = pathToFileURL(path.join(workspace, "Target.ets")).href
    session.openDocument({ uri, version: 1, text: source })
    const params = { textDocument: { uri }, position: { line: 0, character: 15 },
      context: { includeDeclaration: true } }
    const blocked = await session.request("textDocument/references", params, { timeoutMs: 15_000 })
    assert.equal(blocked.error?.code, -32803, "unknown membership cannot publish a partial success")
    // No source/watch/config mutation and no language-service restart.
    fs.writeFileSync(gate, "the unavailable directory is accessible again")
    const recovered = await session.request("textDocument/references", params, { timeoutMs: 15_000 })
    assert.equal(recovered.error, undefined, JSON.stringify(recovered.error))
    assert.deepEqual(recovered.result.map(location => [path.basename(new URL(location.uri).pathname),
      location.range.start.line, location.range.start.character]).sort(),
    [["Target.ets", 0, 13], ["Target.ets", 1, 26], ["Use.ets", 0, 9], ["Use.ets", 1, 29]].sort())
    const events = fs.readFileSync(path.join(temporary, "logs/server.log"), "utf8")
      .split("\n").filter(Boolean).map(JSON.parse)
    assert.equal(events.filter(event => event.event === "semantic.worker.started").length, 1)
  })
}
