import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual as equal } from "node:util"

import { TEST_LAYER_MANIFEST } from "../../tests/support/test-layer-manifest.mjs"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const sha = bytes => createHash("sha256").update(bytes).digest("hex")
const buildKeys = ["serverRevision", "serverInputSha256", "serverSha256", "sidecarSha256",
  "semanticWorkerSha256", "referenceVerifierWorkerSha256", "diagnosticVerifierWorkerSha256",
  "standardLibrarySha256", "backendVersion", "backendSha256", "nodeVersion",
  "lockfileSha256", "memoryGatesSha256", "sdkDeclarationDigest", "sdkMetadata"]
const sourceInput = file => /^(src\/|crates\/|config\/|scripts\/build-|package\.json$|pnpm-lock\.yaml$)/u.test(file)
const executionInput = file => /^(src\/|crates\/|config\/|scripts\/|tests\/|package\.json$|pnpm-lock\.yaml$)/u.test(file)

/** A passing receipt qualifies its own platform/build, never a missing platform. */
export function retainedRegressionEvidence(files, prepared, matrix) {
  const receipts = files.map(file => readReceipt(file, prepared, matrix))
  const attempts = new Set()
  for (const receipt of receipts) {
    const key = receipt.logSha256 && receipt.sourceArchiveSha256
      ? JSON.stringify([receipt.platform, receipt.logSha256, receipt.sourceArchiveSha256])
      : receipt.sha256
    if (attempts.has(key)) throw new Error("L08_DUPLICATE_REGRESSION_EVIDENCE")
    attempts.add(key)
  }
  const platforms = Object.fromEntries(matrix.platforms.map(platform => {
    const items = receipts.filter(item => item.platform === platform)
    const status = !items.length ? "NOT_RUN" : items.some(item => item.status === "FAIL") ? "FAIL"
      : items.every(item => item.status === "PASS") ? "PASS" : "BLOCKED"
    return [platform, { status, evidence: items.map(item => item.file) }]
  }))
  const values = Object.values(platforms).map(item => item.status)
  const status = values.includes("FAIL") ? "FAIL" : !receipts.length ? "NOT_RUN"
    : values.every(value => value === "PASS") ? "PASS" : "BLOCKED"
  return { status, platforms, receipts }
}

