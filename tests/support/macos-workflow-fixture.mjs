import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { digestSdk } from "../../scripts/semantic/lock-toolchain.mjs"
import { projectRoot } from "./lsp-process.mjs"

/** Private deterministic inputs; every workflow uses the real CLI/compiler/stdio. */
export async function macosWorkflow(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-product-sdk-identity-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const sdk = path.join(root, "selected-sdk")
  const output = path.join(root, "report.json")
  const generated = spawnSync(process.execPath, [
    path.join(projectRoot, "scripts/bench/generate-large-fixture.mjs"),
    "--out", workspace, "--workspace-files", "24", "--active-dependency-files", "20", "--seed", "20261014",
  ], { cwd: projectRoot, encoding: "utf8" })
  assert.equal(generated.status, 0, generated.stderr)
  fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"),
    "interface SelectedSdkAmbient { value: number }\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
    JSON.stringify({ path: "ets", apiVersion: "24", version: "selected-sdk-test" }))
  const expectedDigest = await digestSdk(sdk)
  const sidecar = options.sidecarUnavailable ? path.join(root, "nonexecutable-sidecar")
    : path.join(projectRoot, "target", "release", "arkts-index-sidecar")
  if (options.sidecarUnavailable) fs.writeFileSync(sidecar, "private nonexecutable sidecar boundary\n", { mode: 0o600 })
  let oracle, oraclePath
  const extraArgs = []
  if (options.startAt) extraArgs.push("--start-at", options.startAt)
  if (options.oracle) {
    const file = "entry/src/main/ets/Main.ets"
    const lines = fs.readFileSync(path.join(workspace, file), "utf8").split("\n")
    const location = line => {
      const character = lines[line].indexOf("stableMember")
      return { file, range: { start: { line, character },
        end: { line, character: character + "stableMember".length } } }
    }
    const declaration = location(lines.findIndex(line => line.includes("stableMember:")))
    const usage = location(lines.findIndex(line => line.includes("return this.stableMember")))
    oracle = { schemaVersion: 1, verified: true,
      inputIdentity: { sdkDeclarationDigest: expectedDigest, workspaceFilesSha256: treeDigest(workspace) },
      query: { file, symbol: "stableMember", position: usage.range.start, includeDeclaration: true },
      definition: { locations: [declaration] }, references: { locations: [declaration, usage] } }
    if (options.completionOracle) {
      const dotted = lines.join("\n").replace("return this.stableMember", "return this.")
      // Declaration order, native property/method metadata and the unprefixed member tier.
      // Independently observed through the locked public compiler API and production Host.
      const result = { isIncomplete: false, items: [
        { label: "stableMember", detail: "TypeScript property", kind: 5, insertText: "stableMember", sortText: "11" },
        { label: "build", detail: "TypeScript method", kind: 2, insertText: "build", sortText: "11" },
      ] }
      oracle.completion = { snapshots: [
        [1, dotted], [3, dotted.replace("// benchmark-edit", "// benchmark-edit changed")], [4, dotted],
      ].map(([documentVersion, source]) => ({
        query: { file, documentVersion, position: usage.range.start, context: { triggerKind: 1 } },
        sourceSha256: createHash("sha256").update(source).digest("hex"), result,
      })) }
    }
    oraclePath = path.join(root, "workflow-oracle.json")
    options.mutate?.({ oracle, sdk, workspace })
    fs.writeFileSync(oraclePath, JSON.stringify(oracle))
    extraArgs.push("--oracle", oraclePath)
  }
  const result = spawnSync(process.execPath, [path.join(projectRoot, "scripts/bench/run-macos-e2e.mjs"),
    "--workspace", workspace, "--sdk", sdk,
    "--sidecar", sidecar,
    "--out", output, ...extraArgs,
  ], { cwd: projectRoot, encoding: "utf8", ...(options.drift ? { env: { ...process.env,
    NODE_OPTIONS: `--require=${path.join(projectRoot, "tests/fixtures/macos-oracle-input-drift.cjs")}`,
    ARKTS_TEST_WORKFLOW_ORACLE_DRIFT_FILE: path.join(workspace, "unrelated/000/Unused000000.ets"),
  } } : {}), ...(options.nonzeroExit ? { env: { ...process.env,
    NODE_OPTIONS: `--require=${path.join(projectRoot, "tests/fixtures/macos-workflow-nonzero-exit.cjs")}`,
    ARKTS_TEST_WORKFLOW_NONZERO_EXIT: "17",
  } } : {}), ...(options.controlOff ? { env: { ...process.env,
    NODE_OPTIONS: `--require=${path.join(projectRoot, "tests/fixtures/macos-workflow-control-off.cjs")}`,
    ARKTS_TEST_WORKFLOW_CONTROL_OFF: "1",
  } } : {}), ...(options.metricsMissing || options.metricsMalformed || options.metricsSchema ? { env: { ...process.env,
    NODE_OPTIONS: `--require=${path.join(projectRoot, "tests/fixtures/macos-workflow-missing-metrics.cjs")}`,
    ARKTS_TEST_WORKFLOW_METRICS_BACKUP_FILE: path.join(root, "faulted-metrics.jsonl"),
    ARKTS_TEST_WORKFLOW_CORRUPT_METRICS: options.metricsMalformed ? "1" : "0",
    ARKTS_TEST_WORKFLOW_METRICS_SCHEMA_FAULT: options.metricsSchema ?? "",
  } } : {}), ...(options.interruptedRequest || options.interruptedInitialize ? { env: { ...process.env,
    NODE_OPTIONS: `--require=${path.join(projectRoot, "tests/fixtures/macos-workflow-interrupted-request.cjs")}`,
    ARKTS_TEST_WORKFLOW_INTERRUPTED_REQUEST_FILE: path.join(root, "interrupted-request.json"),
    ARKTS_TEST_WORKFLOW_INTERRUPTED_METHOD: options.interruptedInitialize ? "initialize" : "textDocument/completion",
  } } : {}), ...(options.samplerFault ? { env: { ...process.env,
    NODE_OPTIONS: `--require=${path.join(projectRoot, "tests/fixtures/macos-workflow-sampler-fault.cjs")}`,
    ARKTS_TEST_WORKFLOW_SAMPLER_FAULT_FILE: path.join(root, "sampler-fault.json"),
  } } : {}), ...(options.requestTimeout ? { env: { ...process.env,
    NODE_OPTIONS: `--require=${path.join(projectRoot, "tests/fixtures/macos-workflow-request-timeout.cjs")}`,
    ARKTS_TEST_WORKFLOW_TIMED_REQUEST_FILE: path.join(root, "timed-request.json"),
  } } : {}) })
  if (process.platform !== "darwin") {
    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stderr, /requires macOS/u)
    assert.equal(fs.existsSync(output), false)
    return { report: null, expectedDigest }
  }
  if (result.status !== (options.expectedStatus ?? 0)) {
    t.diagnostic(JSON.stringify({ event: "macos.workflow.unexpected-exit", exitCode: result.status,
      signal: result.signal, reportText: fs.existsSync(output) ? fs.readFileSync(output, "utf8") : null }))
  }
  assert.equal(result.status, options.expectedStatus ?? 0, `${result.stderr}\n${result.stdout}`)
  const report = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, "utf8")) : null
  if (result.status === 0) assert.match(result.stdout,
    report.measurementStatus === "partial" ? /MACOS_E2E=PARTIAL/u : /MACOS_E2E=PASS/u)
  return { report,
    result, expectedDigest, workspace, sdk, oracle, oraclePath }
}

export function treeDigest(root) {
  const hash = createHash("sha256")
  for (const relativePath of fs.readdirSync(root, { recursive: true }).sort()) {
    const absolutePath = path.join(root, relativePath)
    if (!fs.statSync(absolutePath).isFile()) continue
    hash.update(relativePath)
    hash.update("\0")
    hash.update(fs.readFileSync(absolutePath))
    hash.update("\0")
  }
  return hash.digest("hex")
}
