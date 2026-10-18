#!/usr/bin/env node

import { spawn, execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual as equal } from "node:util"

import { capturePreparedIdentity } from "./prepared-suite-input.mjs"
import { TEST_LAYER_MANIFEST } from "../../tests/support/test-layer-manifest.mjs"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const sha = bytes => createHash("sha256").update(bytes).digest("hex")

try {
  const options = parseOptions(process.argv.slice(2))
  const suiteBytes = fs.readFileSync(options.suite)
  const suite = JSON.parse(suiteBytes)
  const before = await capturePreparedIdentity(suite)
  if (Object.entries(before).some(([key, value]) => !equal(suite.pins?.[key], value))) {
    throw new Error("REGRESSION_COLLECTOR_PIN_MISMATCH")
  }
  const paths = { state: `${options.out}-state.json`, log: `${options.out}.stdout.log`,
    archive: `${options.out}-sources.jsonl` }
  if (Object.values(paths).some(file => fs.existsSync(file))) throw new Error("REGRESSION_COLLECTOR_OUTPUT_EXISTS")
  fs.mkdirSync(path.dirname(options.out), { recursive: true })
  const layers = TEST_LAYER_MANIFEST.layers.filter(layer => layer.fast)
  const snapshot = repositorySnapshot(paths.archive)
  const state = { schema: "arkts-language-server.retained-regression-state", schemaVersion: 1,
    phase: "RUNNING", platform: process.platform, startedAt: new Date().toISOString(),
    command: process.execPath, args: [options.pnpm, "check:fast"],
    selectedLayers: layers.map(layer => layer.id),
    entries: [...new Set(layers.flatMap(layer => layer.entries))].sort(),
    before, beforeRepo: snapshot.repo, sourceArchiveSha256: snapshot.archiveSha256,
    suite: { path: options.suite, sha256: sha(suiteBytes) },
    pnpmScriptSha256: sha(fs.readFileSync(options.pnpm)), releaseEligible: false }
  fs.writeFileSync(paths.state, JSON.stringify(state, null, 2) + "\n", { flag: "wx" })
  const fd = fs.openSync(paths.log, "wx")
  const env = { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}` }
  const child = spawn(process.execPath, state.args, { cwd: projectRoot, stdio: ["ignore", fd, fd], env })
  child.once("error", error => {
    state.spawnError = { code: error.code ?? null, message: error.message }
  })
  state.childPid = child.pid
  fs.writeFileSync(paths.state, JSON.stringify(state, null, 2) + "\n")
  state.exit = await new Promise(resolve => child.once("close", (code, signal) => resolve({ code, signal })))
  fs.closeSync(fd)
  state.phase = "FINALIZING"
  fs.writeFileSync(paths.state, JSON.stringify(state, null, 2) + "\n")
  try { state.after = await capturePreparedIdentity(suite) }
  catch (error) {
    state.after = null
    state.afterCaptureError = error instanceof Error ? error.message : String(error)
  }
  try { state.afterRepo = repositorySnapshot().repo }
  catch (error) {
    state.afterRepo = null
    state.repoCaptureError = error instanceof Error ? error.message : String(error)
  }
  try { state.postflightPnpmScriptSha256 = sha(fs.readFileSync(options.pnpm)) }
  catch (error) {
    state.postflightPnpmScriptSha256 = null
    state.launcherCaptureError = error instanceof Error ? error.message : String(error)
  }
  state.inputsStable = state.after !== null && equal(state.before, state.after)
    && state.pnpmScriptSha256 === state.postflightPnpmScriptSha256
  state.repoStable = state.afterRepo !== null && equal(state.beforeRepo, state.afterRepo)
  let log = null
  try { log = fs.readFileSync(paths.log) }
  catch (error) { state.logCaptureError = error instanceof Error ? error.message : String(error) }
  state.logSha256 = log === null ? null : sha(log)
  state.counts = log === null ? null : rootCounts(log.toString(), state.exit)
  state.countsValid = state.counts !== null && state.counts.tests >= state.entries.length
  if (!state.countsValid) state.countParseError = "FINAL_ROOT_SPEC_SUMMARY_NOT_VERIFIED"
  state.phase = "TERMINAL"
  state.finishedAt = new Date().toISOString()
  state.status = state.exit.code === 0 && state.exit.signal === null && state.inputsStable
    && state.repoStable && state.countsValid && state.counts.pass === state.counts.tests
    && ["fail", "cancelled", "skipped", "todo"].every(key => state.counts[key] === 0) ? "PASS" : "FAIL"
  fs.writeFileSync(paths.state, JSON.stringify(state, null, 2) + "\n")
  process.stdout.write(`RETAINED_REGRESSION=${state.status}\nSTATE=${paths.state}\n`)
  process.exitCode = state.status === "PASS" ? 0 : Number.isInteger(state.exit.code) && state.exit.code > 0
    ? state.exit.code : 2
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}

function parseOptions(args) {
  const values = new Map()
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], value = args[index + 1]
    if (!["--prepared-suite", "--pnpm", "--out"].includes(flag) || !value
      || value.startsWith("--") || values.has(flag)) throw new Error("REGRESSION_COLLECTOR_OPTIONS_INVALID")
    values.set(flag, path.resolve(value))
  }
  if (values.size !== 3) throw new Error("REGRESSION_COLLECTOR_OPTIONS_REQUIRED")
  const pnpm = values.get("--pnpm")
  if (!/^(?:pnpm|pnpm\.cjs|pnpm\.js)$/u.test(path.basename(pnpm)) || !fs.statSync(pnpm).isFile()) {
    throw new Error("REGRESSION_COLLECTOR_PNPM_SCRIPT_REQUIRED")
  }
  return { suite: values.get("--prepared-suite"), pnpm, out: values.get("--out") }
}

function repositorySnapshot(archivePath) {
  const files = [...new Set(execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"],
    { cwd: projectRoot, encoding: "utf8" }).split("\0").filter(Boolean))].sort()
  const hash = createHash("sha256")
  const fd = archivePath ? fs.openSync(archivePath, "wx") : null
  try {
    for (const file of files) {
      const bytes = fs.readFileSync(path.join(projectRoot, file))
      hash.update(file).update("\0").update(bytes).update("\0")
      if (fd !== null) fs.writeSync(fd, JSON.stringify({ file, sha256: sha(bytes), base64: bytes.toString("base64") }) + "\n")
    }
  } finally { if (fd !== null) fs.closeSync(fd) }
  return { repo: { files: files.length, sha256: hash.digest("hex") },
    ...(archivePath ? { archiveSha256: sha(fs.readFileSync(archivePath)) } : {}) }
}

function rootCounts(log, exit) {
  const block = [...log.matchAll(
    /^ℹ tests (\d+)\nℹ suites (\d+)\nℹ pass (\d+)\nℹ fail (\d+)\nℹ cancelled (\d+)\nℹ skipped (\d+)\nℹ todo (\d+)\nℹ duration_ms ([0-9.]+)$/gm)].at(-1)
  if (!block) return null
  const tail = log.slice(block.index + block[0].length).trim()
  if (tail && !(exit.code !== 0 && tail.startsWith("✖ failing tests:"))) return null
  const keys = ["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo", "duration_ms"]
  const counts = Object.fromEntries(keys.map((key, index) => [key, Number(block[index + 1])]))
  return keys.slice(0, -1).every(key => Number.isSafeInteger(counts[key]) && counts[key] >= 0)
    && Number.isFinite(counts.duration_ms) && counts.duration_ms >= 0
    && counts.tests === counts.pass + counts.fail + counts.cancelled + counts.skipped + counts.todo ? counts : null
}