function readReceipt(file, prepared, matrix) {
  const bytes = fs.readFileSync(file)
  const state = JSON.parse(bytes)
  if (state.schema !== "arkts-language-server.retained-regression-state" || state.schemaVersion !== 1
    || !matrix.platforms.includes(state.platform) || !file.endsWith("-state.json")) {
    throw new Error("L08_REGRESSION_STATE_INVALID")
  }
  const result = { file, sha256: sha(bytes), platform: state.platform,
    status: "FAIL", reasons: [], actualExit: state.exit, counts: null }
  const reject = (reason, status = "FAIL") => ({ ...result, status, reasons: [reason] })
  if (state.phase !== "TERMINAL") return reject("REGRESSION_NOT_TERMINAL", "BLOCKED")
  const paths = state.platform === "win32" ? path.win32 : path.posix
  if (!Array.isArray(state.args) || state.args.length !== 2 || state.args[1] !== "check:fast"
    || !/^(?:pnpm|pnpm\.cjs|pnpm\.js)$/u.test(paths.basename(state.args[0]))
    || !/^(?:node|node\.exe)$/u.test(paths.basename(state.command ?? ""))) {
    return reject("REGRESSION_COMMAND_MISMATCH")
  }
  const layers = TEST_LAYER_MANIFEST.layers.filter(layer => layer.fast)
  const entries = [...new Set(layers.flatMap(layer => layer.entries))].sort()
  if (!equal(state.selectedLayers, layers.map(layer => layer.id)) || !equal(state.entries, entries)) {
    return reject("REGRESSION_SELECTION_MISMATCH")
  }
  if (state.inputsStable !== true || state.repoStable !== true || !equal(state.before, state.after)
    || !equal(state.beforeRepo, state.afterRepo)) return reject("REGRESSION_INPUT_DRIFT")
  if (buildKeys.some(key => state.before?.[key] === undefined)
    || buildKeys.filter(key => key.endsWith("Sha256") || key.endsWith("Digest"))
      .some(key => typeof state.before[key] !== "string" || !/^[a-f0-9]{64}$/u.test(state.before[key]))) {
    return reject("REGRESSION_BUILD_IDENTITY_INVALID")
  }
  const prefix = file.slice(0, -"-state.json".length)
  let log, archive
  try {
    log = fs.readFileSync(`${prefix}.stdout.log`)
    archive = fs.readFileSync(`${prefix}-sources.jsonl`)
  } catch { return reject("REGRESSION_ARTIFACT_MISSING") }
  result.logSha256 = sha(log)
  result.sourceArchiveSha256 = sha(archive)
  if (result.logSha256 !== state.logSha256 || result.sourceArchiveSha256 !== state.sourceArchiveSha256) {
    return reject("REGRESSION_ARTIFACT_DIGEST_MISMATCH")
  }
  const summary = [...log.toString().matchAll(
    /^ℹ tests (\d+)\nℹ suites (\d+)\nℹ pass (\d+)\nℹ fail (\d+)\nℹ cancelled (\d+)\nℹ skipped (\d+)\nℹ todo (\d+)\nℹ duration_ms ([0-9.]+)$/gm)].at(-1)
  if (!summary) return reject("REGRESSION_TERMINAL_SUMMARY_MISSING")
  const tail = log.toString().slice(summary.index + summary[0].length).trim()
  const failedSpecTail = Number.isInteger(state.exit?.code) && state.exit.code > 0
    && state.exit.signal === null && Number(summary[4]) > 0 && /^✖ failing tests:\n/u.test(tail)
  if (tail && !failedSpecTail) {
    return reject("REGRESSION_SUMMARY_NOT_TERMINAL")
  }
  const keys = ["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo", "duration_ms"]
  result.counts = Object.fromEntries(keys.map((key, index) => [key, Number(summary[index + 1])]))
  if (keys.slice(0, -1).some(key => !Number.isSafeInteger(result.counts[key]) || result.counts[key] < 0)
    || !Number.isFinite(result.counts.duration_ms) || result.counts.duration_ms < 0) {
    return reject("REGRESSION_COUNTS_INVALID")
  }
  if (!equal(result.counts, state.counts) || result.counts.tests < entries.length) {
    return reject("REGRESSION_COUNTS_MISMATCH")
  }
  const source = verifyArchive(archive, state, entries)
  if (source) return reject(source, source === "REGRESSION_SOURCE_STALE" ? "BLOCKED" : "FAIL")
  const inputs = prepared.filter(item => item.platform === state.platform)
  if (!inputs.length) return reject("REGRESSION_PRODUCT_BUILD_MISSING", "BLOCKED")
  if (buildKeys.some(key => state.before?.[key] === undefined
    || inputs.some(item => !equal(item.identity.pins[key], state.before[key])))) {
    return reject("REGRESSION_BUILD_MISMATCH", "BLOCKED")
  }
  if (state.exit?.code !== 0 || state.exit?.signal !== null
    || result.counts.pass !== result.counts.tests
    || ["fail", "cancelled", "skipped", "todo"].some(key => result.counts[key] !== 0)) {
    return reject("REGRESSION_EXECUTION_FAILED")
  }
  return { ...result, status: "PASS" }
}

function verifyArchive(bytes, state, entries) {
  try {
    const rows = bytes.toString().trim().split("\n").map(line => JSON.parse(line))
    const all = createHash("sha256"), production = createHash("sha256"), files = new Map()
    let previous = ""
    for (const row of rows) {
      if (typeof row.file !== "string" || row.file <= previous || path.isAbsolute(row.file)
        || row.file.includes("\\") || row.file.split("/").includes("..")
        || typeof row.base64 !== "string") return "REGRESSION_ARCHIVE_INVALID"
      previous = row.file
      const content = Buffer.from(row.base64, "base64")
      if (sha(content) !== row.sha256) return "REGRESSION_ARCHIVE_INVALID"
      files.set(row.file, content)
      all.update(row.file).update("\0").update(content).update("\0")
      if (sourceInput(row.file)) production.update(row.file).update("\0")
        .update(String(content.length)).update("\0").update(content)
      if (executionInput(row.file)
        && (!fs.existsSync(path.join(projectRoot, row.file))
          || !fs.readFileSync(path.join(projectRoot, row.file)).equals(content))) {
        return "REGRESSION_SOURCE_STALE"
      }
    }
    const currentFiles = [...new Set(execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"],
      { cwd: projectRoot, encoding: "utf8" }).split("\0").filter(executionInput))].sort()
    if (!equal(rows.map(row => row.file).filter(executionInput), currentFiles)) {
      return "REGRESSION_ARCHIVE_INCOMPLETE"
    }
    if (!equal({ files: rows.length, sha256: all.digest("hex") }, state.beforeRepo)
      || production.digest("hex") !== state.before?.serverInputSha256
      || !files.has("tests/support/test-layer-manifest.mjs")
      || entries.some(entry => !files.has(entry))) return "REGRESSION_ARCHIVE_INVALID"
    return null
  } catch { return "REGRESSION_ARCHIVE_INVALID" }
}
