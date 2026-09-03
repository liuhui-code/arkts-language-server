#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

const MANIFEST_FILE = "artifact-manifest.json"
const MANIFEST_SCHEMA = "arkts-language-server.artifact-manifest"
const MANIFEST_SCHEMA_VERSION = 1

try {
  if (process.argv.length !== 4) {
    throw new Error("usage: install-from-manifest.mjs ARTIFACT_ROOT BIN_DIRECTORY")
  }
  await installFromManifest({
    artifactRoot: path.resolve(process.argv[2]),
    binDirectory: path.resolve(process.argv[3]),
  })
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}

async function installFromManifest({ artifactRoot, binDirectory }) {
  const { manifest, manifestBytes, records } = await verifyArtifact(artifactRoot)
  const sidecarName = process.platform === "win32"
    ? "arkts-index-sidecar.exe"
    : "arkts-index-sidecar"
  const runtimePaths = [
    "bin/arkts-language-server",
    "dist/server.cjs",
    `target/release/${sidecarName}`,
  ]
  for (const relativePath of runtimePaths) {
    if (!records.has(relativePath)) {
      throw new Error(`artifact manifest is missing runtime file: ${relativePath}`)
    }
  }

  const manifestDigest = sha256(manifestBytes)
  const releaseId = `${safeVersion(manifest.version)}-${manifestDigest}`
  const installPrefix = path.dirname(binDirectory)
  const libexecRoot = path.join(installPrefix, "libexec", "arkts-language-server")
  const releaseRoot = path.join(libexecRoot, releaseId)
  const installedCommand = path.join(binDirectory, "arkts-language-server")

  await fs.mkdir(libexecRoot, { recursive: true })
  await fs.mkdir(binDirectory, { recursive: true })
  await assertReplaceableCommand(installedCommand, libexecRoot)

  if (await exists(releaseRoot)) {
    await verifyRuntimeFiles(releaseRoot, runtimePaths, records)
  } else {
    const stagingRoot = await fs.mkdtemp(path.join(libexecRoot, `.staging-${releaseId}-`))
    try {
      for (const relativePath of runtimePaths) {
        const source = resolveArtifactPath(artifactRoot, relativePath)
        const destination = resolveArtifactPath(stagingRoot, relativePath)
        await fs.mkdir(path.dirname(destination), { recursive: true })
        await fs.copyFile(source, destination)
        await fs.chmod(destination, Number.parseInt(records.get(relativePath).mode, 8))
      }
      await verifyRuntimeFiles(stagingRoot, runtimePaths, records)
      await fs.rename(stagingRoot, releaseRoot)
    } finally {
      await fs.rm(stagingRoot, { recursive: true, force: true })
    }
  }

  const commandTarget = path.join(releaseRoot, "bin", "arkts-language-server")
  const temporaryCommand = `${installedCommand}.tmp-${process.pid}-${randomUUID()}`
  try {
    await fs.symlink(path.relative(binDirectory, commandTarget), temporaryCommand)
    await fs.rename(temporaryCommand, installedCommand)
  } finally {
    await fs.rm(temporaryCommand, { force: true })
  }

  process.stdout.write(
    `Installed arkts-language-server ${manifest.version} artifact ${manifestDigest} at ${installedCommand}\n`,
  )
}

async function verifyArtifact(artifactRoot) {
  const rootStat = await fs.lstat(artifactRoot)
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error("artifact root must be a real directory")
  }

  const manifestBytes = await fs.readFile(path.join(artifactRoot, MANIFEST_FILE))
  let manifest
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"))
  } catch {
    throw new Error("artifact manifest is not valid JSON")
  }
  if (manifest?.schema !== MANIFEST_SCHEMA || manifest?.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new Error("artifact manifest schema is not supported")
  }
  if (manifest.platform?.os !== process.platform || manifest.platform?.arch !== process.arch) {
    throw new Error(
      `artifact platform ${manifest.platform?.os}/${manifest.platform?.arch} does not match `
        + `${process.platform}/${process.arch}`,
    )
  }
  if (!Array.isArray(manifest.files)) throw new Error("artifact manifest files must be an array")

  const records = new Map()
  let previousPath
  for (const record of manifest.files) {
    validateRecord(record)
    if (previousPath !== undefined && previousPath >= record.path) {
      throw new Error("artifact manifest file paths must be unique and sorted")
    }
    previousPath = record.path
    records.set(record.path, record)
    await verifyFile(artifactRoot, record)
  }

  const actualFiles = []
  await collectArtifactFiles(artifactRoot, [], actualFiles)
  const expectedFiles = [...records.keys()]
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error("artifact tree does not exactly match artifact manifest")
  }

  return { manifest, manifestBytes, records }
}

