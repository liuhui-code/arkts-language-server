#!/usr/bin/env node

import { execFile } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import fsConstants from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"

const BACKEND = "openharmony/third_party_typescript"
const MAX_JSON_BYTES = 256 * 1024
const MAX_LICENSE_BYTES = 4 * 1024 * 1024
const execFileAsync = promisify(execFile)

export async function recordUpstreamIdentity(argv = process.argv.slice(2), {
  cwd = process.cwd(),
  stdout = process.stdout,
} = {}) {
  const options = parseArguments(argv, cwd)
  const checkout = await requireRealDirectory(options.checkout, "Upstream checkout")
  const lock = await readJsonRegularFile(options.lock, MAX_JSON_BYTES, "Toolchain lock")
  validateLock(lock)

  const checkoutRevision = await gitRevision(checkout)
  if (checkoutRevision !== lock.semanticBackendRevision) {
    throw new Error(
      "Upstream checkout revision does not match the pinned toolchain lock: "
      + checkoutRevision + " != " + lock.semanticBackendRevision,
    )
  }

  const license = await readRegularFile(path.join(checkout, "LICENSE"), MAX_LICENSE_BYTES, "LICENSE")
  const licenseSha256 = createHash("sha256").update(license).digest("hex")
  const packageJsonPath = path.join(checkout, "package.json")
  const packageJson = await readJsonRegularFile(packageJsonPath, MAX_JSON_BYTES, "Upstream package")
  const packageName = requireText(packageJson.name, "package name")
  const packageVersion = requireText(packageJson.version, "package version")
  const buildScriptName = packageJson.scripts?.["build:compiler"] ? "build:compiler" : "build"
  const buildCommand = requireText(packageJson.scripts?.[buildScriptName], "package build script")
  const modulePath = requireSafeRelativePath(packageJson.main, "package main")
  const compilerPath = path.join(checkout, ...modulePath.split("/"))
  await requireContainedRegularFile(checkout, compilerPath, "Compiler API module")

  const require = createRequire(import.meta.url)
  const compiler = require(compilerPath)
  const scriptKindEts = compiler?.ScriptKind?.ETS
  if (!Number.isSafeInteger(scriptKindEts)) {
    throw new Error("Compiler API does not expose a numeric ScriptKind.ETS")
  }
  if (typeof compiler.createLanguageService !== "function") {
    throw new Error("Compiler API does not expose createLanguageService")
  }
  if (typeof compiler.createDocumentRegistry !== "function") {
    throw new Error("Compiler API does not expose createDocumentRegistry")
  }
  const compilerVersion = requireText(compiler.version, "compiler API version")

  const updatedLock = {
    ...lock,
    packageName,
    packageVersion,
  }
  const report = {
    schemaVersion: 1,
    semanticBackend: lock.semanticBackend,
    semanticBackendRepository: lock.semanticBackendRepository,
    semanticBackendRevision: lock.semanticBackendRevision,
    sdkApiLevel: lock.sdkApiLevel,
    sdkDeclarationDigest: lock.sdkDeclarationDigest,
    checkoutRevision,
    licenseSha256,
    packageName,
    packageVersion,
    buildScript: { name: buildScriptName, command: buildCommand },
    probeRuntime: {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    compilerApiIdentity: {
      modulePath,
      version: compilerVersion,
      scriptKindEts,
      hasCreateLanguageService: true,
      hasCreateDocumentRegistry: true,
    },
  }

  await writeFileAtomically(options.licenseOut, licenseSha256 + "  LICENSE\n")
  await writeJsonAtomically(options.reportOut, report)
  await writeJsonAtomically(options.lock, updatedLock)
  stdout.write(checkoutRevision + "\n")
  return report
}

function parseArguments(argv, cwd) {
  const supported = new Set(["--checkout", "--lock", "--license-out", "--report-out"])
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!supported.has(name)) throw new Error("Unknown argument: " + name)
    if (values.has(name)) throw new Error(name + " may appear only once")
    if (value === undefined || value.startsWith("--")) throw new Error(name + " requires a value")
    values.set(name, value)
  }
  return {
    checkout: requiredAbsolutePath(values.get("--checkout"), "--checkout", cwd),
    lock: resolveRequiredPath(values.get("--lock"), "--lock", cwd),
    licenseOut: resolveRequiredPath(values.get("--license-out"), "--license-out", cwd),
    reportOut: resolveRequiredPath(values.get("--report-out"), "--report-out", cwd),
  }
}

