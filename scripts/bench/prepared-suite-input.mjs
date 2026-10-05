import { execFileSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { digestSdk } from "../semantic/lock-toolchain.mjs"
import { applyTextEdits } from "../../tests/support/lsp-edits.mjs"
import { loadOracle, validPosition } from "./reference-location-oracle.mjs"
import { gitValue, projectRoot, readSdkMetadata, sha256File, validateInputs } from "./reference-replay-input.mjs"

export const preparedBuckets = ["first-unseen-symbol", "first-unopened-module", "repeated-snapshot",
  "edit-body", "edit-reference", "edit-public-api", "after-eviction", "restart-after-validated-ready"]

export async function capturePreparedIdentity(options) {
  const assets = { ...options, file: options.file ?? gitFiles(options.workspace)[0],
    oracle: options.oracle ?? options.server, out: path.join(options.workspace, ".prepared-unused-output") }
  validateInputs(assets)
  return {
    repoSha: gitValue(options.workspace, ["rev-parse", "HEAD"]),
    workspaceStatus: gitValue(options.workspace, ["status", "--porcelain"]),
    workspaceFilesSha256: digestFiles(options.workspace, gitFiles(options.workspace)),
    serverRevision: gitValue(projectRoot, ["rev-parse", "HEAD"]),
    serverInputSha256: digestFiles(projectRoot, gitFiles(projectRoot).filter(file =>
      /^(src\/|crates\/|config\/|scripts\/build-|package\.json$|pnpm-lock\.yaml$)/u.test(file))),
    serverSha256: sha256File(options.server), sidecarSha256: sha256File(options.sidecar),
    semanticWorkerSha256: assets.semanticWorkerSha256,
    referenceVerifierWorkerSha256: assets.referenceVerifierWorkerSha256,
    standardLibrarySha256: assets.standardLibrarySha256,
    nodeVersion: process.version,
    backendVersion: JSON.parse(fs.readFileSync(path.join(projectRoot, "node_modules/typescript/package.json"))).version,
    backendSha256: sha256File(path.join(projectRoot, "node_modules/typescript/lib/typescript.js")),
    lockfileSha256: sha256File(path.join(projectRoot, "pnpm-lock.yaml")),
    memoryGatesSha256: sha256File(path.join(projectRoot, "config/memory-release-gates.json")),
    sdkMetadata: readSdkMetadata(options.sdk), sdkDeclarationDigest: await digestSdk(options.sdk),
  }
}

export async function readPreparedSuite(options) {
  const suite = JSON.parse(fs.readFileSync(options.preparedSuite, "utf8"))
  const invalid = reason => { throw new Error(`PREPARED_SUITE_INVALID=${reason}`) }
  if (!Array.isArray(suite.targets) || suite.targets.length === 0) invalid("EMPTY_TARGET_POOL")
  if (suite.schemaVersion !== 1 || typeof suite.benchmarkId !== "string" || !suite.benchmarkId
    || !Number.isSafeInteger(suite.seed) || !suite.pins
    || !/^[0-9a-f]{40}$/u.test(suite.pins.repoSha ?? "")) invalid("UNPINNED_INPUT")
  if (suite.readiness?.candidateControl !== true && suite.readiness?.candidateControl !== false) invalid("READINESS_MODE")
  if (Object.keys(suite.readiness).some(key => key !== "candidateControl")) invalid("UNTRUSTED_READINESS")
  for (const key of ["workspace", "sdk", "server", "sidecar"]) {
    if (typeof suite[key] !== "string" || !suite[key]) invalid("INPUT_PATH")
    suite[key] = path.resolve(suite[key])
  }
  if (fs.existsSync(options.out)) invalid("OUTPUT_EXISTS")
  const actualPins = await capturePreparedIdentity(suite)
  for (const [key, value] of Object.entries(actualPins)) {
    if (JSON.stringify(suite.pins[key]) !== JSON.stringify(value)) {
      throw new Error(`PREPARED_SUITE_BLOCKED=PIN_MISMATCH:${key}`)
    }
  }
  if (actualPins.workspaceStatus !== "") throw new Error("PREPARED_SUITE_BLOCKED=DIRTY_WORKSPACE")
  const ids = new Set()
  const identities = new Set()
  for (const target of suite.targets) {
    if (typeof target.id !== "string" || !target.id || ids.has(target.id)) invalid("DUPLICATE_TARGET")
    ids.add(target.id)
    if (!["references", "implementation", "definition", "typeDefinition"].includes(target.kind)) invalid("QUERY_KIND")
    if (typeof target.moduleId !== "string" || !target.moduleId || typeof target.symbol !== "string") invalid("TARGET_IDENTITY")
    const source = localSource(suite.workspace, target.file)
    const text = fs.readFileSync(source, "utf8")
    if (sha256File(source) !== target.sourceSha256) invalid("SOURCE_MISMATCH")
    if (!validPosition(target.position, text.split(/\r?\n/u))) invalid("UTF16_POSITION")
    const token = text.split(/\r?\n/u)[target.position.line]
    const before = token.slice(0, target.position.character).match(/[$\p{ID_Continue}]*$/u)?.[0] ?? ""
    const after = token.slice(target.position.character).match(/^[$\p{ID_Continue}]*/u)?.[0] ?? ""
    if (before + after !== target.symbol) invalid("SYMBOL_POSITION")
    if (target.kind === "references" && typeof target.includeDeclaration !== "boolean") invalid("DECLARATION_POLICY")
    const identity = JSON.stringify([target.file, target.symbol, target.position, target.kind, target.includeDeclaration])
    if (identities.has(identity)) invalid("DUPLICATE_TARGET")
    identities.add(identity)
    if (target.oracle?.verified !== true || typeof target.oracle.path !== "string"
      || !/^[0-9a-f]{64}$/u.test(target.oracle.sha256 ?? "")) invalid("ORACLE_PIN")
    target.oracle.path = path.resolve(target.oracle.path)
    if (sha256File(target.oracle.path) !== target.oracle.sha256) invalid("ORACLE_MISMATCH")
    target.expected = loadOracle(target.oracle.path, suite.workspace)
    if (hasDuplicateLocations(target.expected)) invalid("ORACLE_DUPLICATE")
  }
  if (!Array.isArray(suite.scenarios) || suite.scenarios.length === 0) invalid("EMPTY_SCENARIOS")
  const scenarioIds = new Set()
  const seen = new Set()
  const queriedSnapshots = new Map()
  const oracleSnapshots = new Map()
  const editedOracles = new Map()
  const editedTexts = new Map()
  let snapshot = 0
  for (const scenario of suite.scenarios) {
    if (typeof scenario.id !== "string" || !scenario.id || scenarioIds.has(scenario.id)) invalid("DUPLICATE_SCENARIO")
    scenarioIds.add(scenario.id)
    if (!preparedBuckets.includes(scenario.bucket) || !ids.has(scenario.targetId)) invalid("SCENARIO_TARGET")
    const target = suite.targets.find(item => item.id === scenario.targetId)
    const selection = JSON.stringify([target.kind, target.file, target.symbol, target.position])
    const queryIdentity = JSON.stringify([selection, target.includeDeclaration])
    if (Boolean(scenario.edit) !== scenario.bucket.startsWith("edit-")) invalid("EDIT_BUCKET_MISMATCH")
    if (scenario.edit) snapshot++
    else if (snapshot > 0 && oracleSnapshots.get(queryIdentity) !== snapshot) invalid("POST_EDIT_ORACLE_REQUIRED")
    if (scenario.bucket === "first-unseen-symbol" && seen.has(selection)) invalid("DUPLICATE_UNSEEN_TARGET")
    if (scenario.bucket === "repeated-snapshot" && queriedSnapshots.get(queryIdentity) !== snapshot) {
      invalid("REPEAT_WITHOUT_IDENTICAL_SNAPSHOT")
    }
    seen.add(selection)
    queriedSnapshots.set(queryIdentity, snapshot)
    if (scenario.bucket.startsWith("edit-")) {
      if (!Array.isArray(scenario.edit.changes) || !scenario.edit.changes.length
        || scenario.edit.sha256 !== digestJson(scenario.edit.changes)) invalid("EDIT_PIN")
      const source = localSource(suite.workspace, scenario.edit.file)
      if (scenario.edit.changes.some(change => typeof change.newText !== "string")) invalid("EDIT_PIN")
      editedTexts.set(source, applyTextEdits(editedTexts.get(source) ?? fs.readFileSync(source, "utf8"), scenario.edit.changes))
      if (!scenario.edit.oracle || scenario.edit.oracle.verified !== true) invalid("EDIT_ORACLE")
      scenario.edit.oracle.path = path.resolve(scenario.edit.oracle.path)
      if (sha256File(scenario.edit.oracle.path) !== scenario.edit.oracle.sha256) invalid("EDIT_ORACLE")
      const overlays = new Map([...editedTexts].map(([file, text]) => [pathToFileURL(file).href, text]))
      const nextOracle = loadOracle(scenario.edit.oracle.path, suite.workspace, overlays)
      if (hasDuplicateLocations(nextOracle)) invalid("EDIT_ORACLE_DUPLICATE")
      if (scenario.bucket === "edit-reference" && (target.kind !== "references"
        || sameOracleLocations(nextOracle, editedOracles.get(queryIdentity) ?? target.expected))) {
        invalid("EDIT_REFERENCE_NO_DELTA")
      }
      editedOracles.set(queryIdentity, nextOracle)
      oracleSnapshots.set(queryIdentity, snapshot)
    }
  }
  suite.runtime ??= {}
  for (const [name, fallback] of Object.entries({ timeoutMs: 180000, diagnosticTimeoutMs: 180000, sampleIntervalMs: 50 })) {
    suite.runtime[name] ??= fallback
    if (!Number.isSafeInteger(suite.runtime[name]) || suite.runtime[name] <= 0) invalid("RUNTIME_LIMIT")
  }
  suite.runtime.env ??= {}
  if (Object.entries(suite.runtime.env).some(([name, value]) => !name.startsWith("ARKTS_") || typeof value !== "string"
    || ["ARKTS_INDEX_CACHE_DIR", "ARKTS_LSP_LOG_DIR", "ARKTS_INDEX_SIDECAR_PATH"].includes(name))) invalid("RUNTIME_ENV")
  return { ...suite, poolDigest: digestJson(suite.targets.map(({ expected, ...target }) => target)),
    suiteDigest: sha256File(options.preparedSuite) }
}

export function digestJson(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

function locationKeys(oracle) {
  return oracle.locations.map(({ file, range: { start, end } }) =>
    JSON.stringify([file, start.line, start.character, end.line, end.character]))
}

function hasDuplicateLocations(oracle) {
  const keys = locationKeys(oracle)
  return new Set(keys).size !== keys.length
}

function sameOracleLocations(left, right) {
  return JSON.stringify(locationKeys(left)) === JSON.stringify(locationKeys(right))
}

function localSource(workspace, file) {
  if (typeof file !== "string" || !file || path.isAbsolute(file) || file.includes("\\")) {
    throw new Error("PREPARED_SUITE_INVALID=SOURCE_PATH")
  }
  const absolute = path.resolve(workspace, file)
  const relative = path.relative(fs.realpathSync(workspace), fs.realpathSync(absolute))
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("PREPARED_SUITE_INVALID=SOURCE_PATH")
  return absolute
}

function gitFiles(root) {
  return [...new Set(execFileSync("git", ["-C", root, "ls-files", "-co", "--exclude-standard", "-z"], { encoding: "utf8" })
    .split("\0").filter(Boolean))].sort()
}

function digestFiles(root, files) {
  const hash = crypto.createHash("sha256")
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(root, file))
    hash.update(file).update("\0").update(String(bytes.length)).update("\0").update(bytes)
  }
  return hash.digest("hex")
}
