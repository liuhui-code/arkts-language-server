#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fsSync from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const OUTPUT_SCHEMA = "arkts-language-server.sealed-artifact"
const COPY_BUFFER_BYTES = 64 * 1024
const TAR_BLOCK_BYTES = 512

let transientRoot
let transientOutput
try {
  const options = parseArguments(process.argv.slice(2))
  const result = await buildReleaseArtifact(options)
  process.stdout.write(`${JSON.stringify(result)}\n`)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
} finally {
  await removeTree(transientRoot)
  await removeTree(transientOutput)
}

async function buildReleaseArtifact({ sourceRoot, output }) {
  const source = await resolveRegularDirectory(sourceRoot, "release source root")
  const outputRoot = await canonicalizeMissingPath(output)
  assertOutsideSource(source, outputRoot)
  await assertMissing(outputRoot, "release output")
  await assertCleanGitWorktree(source)

  const commit = capture("git", ["-C", source, "rev-parse", "--verify", "HEAD^{commit}"])
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)) {
    throw new Error("git HEAD did not resolve to a full object id")
  }
  const packageMetadata = JSON.parse(await fs.readFile(path.join(source, "package.json"), "utf8"))
  const version = packageMetadata?.version
  if (typeof version !== "string" || !/^[0-9A-Za-z][0-9A-Za-z.+_-]*$/.test(version)) {
    throw new Error("package.json contains an unsafe release version")
  }
  const toolchains = {
    node: process.version,
    pnpm: capture("pnpm", ["--version"]),
    rustc: capture("rustc", ["--version"]),
  }

  transientRoot = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-release-build-"))
  const stagingRoot = path.join(transientRoot, "source")
  await fs.mkdir(stagingRoot)
  const sourceArchive = path.join(transientRoot, "source.tar")
  await run("git", [
    "-C", source,
    "archive", "--format=tar", `--output=${sourceArchive}`, commit,
  ])
  await run("tar", ["-xf", sourceArchive, "-C", stagingRoot])
  await fs.rm(sourceArchive)

  await run("pnpm", ["install", "--frozen-lockfile"], { cwd: stagingRoot })
  await run("pnpm", ["build"], { cwd: stagingRoot })
  await run("cargo", [
    "build", "--locked", "--package", "arkts-index-sidecar", "--release",
  ], { cwd: stagingRoot })

  const portableRoot = path.join(transientRoot, "portable")
  await run(process.execPath, [
    path.join(stagingRoot, "scripts", "artifact", "build-portable.mjs"),
    "--source-root", stagingRoot,
    "--output", portableRoot,
    "--version", version,
    "--commit", commit,
    "--toolchains", JSON.stringify(toolchains),
  ], { cwd: stagingRoot })

  const outputParent = path.dirname(outputRoot)
  await fs.mkdir(outputParent, { recursive: true })
  transientOutput = await fs.mkdtemp(path.join(outputParent, ".arkts-sealed-artifact-"))
  const artifactName = `arkts-language-server-${version}-${process.platform}-${process.arch}`
  const archiveName = `${artifactName}.tar`
  const archivePath = path.join(transientOutput, archiveName)
  const manifestName = "artifact-manifest.json"
  const manifestPath = path.join(transientOutput, manifestName)
  await createDeterministicTar({ sourceRoot: portableRoot, rootName: artifactName, output: archivePath })
  await fs.copyFile(path.join(portableRoot, manifestName), manifestPath, fsSync.constants.COPYFILE_EXCL)

  const checksums = []
  for (const fileName of [archiveName, manifestName].sort(compareOrdinal)) {
    checksums.push(`${await sha256File(path.join(transientOutput, fileName))}  ${fileName}`)
  }
  await fs.writeFile(
    path.join(transientOutput, "SHA256SUMS"),
    `${checksums.join("\n")}\n`,
    { flag: "wx", mode: 0o444 },
  )
  for (const fileName of [archiveName, manifestName]) {
    await fs.chmod(path.join(transientOutput, fileName), 0o444)
  }
  await fs.chmod(transientOutput, 0o555)
  await fs.rename(transientOutput, outputRoot)
  transientOutput = undefined

  return {
    schema: OUTPUT_SCHEMA,
    schemaVersion: 1,
    commit,
    version,
    archive: archiveName,
    manifest: manifestName,
    checksums: "SHA256SUMS",
  }
}