function requiredAbsolutePath(value, name, cwd) {
  if (!value) throw new Error(name + " is required")
  if (!path.isAbsolute(value)) throw new Error(name + " must be absolute")
  return path.resolve(cwd, value)
}

function resolveRequiredPath(value, name, cwd) {
  if (!value) throw new Error(name + " is required")
  return path.resolve(cwd, value)
}

async function requireRealDirectory(directory, description) {
  const metadata = await fs.lstat(directory)
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(description + " must be a real directory: " + directory)
  }
  return directory
}

async function gitRevision(checkout) {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: checkout,
    encoding: "utf8",
    maxBuffer: 16 * 1024,
    timeout: 30_000,
  })
  const revision = stdout.trim()
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("Upstream checkout HEAD is not one commit SHA")
  return revision
}

function validateLock(lock) {
  if (
    lock?.schemaVersion !== 1
    || lock.semanticBackend !== BACKEND
    || !/^[0-9a-f]{40}$/.test(lock.semanticBackendRevision)
    || !/^[0-9a-f]{64}$/.test(lock.sdkDeclarationDigest)
    || !Number.isSafeInteger(lock.sdkApiLevel)
    || lock.sdkApiLevel < 1
    || typeof lock.semanticBackendRepository !== "string"
    || !lock.semanticBackendRepository
  ) {
    throw new Error("Toolchain lock does not contain a valid pinned backend and SDK identity")
  }
}

function requireText(value, description) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Missing " + description)
  return value
}

function requireSafeRelativePath(value, description) {
  const suppliedPath = requireText(value, description).replaceAll("\\", "/")
  const relativePath = suppliedPath.startsWith("./") ? suppliedPath.slice(2) : suppliedPath
  const normalized = path.posix.normalize(relativePath)
  if (
    normalized === "."
    || normalized.startsWith("../")
    || path.posix.isAbsolute(normalized)
    || normalized !== relativePath
  ) {
    throw new Error(description + " must be a normalized relative path")
  }
  return normalized
}

async function requireContainedRegularFile(root, filePath, description) {
  const metadata = await fs.lstat(filePath)
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(description + " must be a regular file: " + filePath)
  }
  const realRoot = await fs.realpath(root)
  const realFile = await fs.realpath(filePath)
  if (!realFile.startsWith(realRoot + path.sep)) {
    throw new Error(description + " escaped the upstream checkout: " + filePath)
  }
}

async function readJsonRegularFile(filePath, limit, description) {
  const content = await readRegularFile(filePath, limit, description)
  try {
    return JSON.parse(content.toString("utf8"))
  } catch (error) {
    throw new Error(description + " is not valid JSON: " + filePath, { cause: error })
  }
}

async function readRegularFile(filePath, limit, description) {
  const noFollow = fsConstants.constants.O_NOFOLLOW ?? 0
  const handle = await fs.open(filePath, fsConstants.constants.O_RDONLY | noFollow)
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.size > limit) {
      throw new Error(description + " must be a bounded regular file: " + filePath)
    }
    const content = await handle.readFile()
    if (content.length > limit) throw new Error(description + " exceeds byte budget: " + filePath)
    return content
  } finally {
    await handle.close()
  }
}

async function writeJsonAtomically(outputPath, value) {
  await writeFileAtomically(outputPath, JSON.stringify(value, null, 2) + "\n")
}

async function writeFileAtomically(outputPath, content) {
  const directory = path.dirname(outputPath)
  await fs.mkdir(directory, { recursive: true })
  const temporary = path.join(
    directory,
    "." + path.basename(outputPath) + "." + process.pid + "."
      + randomBytes(8).toString("hex") + ".tmp",
  )
  try {
    const handle = await fs.open(temporary, "wx", 0o600)
    try {
      await handle.writeFile(content)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await fs.rename(temporary, outputPath)
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

function isMainModule() {
  return process.argv[1]
    && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
}

if (isMainModule()) {
  recordUpstreamIdentity().catch((error) => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n")
    process.exitCode = 1
  })
}
