#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto"
import { execFile } from "node:child_process"
import fsConstants from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { pathToFileURL } from "node:url"

const DEFAULT_OUT = "docs/toolchains/arkts-toolchain.lock.json"
const DEFAULT_REPOSITORY = "https://github.com/openharmony/third_party_typescript.git"
const BACKEND = "openharmony/third_party_typescript"
const MAX_FILES = 100_000
const MAX_FILE_BYTES = 64 * 1_024 * 1_024
const MAX_TOTAL_BYTES = 512 * 1_024 * 1_024
const MAX_LOCK_BYTES = 64 * 1_024
const execFileAsync = promisify(execFile)

export async function lockToolchain(argv = process.argv.slice(2), {
  cwd = process.cwd(),
  stdout = process.stdout,
} = {}) {
  const options = parseArguments(argv, cwd)
  const revision = options.revision
    ?? await existingRevision(options.out, options.repository)
    ?? await remoteRevision(options.repository)
  const sdkDeclarationDigest = await digestSdk(options.sdk)
  const lock = {
    schemaVersion: 1,
    semanticBackend: BACKEND,
    semanticBackendRevision: revision,
    semanticBackendRepository: options.repository,
    sdkApiLevel: options.apiLevel,
    sdkDeclarationDigest,
    packageName: null,
    packageVersion: null,
  }
  await writeJsonAtomically(options.out, lock)
  stdout.write(`${revision}\n`)
  return lock
}