async function canonicalizeMissingPath(candidate) {
  let current = path.resolve(candidate)
  const missingSegments = []
  while (true) {
    try {
      return path.join(await fs.realpath(current), ...missingSegments)
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
      const parent = path.dirname(current)
      if (parent === current) throw error
      missingSegments.unshift(path.basename(current))
      current = parent
    }
  }
}

async function assertCleanGitWorktree(sourceRoot) {
  const status = capture("git", [
    "-C", sourceRoot,
    "status", "--porcelain=v1", "--untracked-files=all",
  ])
  if (status !== "") throw new Error("release source root must be a clean Git worktree")
}

async function resolveRegularDirectory(candidate, label) {
  const absolute = path.resolve(candidate)
  const stat = await fs.lstat(absolute)
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${label} must be a regular directory: ${absolute}`)
  }
  return fs.realpath(absolute)
}

function assertOutsideSource(sourceRoot, outputRoot) {
  const relative = path.relative(sourceRoot, outputRoot)
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..")) {
    throw new Error("release output must be outside the source worktree")
  }
}

async function assertMissing(candidate, label) {
  try {
    await fs.lstat(candidate)
  } catch (error) {
    if (error?.code === "ENOENT") return
    throw error
  }
  throw new Error(`${label} already exists: ${candidate}`)
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  })
  if (result.status !== 0 || result.signal !== null || result.error) {
    throw new Error(commandFailure(command, args, result))
  }
  return result.stdout.trim()
}

function run(command, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", process.stderr, process.stderr],
    })
    child.once("error", reject)
    child.once("close", (code, signal) => {
      if (code === 0 && signal === null) resolve()
      else reject(new Error(`${command} ${args.join(" ")} failed (${signal ?? code})`))
    })
  })
}

function commandFailure(command, args, result) {
  const detail = result.error?.message || result.stderr?.trim() || result.signal || result.status
  return `${command} ${args.join(" ")} failed (${detail})`
}

async function createDeterministicTar({ sourceRoot, rootName, output }) {
  const entries = [{ relativePath: "", absolutePath: sourceRoot, directory: true, mode: 0o755 }]
  await collectTarEntries(sourceRoot, "", entries)
  const archive = await fs.open(output, "wx", 0o444)
  try {
    for (const entry of entries) {
      const archivePath = entry.relativePath === ""
        ? `${rootName}/`
        : `${rootName}/${entry.relativePath}${entry.directory ? "/" : ""}`
      const size = entry.directory ? 0 : (await fs.stat(entry.absolutePath)).size
      await writeAll(archive, tarHeader({
        archivePath,
        mode: entry.mode,
        size,
        type: entry.directory ? "5" : "0",
      }))
      if (!entry.directory) await copyIntoArchive(entry.absolutePath, archive, size)
    }
    await writeAll(archive, Buffer.alloc(TAR_BLOCK_BYTES * 2))
    await archive.sync()
  } finally {
    await archive.close()
  }
}

async function collectTarEntries(root, relativeDirectory, entries) {
  const directory = path.join(root, ...relativeDirectory.split("/").filter(Boolean))
  const children = (await fs.readdir(directory, { withFileTypes: true }))
    .sort((left, right) => compareOrdinal(left.name, right.name))
  for (const child of children) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${child.name}` : child.name
    const absolutePath = path.join(directory, child.name)
    const stat = await fs.lstat(absolutePath)
    if (stat.isSymbolicLink()) {
      throw new Error(`portable artifact contains a symbolic link: ${relativePath}`)
    }
    if (stat.isDirectory()) {
      entries.push({ relativePath, absolutePath, directory: true, mode: stat.mode & 0o777 })
      await collectTarEntries(root, relativePath, entries)
    } else if (stat.isFile()) {
      entries.push({ relativePath, absolutePath, directory: false, mode: stat.mode & 0o777 })
    } else {
      throw new Error(`portable artifact contains a non-regular entry: ${relativePath}`)
    }
  }
}

