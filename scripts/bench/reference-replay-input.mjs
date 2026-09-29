import { execFileSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { digestSdk } from "../semantic/lock-toolchain.mjs"

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

export function parseArguments(args) {
  const values = new Map()
  const flags = new Set()
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "--help" || argument === "--trace" || argument === "--exclude-declaration") {
      if (flags.has(argument)) throw new Error(`${argument} may appear only once`)
      flags.add(argument)
      continue
    }
    if (!argument.startsWith("--")) throw new Error(`unknown argument: ${argument}`)
    if (values.has(argument)) throw new Error(`${argument} may appear only once`)
    const value = args[index + 1]
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`)
    values.set(argument, value)
    index += 1
  }
  if (flags.has("--help")) return { help: true }
  for (const required of ["--workspace", "--sdk", "--file", "--symbol", "--line", "--character", "--oracle", "--out"]) {
    if (!values.has(required)) throw new Error(`${required} is required`)
  }
  const mode = values.get("--mode") ?? "A"
  if (!new Set(["A", "B", "C"]).has(mode)) throw new Error("--mode must be A, B, or C")
  const catalogState = values.get("--catalog-state") ?? "ready"
  if (!new Set(["ready", "immediate"]).has(catalogState)) {
    throw new Error("--catalog-state must be ready or immediate")
  }
  const strategy = values.get("--strategy")
  if (strategy && !new Set(["legacy", "batched", "indexed-batched"]).has(strategy)) {
    throw new Error("--strategy must be legacy, batched, or indexed-batched")
  }
  const sdkProfile = values.get("--sdk-profile")
  if (sdkProfile && !new Set(["full", "common"]).has(sdkProfile)) {
    throw new Error("--sdk-profile must be full or common")
  }
  const dependencyProfile = values.get("--dependency-profile")
  if (dependencyProfile && !new Set(["closure", "identity"]).has(dependencyProfile)) {
    throw new Error("--dependency-profile must be closure or identity")
  }
  return {
    help: false,
    workspace: path.resolve(values.get("--workspace")),
    sdk: path.resolve(values.get("--sdk")),
    file: values.get("--file"),
    symbol: values.get("--symbol"),
    position: {
      line: nonNegativeInteger(values.get("--line"), "--line"),
      character: nonNegativeInteger(values.get("--character"), "--character"),
    },
    oracle: path.resolve(values.get("--oracle")),
    manifest: values.has("--manifest") ? path.resolve(values.get("--manifest")) : null,
    out: path.resolve(values.get("--out")),
    server: path.resolve(values.get("--server") ?? path.join(projectRoot, "dist", "server.cjs")),
    sidecar: path.resolve(values.get("--sidecar") ?? path.join(projectRoot, "target", "release", "arkts-index-sidecar")),
    mode,
    catalogState,
    strategy,
    sdkProfile,
    dependencyProfile,
    batchRoots: optionalPositiveInteger(values.get("--batch-roots"), "--batch-roots"),
    sampleIntervalMs: positiveInteger(values.get("--sample-interval-ms") ?? "50", "--sample-interval-ms"),
    timeoutMs: positiveInteger(values.get("--timeout-ms") ?? "180000", "--timeout-ms"),
    diagnosticTimeoutMs: positiveInteger(values.get("--diagnostic-timeout-ms") ?? "180000", "--diagnostic-timeout-ms"),
    idleMs: nonNegativeInteger(values.get("--idle-ms") ?? "10000", "--idle-ms"),
    trace: flags.has("--trace"),
    includeDeclaration: !flags.has("--exclude-declaration"),
  }
}

export function validateInputs(options) {
  requireDirectory(options.workspace, "workspace")
  if (options.manifest && !fs.existsSync(options.sdk)) {
    throw new Error("BENCHMARK_BLOCKED=SDK_UNAVAILABLE")
  }
  requireDirectory(options.sdk, "SDK")
  requireFile(path.resolve(options.workspace, options.file), "target file")
  requireFile(options.oracle, "oracle")
  if (options.manifest) requireFile(options.manifest, "benchmark manifest")
  requireFile(options.server, "server")
  requireFile(options.sidecar, "sidecar")
  options.standardLibrarySha256 = digestAdjacentStandardLibrary(options.server)
  options.semanticWorkerSha256 = digestOptionalSibling(options.server, "semantic-worker.cjs")
  options.referenceVerifierWorkerSha256 = digestOptionalSibling(options.server, "reference-verifier-worker.cjs")
  if (fs.existsSync(options.out)) throw new Error(`output already exists: ${options.out}`)
}

export async function validateBenchmarkManifest(options) {
  if (!options.manifest) return
  const manifest = JSON.parse(fs.readFileSync(options.manifest, "utf8"))
  const block = (reason) => { throw new Error(`BENCHMARK_BLOCKED=${reason}`) }
  const sha256 = (value) => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value)
  if (manifest.schemaVersion !== 1 || !manifest.benchmarkId
    || !/^[0-9a-f]{40}$/u.test(manifest.repoSha ?? "")
    || !sha256(manifest.sdk?.declarationDigest)
    || !sha256(manifest.oracle?.sha256)
    || !sha256(manifest.serverSha256)
    || !sha256(manifest.sidecarSha256)
    || (manifest.standardLibrarySha256 !== undefined && !sha256(manifest.standardLibrarySha256))
    || (manifest.semanticWorkerSha256 !== undefined && !sha256(manifest.semanticWorkerSha256))
    || (manifest.referenceVerifierWorkerSha256 !== undefined && !sha256(manifest.referenceVerifierWorkerSha256))
    || !Number.isSafeInteger(manifest.oracle?.expectedLocationCount)
    || manifest.oracle.expectedLocationCount < 1) block("INVALID_MANIFEST")
  const sdk = readSdkMetadata(options.sdk)
  if (!sdk || sdk.apiVersion !== manifest.sdk?.apiVersion || sdk.version !== manifest.sdk?.version) {
    block("SDK_MISMATCH")
  }
  options.sdkDeclarationDigest = await digestSdk(options.sdk)
  if (options.sdkDeclarationDigest !== manifest.sdk.declarationDigest) block("SDK_MISMATCH")
  if (manifest.oracle?.verified !== true) block("UNVERIFIED_ORACLE")
  if (manifest.nodeVersion && manifest.nodeVersion !== process.version) block("NODE_VERSION_MISMATCH")
  if (manifest.repoSha !== gitValue(options.workspace, ["rev-parse", "HEAD"])) block("REPO_REVISION_MISMATCH")
  if (gitValue(options.workspace, ["status", "--porcelain"])) block("DIRTY_WORKSPACE")
  const query = manifest.query
  if (!query || query.file !== options.file || query.symbol !== options.symbol
    || query.line !== options.position.line || query.character !== options.position.character
    || query.includeDeclaration !== options.includeDeclaration) block("QUERY_MISMATCH")
  if (manifest.serverSha256 !== sha256File(options.server)) block("SERVER_MISMATCH")
  if (manifest.standardLibrarySha256 !== undefined
    && manifest.standardLibrarySha256 !== options.standardLibrarySha256) block("STANDARD_LIBRARY_MISMATCH")
  if (manifest.semanticWorkerSha256 !== undefined
    && manifest.semanticWorkerSha256 !== options.semanticWorkerSha256) block("SEMANTIC_WORKER_MISMATCH")
  if (manifest.referenceVerifierWorkerSha256 !== undefined
    && manifest.referenceVerifierWorkerSha256 !== options.referenceVerifierWorkerSha256) {
    block("REFERENCE_VERIFIER_WORKER_MISMATCH")
  }
  if (manifest.sidecarSha256 !== sha256File(options.sidecar)) block("SIDECAR_MISMATCH")
  if (manifest.oracle.sha256 !== sha256File(options.oracle)) block("ORACLE_MISMATCH")
  options.benchmarkManifest = manifest
}

export function readSdkMetadata(sdkRoot) {
  const manifest = path.join(sdkRoot, "ets", "oh-uni-package.json")
  return fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, "utf8")) : null
}

export function sha256File(fileName) {
  return crypto.createHash("sha256").update(fs.readFileSync(fileName)).digest("hex")
}

function digestOptionalSibling(server, basename) {
  const sibling = path.join(path.dirname(server), basename)
  return fs.existsSync(sibling) ? sha256File(sibling) : null
}

function digestAdjacentStandardLibrary(server) {
  const directory = path.dirname(server)
  const manifestPath = path.join(directory, "arkts-standard-library.json")
  if (!fs.existsSync(manifestPath)) return null
  const manifestBytes = fs.readFileSync(manifestPath)
  const manifest = JSON.parse(manifestBytes.toString("utf8"))
  const files = manifest?.files
  if (manifest.schema !== "arkts-language-server.standard-library"
    || manifest.schemaVersion !== 1 || !Array.isArray(files) || files.length === 0
    || files.length > 256 || new Set(files).size !== files.length
    || files.some(name => typeof name !== "string" || !/^lib(?:\.[a-z0-9]+)*\.d\.ts$/u.test(name))) {
    throw new Error("BENCHMARK_BLOCKED=INVALID_STANDARD_LIBRARY")
  }
  const hash = crypto.createHash("sha256")
  addAsset(hash, "arkts-standard-library.json", manifestBytes)
  for (const name of files) addAsset(hash, name, fs.readFileSync(path.join(directory, name)))
  return hash.digest("hex")
}

function addAsset(hash, name, bytes) {
  hash.update(name, "utf8")
  hash.update("\0")
  hash.update(String(bytes.length), "utf8")
  hash.update("\0")
  hash.update(bytes)
}

export function gitValue(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim()
  } catch {
    return null
  }
}

function requireFile(fileName, label) {
  if (!fs.statSync(fileName).isFile()) throw new Error(`${label} must be a file: ${fileName}`)
}

function requireDirectory(fileName, label) {
  if (!fs.statSync(fileName).isDirectory()) throw new Error(`${label} must be a directory: ${fileName}`)
}

function optionalPositiveInteger(value, label) {
  return value === undefined ? null : positiveInteger(value, label)
}

function positiveInteger(value, label) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`)
  return parsed
}

