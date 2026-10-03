import { execFileSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"

import { digestSdk } from "../semantic/lock-toolchain.mjs"
import {
  gitValue, projectRoot, readSdkMetadata, sha256File,
  validateBenchmarkManifest, validateInputs,
} from "./reference-replay-input.mjs"

export const expectedSha = "ecc550dfaed880e04e38a2477eb7235cd50475b9"
export const consumerFile = "product/phone/src/main/ets/Setting/Home/controller/HomePageMenuManager.ets"
export const declarationFile = "common/src/main/ets/sendable/HomeInitData.ets"
export const position = Object.freeze({ line: 40, character: 37 })
export const symbol = "HomeInitData"
const defaultOracle = path.join(projectRoot,
  "bench/references/oracles/settings-homeinitdata-api24-no-declaration.json")
const defaultManifest = path.join(projectRoot,
  "bench/references/manifests/settings-homeinitdata-mixed-ops-api24.json")
export const secondaryFile = "common/index.ets"
export const secondaryPosition = Object.freeze({ line: 284, character: 23 })

export function parseOptions(args) {
  if (args.length === 1 && args[0] === "--help") return { help: true }
  const values = new Map(), flags = new Set()
  const required = ["--workspace", "--sdk", "--out", "--session-reuse", "--operations"]
  const optional = ["--seed", "--manifest", "--oracle", "--server", "--sidecar", "--sample-interval-ms"]
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]
    if (name === "--trace" || name === "--index-rejection-snapshot"
      || name === "--post-idle-reference") {
      if (flags.has(name)) throw new Error(`${name} may appear only once`)
      flags.add(name)
      continue
    }
    if (![...required, ...optional].includes(name)) throw new Error(`unknown argument: ${name}`)
    if (values.has(name)) throw new Error(`${name} may appear only once`)
    const value = args[++index]
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`)
    values.set(name, value)
  }
  for (const name of required) if (!values.has(name)) throw new Error(`${name} is required`)
  const sessionReuse = values.get("--session-reuse")
  if (sessionReuse !== "off" && sessionReuse !== "experimental") {
    throw new Error("--session-reuse must be off or experimental")
  }
  const operations = Number(values.get("--operations"))
  if (!Number.isSafeInteger(operations) || operations < 100) {
    throw new Error("--operations must be at least 100")
  }
  const seed = Number(values.get("--seed") ?? "20260930")
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > 0xffffffff) {
    throw new Error("--seed must be a nonzero unsigned 32-bit integer")
  }
  const sampleIntervalMs = Number(values.get("--sample-interval-ms") ?? "50")
  if (!Number.isSafeInteger(sampleIntervalMs) || sampleIntervalMs < 1) {
    throw new Error("--sample-interval-ms must be a positive integer")
  }
  return {
    workspace: path.resolve(values.get("--workspace")),
    sdk: path.resolve(values.get("--sdk")),
    out: path.resolve(values.get("--out")),
    sessionReuse, operations, seed, sampleIntervalMs,
    trace: flags.has("--trace") || flags.has("--post-idle-reference"),
    postIdleReference: flags.has("--post-idle-reference"),
    indexRejectionSnapshot: flags.has("--index-rejection-snapshot"),
    manifest: path.resolve(values.get("--manifest") ?? defaultManifest),
    oracle: path.resolve(values.get("--oracle") ?? defaultOracle),
    server: path.resolve(values.get("--server") ?? path.join(projectRoot, "dist/server.cjs")),
    sidecar: path.resolve(values.get("--sidecar")
      ?? path.join(projectRoot, "target/release/arkts-index-sidecar")),
    file: consumerFile, symbol, position, includeDeclaration: false,
  }
}

export function guardOutputScope(options) {
  if (fs.existsSync(options.out)) throw new Error(`output already exists: ${options.out}`)
  if (!fs.statSync(options.workspace).isDirectory()) throw new Error("workspace must be a directory")
  const originalRoot = fs.realpathSync(options.workspace)
  const destination = canonicalDestination(options.out)
  if (inside(destination, originalRoot)) throw new Error("BENCHMARK_BLOCKED=OUTPUT_INSIDE_SOURCE")
  if (fs.existsSync(options.sdk) && inside(destination, fs.realpathSync(options.sdk))) {
    throw new Error("BENCHMARK_BLOCKED=OUTPUT_INSIDE_SDK")
  }
  return originalRoot
}

export async function prepareInput(options, originalRoot) {
  const topLevel = gitValue(originalRoot, ["rev-parse", "--show-toplevel"])
  if (!topLevel || fs.realpathSync(topLevel) !== originalRoot) {
    throw new Error("BENCHMARK_BLOCKED=WORKSPACE_NOT_REPOSITORY_ROOT")
  }
  const originalHead = gitValue(originalRoot, ["rev-parse", "HEAD"])
  const originalStatus = gitValue(originalRoot, ["status", "--porcelain", "--untracked-files=all"])
  if (originalStatus === null) throw new Error("BENCHMARK_BLOCKED=SOURCE_STATUS_UNAVAILABLE")
  if (originalStatus !== "") throw new Error("BENCHMARK_BLOCKED=DIRTY_WORKSPACE")
  validateInputs(options)
  if (originalHead !== expectedSha) throw new Error("BENCHMARK_BLOCKED=REPO_REVISION_MISMATCH")
  const sdkMetadata = readSdkMetadata(options.sdk)
  if (String(sdkMetadata?.apiVersion) !== "24" || sdkMetadata?.version !== "6.1.1.125") {
    throw new Error("BENCHMARK_BLOCKED=SDK_MISMATCH")
  }
  await validateBenchmarkManifest(options)
  const beforeSourceHash = sha256File(path.join(originalRoot, declarationFile))
  const beforeConsumerHash = sha256File(path.join(originalRoot, consumerFile))
  if (options.benchmarkManifest?.query.sourceSha256 !== beforeConsumerHash
    || options.benchmarkManifest?.watchedEdit.sourceSha256 !== beforeSourceHash) {
    throw new Error("BENCHMARK_BLOCKED=PINNED_SOURCE_MISMATCH")
  }
  const secondaryHash = sha256File(path.join(originalRoot, secondaryFile))
  const secondary = options.benchmarkManifest?.secondaryQuery
  const scheduleContract = options.benchmarkManifest?.schedule
  const primaryDiagnostic = [{
    range: { start: { line: 60, character: 70 }, end: { line: 60, character: 85 } },
    severity: 1, code: 2339, source: "arkts",
    message: "Property 'isMainOsAccount' does not exist on type 'AccountManager'.",
  }]
  if (!isDeepStrictEqual(options.benchmarkManifest?.query.expectedDiagnostics, primaryDiagnostic)) {
    throw new Error("BENCHMARK_BLOCKED=PRIMARY_DIAGNOSTIC_ORACLE_MISMATCH")
  }
  if (secondary?.file !== secondaryFile || secondary?.symbol !== symbol
    || secondary?.line !== secondaryPosition.line
    || secondary?.character !== secondaryPosition.character
    || secondary?.sourceSha256 !== secondaryHash
    || secondary?.expectedDefinitionBefore?.line !== 16
    || secondary?.expectedDefinitionBefore?.character !== 13
    || secondary?.expectedDefinitionAfter?.line !== 17
    || secondary?.expectedDefinitionAfter?.character !== 13
    || !isDeepStrictEqual(secondary?.expectedDiagnostics, [])) {
    throw new Error("BENCHMARK_BLOCKED=SECONDARY_QUERY_MISMATCH")
  }
  if (scheduleContract?.seed !== options.seed || scheduleContract?.minimumOperations !== 100
    || scheduleContract?.referenceEvery !== 10 || scheduleContract?.referenceOffset !== 1
    || scheduleContract?.finalReference !== true
    || scheduleContract?.moduleSwitchEvery !== 10 || scheduleContract?.moduleSwitchOffset !== 1
    || scheduleContract?.finalModuleSwitch !== true
    || !isDeepStrictEqual(scheduleContract?.pressureAfterOperations, [50])) {
    throw new Error("BENCHMARK_BLOCKED=SCHEDULE_MISMATCH")
  }
  const sdkDigest = options.sdkDeclarationDigest ?? await digestSdk(options.sdk)
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-settings-mixed-"))
  try {
    const clone = path.join(temporary, "settings")
    execFileSync("git", ["clone", "--local", "--no-hardlinks", "--quiet", "--no-checkout",
      originalRoot, clone], { stdio: "pipe" })
    execFileSync("git", ["-C", clone, "checkout", "--detach", "--quiet", expectedSha],
      { stdio: "pipe" })
    const cloneStatus = gitValue(clone, ["status", "--porcelain", "--untracked-files=all"])
    if (cloneStatus === null) throw new Error("BENCHMARK_BLOCKED=CLONE_STATUS_UNAVAILABLE")
    if (gitValue(clone, ["rev-parse", "HEAD"]) !== originalHead || cloneStatus !== "") {
      throw new Error("BENCHMARK_BLOCKED=CLONE_IDENTITY_MISMATCH")
    }
    if (sha256File(path.join(clone, declarationFile)) !== beforeSourceHash
      || sha256File(path.join(clone, consumerFile)) !== beforeConsumerHash) {
      throw new Error("BENCHMARK_BLOCKED=CLONE_SOURCE_MISMATCH")
    }
    if (sha256File(path.join(clone, secondaryFile)) !== secondaryHash) {
      throw new Error("BENCHMARK_BLOCKED=CLONE_SECONDARY_SOURCE_MISMATCH")
    }
    return { clone, temporary, originalRoot, originalHead, sdkMetadata, sdkDigest,
      beforeSourceHash, beforeConsumerHash, secondaryHash }
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true })
    throw error
  }
}

export function sourcePreserved(input) {
  const status = gitValue(input.originalRoot, ["status", "--porcelain", "--untracked-files=all"])
  return status !== null && status === ""
    && gitValue(input.originalRoot, ["rev-parse", "HEAD"]) === input.originalHead
    && sha256File(path.join(input.originalRoot, declarationFile)) === input.beforeSourceHash
    && sha256File(path.join(input.originalRoot, consumerFile)) === input.beforeConsumerHash
    && sha256File(path.join(input.originalRoot, secondaryFile)) === input.secondaryHash
}

export function makeSchedule(operations, seed) {
  let state = seed
  const schedule = []
  for (let index = 1; index <= operations; index += 1) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    const checkpoint = (index - 1) % 10 === 0 || index === operations
    schedule.push({ operation: index, commentOn: index % 2 === 1,
      commentHex: state.toString(16).padStart(8, "0"),
      references: checkpoint, moduleSwitch: checkpoint, pressure: index === 50 })
  }
  const digest = crypto.createHash("sha256").update(JSON.stringify(schedule)).digest("hex")
  return { seed, digest, schedule }
}

function canonicalDestination(fileName) {
  let directory = path.dirname(fileName)
  const missing = []
  while (!fs.existsSync(directory)) {
    missing.unshift(path.basename(directory))
    directory = path.dirname(directory)
  }
  return path.join(fs.realpathSync(directory), ...missing, path.basename(fileName))
}

function inside(target, root) {
  const relative = path.relative(root, target)
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative))
}