function validateRecord(record) {
  if (record === null || typeof record !== "object") {
    throw new Error("artifact manifest contains an invalid file record")
  }
  resolveArtifactPath("/artifact", record.path)
  if (!Number.isSafeInteger(record.size) || record.size < 0) {
    throw new Error(`artifact manifest contains an invalid size for ${record.path}`)
  }
  if (!/^0[0-7]{3}$/.test(record.mode)) {
    throw new Error(`artifact manifest contains an invalid mode for ${record.path}`)
  }
  if (!/^[0-9a-f]{64}$/.test(record.sha256)) {
    throw new Error(`artifact manifest contains an invalid SHA-256 for ${record.path}`)
  }
}

async function verifyFile(root, record) {
  const filePath = resolveArtifactPath(root, record.path)
  const stat = await fs.lstat(filePath)
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`artifact entry is not a regular file: ${record.path}`)
  }
  if (stat.size !== record.size) throw new Error(`size mismatch for artifact file ${record.path}`)
  const actualMode = `0${(stat.mode & 0o777).toString(8)}`
  if (actualMode !== record.mode) throw new Error(`mode mismatch for artifact file ${record.path}`)
  const actualDigest = sha256(await fs.readFile(filePath))
  if (actualDigest !== record.sha256) {
    throw new Error(`SHA-256 mismatch for artifact file ${record.path}`)
  }
}

async function verifyRuntimeFiles(root, runtimePaths, records) {
  for (const relativePath of runtimePaths) await verifyFile(root, records.get(relativePath))
}

async function collectArtifactFiles(root, segments, files) {
  const entries = await fs.readdir(path.join(root, ...segments), { withFileTypes: true })
  for (const entry of entries) {
    const entrySegments = [...segments, entry.name]
    const relativePath = entrySegments.join("/")
    if (entry.isSymbolicLink()) throw new Error(`artifact tree contains a symbolic link: ${relativePath}`)
    if (entry.isDirectory()) {
      await collectArtifactFiles(root, entrySegments, files)
    } else if (entry.isFile() && relativePath !== MANIFEST_FILE) {
      files.push(relativePath)
    } else if (!entry.isFile()) {
      throw new Error(`artifact tree contains a non-file entry: ${relativePath}`)
    }
  }
  files.sort(ordinalCompare)
}

async function assertReplaceableCommand(installedCommand, libexecRoot) {
  let stat
  try {
    stat = await fs.lstat(installedCommand)
  } catch (error) {
    if (error?.code === "ENOENT") return
    throw error
  }
  if (!stat.isSymbolicLink()) throw new Error(`Refusing to replace existing path: ${installedCommand}`)
  const target = await fs.readlink(installedCommand)
  const resolvedTarget = path.resolve(path.dirname(installedCommand), target)
  if (!isWithin(libexecRoot, resolvedTarget)) {
    throw new Error(`Refusing to replace existing path: ${installedCommand}`)
  }
}

function resolveArtifactPath(root, relativePath) {
  if (typeof relativePath !== "string"
    || relativePath.length === 0
    || relativePath.includes("\\")
    || path.posix.isAbsolute(relativePath)
    || relativePath.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`unsafe artifact path: ${String(relativePath)}`)
  }
  const resolved = path.resolve(root, ...relativePath.split("/"))
  if (!isWithin(root, resolved)) throw new Error(`unsafe artifact path: ${relativePath}`)
  return resolved
}

function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)
}

function safeVersion(version) {
  if (typeof version !== "string" || !/^[A-Za-z0-9._-]+$/.test(version)) {
    throw new Error("artifact manifest contains an unsafe version")
  }
  return version
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex")
}

async function exists(filePath) {
  try {
    await fs.lstat(filePath)
    return true
  } catch (error) {
    if (error?.code === "ENOENT") return false
    throw error
  }
}

function ordinalCompare(left, right) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
