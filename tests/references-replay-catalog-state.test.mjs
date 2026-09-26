import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const runner = path.join(projectRoot, "scripts", "bench", "replay-references.mjs")
const server = path.join(projectRoot, "tests", "fixtures", "lsp", "references-after-catalog-server.mjs")

test("immediate replay requests exact references before catalog completion", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-replay-immediate-test-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const sdk = path.join(root, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(sdk)
  fs.writeFileSync(path.join(workspace, "Query.ets"), "Thing\n")
  const oracle = path.join(root, "oracle.json")
  const output = path.join(root, "result.json")
  fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, locations: [{
    file: "Query.ets", range: {
      start: { line: 0, character: 0 }, end: { line: 0, character: 5 },
    },
  }] }))

  const args = [
    runner, "--workspace", workspace, "--sdk", sdk,
    "--file", "Query.ets", "--symbol", "Thing", "--line", "0", "--character", "1",
    "--oracle", oracle, "--out", output, "--server", server, "--sidecar", server,
    "--catalog-state", "immediate", "--timeout-ms", "1000",
    "--diagnostic-timeout-ms", "1000", "--idle-ms", "0",
  ]
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot, encoding: "utf8", timeout: 15_000,
  })

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(output, "utf8"))
  assert.equal(report.status, "PASS")
  assert.equal(report.catalogRequestState, "immediate")
  assert.equal(report.catalogState, "complete")
  assert.equal(report.catalog, "ready")
  assert.equal(report.responses[0].validation.pass, true)
  const phaseIndex = name => report.timeline.findIndex(event => event.phase === name)
  assert.ok(phaseIndex("references-request-start") >= 0)
  assert.ok(phaseIndex("references-request-start") < phaseIndex("catalog-complete"))
  assert.equal(report.diagnostic.version, 1)

  const readyOutput = path.join(root, "ready-first.json")
  const readyArgs = [...args]
  readyArgs[readyArgs.indexOf("--out") + 1] = readyOutput
  readyArgs[readyArgs.indexOf("--catalog-state") + 1] = "ready"
  const ready = spawnSync(process.execPath, readyArgs, {
    cwd: projectRoot, encoding: "utf8", timeout: 15_000,
  })
  assert.equal(ready.status, 1, `${ready.stderr}\n${ready.stdout}`)
  const readyReport = JSON.parse(fs.readFileSync(readyOutput, "utf8"))
  assert.equal(readyReport.status, "FAIL")
  assert.equal(readyReport.catalogRequestState, "ready")
  assert.ok(!readyReport.requestEvidence.requestedMethods.includes("textDocument/references"))

  const noEndOutput = path.join(root, "catalog-not-observed.json")
  const noEndArgs = [...args]
  noEndArgs[noEndArgs.indexOf("--out") + 1] = noEndOutput
  const noEnd = spawnSync(process.execPath, noEndArgs, {
    cwd: projectRoot,
    env: { ...process.env, ARKTS_TEST_CATALOG_NEVER_END: "1" },
    encoding: "utf8",
    timeout: 15_000,
  })
  assert.equal(noEnd.status, 0, `${noEnd.stderr}\n${noEnd.stdout}`)
  const noEndReport = JSON.parse(fs.readFileSync(noEndOutput, "utf8"))
  assert.equal(noEndReport.status, "PASS")
  assert.equal(noEndReport.catalogState, "not-observed")
  assert.equal(noEndReport.catalogError, null)
  assert.equal(noEndReport.responses[0].validation.pass, true)
})