function parseArguments(argv, cwd) {
  const values = new Map()
  const supported = new Set(["--sdk", "--api-level", "--repo", "--revision", "--out"])
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!supported.has(name)) throw new Error(`Unknown argument: ${name}`)
    if (values.has(name)) throw new Error(`${name} may appear only once`)
    if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value`)
    values.set(name, value)
  }
  const sdk = requiredAbsolutePath(values.get("--sdk"), "--sdk", cwd)
  const out = path.resolve(cwd, values.get("--out") ?? DEFAULT_OUT)
  const repository = values.get("--repo") ?? DEFAULT_REPOSITORY
  if (!repository.trim()) throw new Error("--repo must not be empty")
  const revision = values.get("--revision")
  if (revision !== undefined && !/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error("--revision must be a lowercase 40-character commit SHA")
  }
  const apiLevelText = values.get("--api-level")
  if (!apiLevelText || !/^[1-9]\d*$/.test(apiLevelText)) {
    throw new Error("--api-level must be a positive integer")
  }
  const apiLevel = Number(apiLevelText)
  if (!Number.isSafeInteger(apiLevel)) throw new Error("--api-level exceeds the safe integer range")
  return { sdk, out, repository, revision, apiLevel }
}

async function existingRevision(outputPath, repository) {
  let handle
  try {
    const noFollow = fsConstants.constants.O_NOFOLLOW ?? 0
    handle = await fs.open(outputPath, fsConstants.constants.O_RDONLY | noFollow)
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null
    throw new Error(`Existing toolchain lock must be a regular file: ${outputPath}`, { cause: error })
  }
  let parsed
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.size > MAX_LOCK_BYTES) {
      throw new Error(`Existing toolchain lock must be a bounded regular file: ${outputPath}`)
    }
    const content = await handle.readFile({ encoding: "utf8" })
    if (Buffer.byteLength(content) > MAX_LOCK_BYTES) {
      throw new Error(`Existing toolchain lock exceeds byte budget: ${outputPath}`)
    }
    parsed = JSON.parse(content)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Existing toolchain lock")) throw error
    throw new Error(`Existing toolchain lock is unreadable: ${outputPath}`, { cause: error })
  } finally {
    await handle.close()
  }
  if (
    parsed?.schemaVersion !== 1
    || parsed.semanticBackend !== BACKEND
    || parsed.semanticBackendRepository !== repository
    || !/^[0-9a-f]{40}$/.test(parsed.semanticBackendRevision)
  ) {
    throw new Error(`Existing toolchain lock cannot supply a pinned revision: ${outputPath}`)
  }
  return parsed.semanticBackendRevision
}

async function remoteRevision(repository) {
  const { stdout } = await execFileAsync("git", ["ls-remote", repository, "HEAD"], {
    encoding: "utf8",
    maxBuffer: 16 * 1_024,
    timeout: 30_000,
  })
  const match = /^([0-9a-f]{40})\s+HEAD\s*$/m.exec(stdout)
  if (!match) throw new Error("Upstream HEAD did not resolve to one commit SHA")
  return match[1]
}

function requiredAbsolutePath(value, name, cwd) {
  if (!value) throw new Error(`${name} is required`)
  if (!path.isAbsolute(value)) throw new Error(`${name} must be absolute`)
  return path.resolve(cwd, value)
}

async function digestSdk(sdkRoot) {
  await requireDirectory(sdkRoot, "SDK root")
  await requireDirectory(path.join(sdkRoot, "ets"), "SDK ets directory")
  await requireDirectory(path.join(sdkRoot, "toolchains"), "SDK toolchains directory")
  const files = []
  await collectFiles(sdkRoot, sdkRoot, files)
  files.sort(ordinalCompare)
  if (files.length === 0) throw new Error("SDK contains no .d.ts, .d.ets, or .json5 inputs")

  const hash = createHash("sha256")
  let totalBytes = 0
  for (const relativePath of files) {
    const content = await readRegularFile(path.join(sdkRoot, ...relativePath.split("/")))
    totalBytes += content.length
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("SDK declaration inputs exceed byte budget")
    hash.update(relativePath, "utf8")
    hash.update("\0")
    hash.update(String(content.length), "utf8")
    hash.update("\0")
    hash.update(content)
  }
  return hash.digest("hex")
}

async function collectFiles(sdkRoot, directory, files) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  entries.sort((left, right) => ordinalCompare(left.name, right.name))
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name)
    const metadata = await fs.lstat(candidate)
    if (metadata.isSymbolicLink()) {
      if (isDigestInput(entry.name)) {
        throw new Error(`SDK digest input is a symbolic link: ${candidate}`)
      }
      continue
    }
    if (metadata.isDirectory()) {
      await collectFiles(sdkRoot, candidate, files)
      continue
    }
    if (!metadata.isFile()) throw new Error(`SDK input tree contains a non-regular file: ${candidate}`)
    if (!isDigestInput(entry.name)) continue
    const relativePath = path.relative(sdkRoot, candidate).split(path.sep).join("/")
    if (!relativePath || relativePath.startsWith("../") || path.isAbsolute(relativePath)) {
      throw new Error(`SDK input escaped its root: ${candidate}`)
    }
    files.push(relativePath)
    if (files.length > MAX_FILES) throw new Error("SDK declaration inputs exceed file-count budget")
  }
}

function isDigestInput(name) {
  return name.endsWith(".d.ts") || name.endsWith(".d.ets") || name.endsWith(".json5")
}

async function requireDirectory(directory, description) {
  const metadata = await fs.lstat(directory)
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`${description} must be a real directory: ${directory}`)
  }
}

async function readRegularFile(filePath) {
  const noFollow = fsConstants.constants.O_NOFOLLOW ?? 0
  const handle = await fs.open(filePath, fsConstants.constants.O_RDONLY | noFollow)
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile()) throw new Error(`SDK digest input is not a regular file: ${filePath}`)
    if (metadata.size > MAX_FILE_BYTES) throw new Error(`SDK digest input exceeds file byte budget: ${filePath}`)
    const content = await handle.readFile()
    if (content.length > MAX_FILE_BYTES) throw new Error(`SDK digest input exceeds file byte budget: ${filePath}`)
    return content
  } finally {
    await handle.close()
  }
}

async function writeJsonAtomically(outputPath, value) {
  const directory = path.dirname(outputPath)
  await fs.mkdir(directory, { recursive: true })
  const temporary = path.join(
    directory,
    `.${path.basename(outputPath)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  )
  try {
    const handle = await fs.open(temporary, "wx", 0o600)
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8")
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

function ordinalCompare(left, right) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function isMainModule() {
  return process.argv[1]
    && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
}

if (isMainModule()) {
  lockToolchain().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