function tarHeader({ archivePath, mode, size, type }) {
  const { name, prefix } = splitTarPath(archivePath)
  const header = Buffer.alloc(TAR_BLOCK_BYTES)
  writeString(header, 0, 100, name)
  writeOctal(header, 100, 8, mode)
  writeOctal(header, 108, 8, 0)
  writeOctal(header, 116, 8, 0)
  writeOctal(header, 124, 12, size)
  writeOctal(header, 136, 12, 0)
  header.fill(0x20, 148, 156)
  writeString(header, 156, 1, type)
  writeString(header, 257, 6, "ustar\0")
  writeString(header, 263, 2, "00")
  writeString(header, 345, 155, prefix)
  const checksum = header.reduce((sum, byte) => sum + byte, 0)
  const encodedChecksum = checksum.toString(8).padStart(6, "0")
  writeString(header, 148, 6, encodedChecksum)
  header[154] = 0
  header[155] = 0x20
  return header
}

function splitTarPath(archivePath) {
  if (Buffer.byteLength(archivePath) <= 100) return { name: archivePath, prefix: "" }
  for (let index = archivePath.lastIndexOf("/"); index > 0; index = archivePath.lastIndexOf("/", index - 1)) {
    const prefix = archivePath.slice(0, index)
    const name = archivePath.slice(index + 1)
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) {
      return { name, prefix }
    }
  }
  throw new Error(`portable artifact path exceeds ustar limits: ${archivePath}`)
}

function writeString(buffer, offset, length, value) {
  const bytes = Buffer.from(value, "utf8")
  if (bytes.length > length) throw new Error(`tar field exceeds ${length} bytes`)
  bytes.copy(buffer, offset)
}

function writeOctal(buffer, offset, length, value) {
  const encoded = value.toString(8).padStart(length - 1, "0")
  if (encoded.length >= length) throw new Error("portable artifact exceeds ustar numeric limits")
  writeString(buffer, offset, length, `${encoded}\0`)
}

async function copyIntoArchive(source, archive, size) {
  const input = await fs.open(source, "r")
  try {
    const buffer = Buffer.alloc(COPY_BUFFER_BYTES)
    let offset = 0
    while (offset < size) {
      const { bytesRead } = await input.read(buffer, 0, Math.min(buffer.length, size - offset), offset)
      if (bytesRead === 0) throw new Error(`portable artifact input changed while archiving: ${source}`)
      await writeAll(archive, buffer.subarray(0, bytesRead))
      offset += bytesRead
    }
    const padding = (TAR_BLOCK_BYTES - (size % TAR_BLOCK_BYTES)) % TAR_BLOCK_BYTES
    if (padding > 0) await writeAll(archive, Buffer.alloc(padding))
  } finally {
    await input.close()
  }
}

async function writeAll(handle, buffer) {
  let offset = 0
  while (offset < buffer.length) {
    const { bytesWritten } = await handle.write(buffer, offset, buffer.length - offset)
    if (bytesWritten === 0) throw new Error("failed to make progress while writing artifact archive")
    offset += bytesWritten
  }
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256")
    const stream = fsSync.createReadStream(filePath)
    stream.once("error", reject)
    stream.on("data", (chunk) => hash.update(chunk))
    stream.once("end", () => resolve(hash.digest("hex")))
  })
}

async function removeTree(candidate) {
  if (!candidate) return
  try {
    await fs.chmod(candidate, 0o755)
  } catch {}
  await fs.rm(candidate, { recursive: true, force: true })
}

function parseArguments(argv) {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv
  const values = new Map()
  for (let index = 0; index < normalizedArgv.length; index += 2) {
    const name = normalizedArgv[index]
    const value = normalizedArgv[index + 1]
    if (!name?.startsWith("--") || value === undefined) usage()
    if (values.has(name)) throw new Error(`duplicate argument: ${name}`)
    values.set(name, value)
  }
  const allowed = new Set(["--source-root", "--output"])
  for (const name of values.keys()) {
    if (!allowed.has(name)) throw new Error(`unknown argument: ${name}`)
  }
  for (const name of allowed) {
    if (!values.has(name)) usage()
  }
  return { sourceRoot: values.get("--source-root"), output: values.get("--output") }
}

function usage() {
  throw new Error("usage: build-portable-artifact.mjs --source-root DIR --output DIR")
}

function compareOrdinal(left, right) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
