import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { runThisCompletionScenario } from "./support/conformance-scenario.mjs"
import { projectRoot } from "./support/lsp-process.mjs"

test("runs one production semantic scenario through either repository target", async (t) => {
  const externalCwd = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-scenario-cwd-"))
  const fixtureRoot = path.join(projectRoot, "fixtures", "basic")
  t.after(() => fs.rmSync(externalCwd, { recursive: true, force: true }))

  const targets = [
    {
      name: "repository bundle",
      command: process.execPath,
      args: ["dist/server.cjs", "--stdio"],
      cwd: projectRoot,
      env: { ARKTS_LSP_LOG_DIR: path.join(externalCwd, "bundle-logs") },
    },
    {
      name: "repository CLI from an external working directory",
      command: path.join(projectRoot, "bin", "arkts-language-server"),
      args: ["--stdio"],
      cwd: externalCwd,
      env: { ARKTS_LSP_LOG_DIR: path.join(externalCwd, "cli-logs") },
    },
  ]

  for (const target of targets) {
    await t.test(target.name, async () => {
      const result = await runThisCompletionScenario({
        ...target,
        rootUri: pathToFileURL(fixtureRoot).href,
      })

      assert.ok(result.labels.includes("title"), JSON.stringify(result.labels))
      assert.ok(result.labels.includes("save"), JSON.stringify(result.labels))
      assert.deepEqual(result.exit, { code: 0, signal: null })
    })
  }
})
