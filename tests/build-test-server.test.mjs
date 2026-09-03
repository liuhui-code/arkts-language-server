import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { projectRoot } from "./support/lsp-process.mjs"

const helperUrl = pathToFileURL(path.join(
  projectRoot,
  "tests",
  "support",
  "build-test-server.mjs",
)).href

test("isolates one reusable scripted server build per test process", async () => {
  const [left, right] = await Promise.all([
    runBuildProcess(),
    runBuildProcess(),
  ])

  for (const result of [left, right]) {
    assert.deepEqual(result.exit, { code: 0, signal: null }, result.stderr)
    assert.equal(typeof result.report.firstPath, "string")
    assert.equal(result.report.secondPath, result.report.firstPath)
    assert.equal(result.report.existedBeforeExit, true)
    assert.equal(result.report.nodeCheckExitCode, 0)
    assert.equal(result.report.mtimePreserved, true, "a repeated call rebuilt the artifact")
    assert.equal(isWithin(path.join(projectRoot, "dist"), result.report.firstPath), false)
  }

  assert.notEqual(left.report.firstPath, right.report.firstPath)
  assert.equal(fs.existsSync(path.dirname(left.report.firstPath)), false)
  assert.equal(fs.existsSync(path.dirname(right.report.firstPath)), false)
})

test("does not let temporary cleanup failure change a successful process exit", async (t) => {
  const result = await runNodeProcess(`
    import fs from "node:fs";
    import { buildScriptedSemanticServer } from ${JSON.stringify(helperUrl)};

    const serverPath = buildScriptedSemanticServer();
    fs.rmSync = () => { throw new Error("fixture cleanup denied"); };
    process.stdout.write(JSON.stringify({
      serverPath,
      existedBeforeExit: fs.existsSync(serverPath),
    }));
  `)
  const outputDirectory = path.dirname(result.report.serverPath ?? "")
  if (isWithin(os.tmpdir(), outputDirectory)
    && path.basename(outputDirectory).startsWith("arkts-scripted-server-")) {
    t.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }))
  }

  assert.deepEqual(result.exit, { code: 0, signal: null }, result.stderr)
  assert.equal(result.report.existedBeforeExit, true)
})

function runBuildProcess() {
  const source = `
    import fs from "node:fs";
    import { spawnSync } from "node:child_process";
    import { buildScriptedSemanticServer } from ${JSON.stringify(helperUrl)};

    const firstPath = buildScriptedSemanticServer();
    let sentinelMtime;
    if (typeof firstPath === "string" && fs.existsSync(firstPath)) {
      const sentinel = new Date("2000-01-01T00:00:00.000Z");
      fs.utimesSync(firstPath, sentinel, sentinel);
      sentinelMtime = fs.statSync(firstPath).mtimeMs;
    }
    const secondPath = buildScriptedSemanticServer();
    const existedBeforeExit = typeof firstPath === "string" && fs.existsSync(firstPath);
    const mtimePreserved = existedBeforeExit
      && fs.statSync(firstPath).mtimeMs === sentinelMtime;
    const nodeCheckExitCode = existedBeforeExit
      ? spawnSync(process.execPath, ["--check", firstPath]).status
      : null;

    process.stdout.write(JSON.stringify({
      firstPath,
      secondPath,
      existedBeforeExit,
      mtimePreserved,
      nodeCheckExitCode,
    }));
  `

  return runNodeProcess(source)
}

function runNodeProcess(source) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "--eval", source], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.once("error", reject)
    child.once("close", (code, signal) => {
      let report = {}
      try {
        report = JSON.parse(stdout)
      } catch {}
      resolve({ exit: { code, signal }, report, stderr })
    })
  })
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}