function nonNegativeInteger(value, label) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative integer`)
  return parsed
}

export function helpText() {
  return `Usage:
  node scripts/bench/replay-references.mjs \\
    --workspace <path> \\
    --sdk <path> \\
    --file <workspace-relative path> \\
    --symbol <identifier> \\
    --line <zero-based> \\
    --character <UTF-16> \\
    --oracle <report.json> \\
    --out <report.json>

Runs a real child-process textDocument/references request with Content-Length
framed stdio, exact Location oracle validation, normal diagnostics, and external
process-tree RSS sampling.

Options:
  --manifest <file.json>         pin real project, SDK, query, oracle and binaries
  --mode <A|B|C>                 A: references first; B: warm completion and
                                 definition; C: ten references plus unsaved edit
  --catalog-state <ready|immediate>
                                 ready: wait for indexing; immediate: request
                                 after initialize without waiting for indexing
  --strategy <name>              legacy, batched, or indexed-batched
  --sdk-profile <full|common>    verifier-only SDK ambient profile
  --dependency-profile <closure|identity>
                                 identity-proven candidate dependency profile
  --batch-roots <count>          candidate root limit for batching
  --server <path>                defaults to dist/server.cjs
  --sidecar <path>               defaults to target/release/arkts-index-sidecar
  --sample-interval-ms <ms>      defaults to 50
  --timeout-ms <ms>              defaults to 180000
  --diagnostic-timeout-ms <ms>   defaults to 180000
  --idle-ms <ms>                 defaults to 10000
  --exclude-declaration          use includeDeclaration=false
  --trace                        enable bounded references trace events
  --help                         show this message
`
}
