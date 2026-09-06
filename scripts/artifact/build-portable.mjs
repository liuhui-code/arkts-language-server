#!/usr/bin/env node

import fs from "node:fs/promises"
import path from "node:path"

import { createArtifactManifest } from "../../tests/support/artifact-manifest.mjs"
try {
  const options = parseArguments(process.argv.slice(2))
  await buildPortableArtifact(options)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}

async function buildPortableArtifact({ sourceRoot, output, version, commit, toolchains }) {
  const outputRoot = path.resolve(output)
  const source = path.resolve(sourceRoot)

  const sidecarName = process.platform === "win32"
    ? "arkts-index-sidecar.exe"
    : "arkts-index-sidecar"
  const inputs = [
    {
      source: "bin/arkts-language-server",
      destination: "bin/arkts-language-server",
    },
    {
      source: "dist/server.cjs",
      destination: "dist/server.cjs",
    },
    {
      source: `target/release/${sidecarName}`,
      destination: `target/release/${sidecarName}`,
    },
    {
      source: "scripts/install-local.sh",
      destination: "scripts/install-local.sh",
    },
    {
      source: "scripts/artifact/install-from-manifest.mjs",
      destination: "scripts/artifact/install-from-manifest.mjs",
    },
  ]
  const files = []
  for (const input of inputs) {
    files.push({
      source: await resolvePortableInput(source, input.source),
      destination: input.destination,
    })
  }

  await fs.mkdir(outputRoot)

  for (const file of files) {
    await copyRegularFile(file.source, path.join(outputRoot, ...file.destination.split("/")))
  }

  const manifest = await createArtifactManifest({
    root: outputRoot,
    version,
    commit,
    platform: { os: process.platform, arch: process.arch },
    toolchains,
  })
  await fs.writeFile(
    path.join(outputRoot, "artifact-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: "wx", mode: 0o644 },
  )
}

async function resolvePortableInput(sourceRoot, relativePath) {
  const rootStat = await fs.lstat(sourceRoot)
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error(`portable artifact source root must be a regular directory: ${sourceRoot}`)
  }

  let current = sourceRoot
  const segments = relativePath.split("/")
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index])
    const stat = await fs.lstat(current)
    if (stat.isSymbolicLink()) {
      throw new Error(`portable artifact input path contains a symbolic link: ${current}`)
    }
    if (index < segments.length - 1 && !stat.isDirectory()) {
      throw new Error(`portable artifact input parent must be a directory: ${current}`)
    }
    if (index === segments.length - 1 && !stat.isFile()) {
      throw new Error(`portable artifact input must be a regular file: ${current}`)
    }
  }

  const [resolvedRoot, resolvedInput] = await Promise.all([
    fs.realpath(sourceRoot),
    fs.realpath(current),
  ])
  const relative = path.relative(resolvedRoot, resolvedInput)
  if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error(`portable artifact input is outside source root: ${current}`)
  }
  return current
}

async function copyRegularFile(source, destination) {
  const stat = await fs.lstat(source)
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`portable artifact input must be a regular file: ${source}`)
  }
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.copyFile(source, destination)
  await fs.chmod(destination, stat.mode & 0o777)
}

function parseArguments(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!name?.startsWith("--") || value === undefined) usage()
    if (values.has(name)) throw new Error(`duplicate argument: ${name}`)
    values.set(name, value)
  }

  const allowed = new Set(["--source-root", "--output", "--version", "--commit", "--toolchains"])
  for (const name of values.keys()) {
    if (!allowed.has(name)) throw new Error(`unknown argument: ${name}`)
  }
  for (const name of allowed) {
    if (!values.has(name)) usage()
  }

  let toolchains
  try {
    toolchains = JSON.parse(values.get("--toolchains"))
  } catch {
    throw new Error("--toolchains must be a JSON object")
  }
  if (!isStringRecord(toolchains)) {
    throw new Error("--toolchains must be a JSON object with string values")
  }

  return {
    sourceRoot: values.get("--source-root"),
    output: values.get("--output"),
    version: values.get("--version"),
    commit: values.get("--commit"),
    toolchains,
  }
}

function isStringRecord(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.values(value).every((entry) => typeof entry === "string")
}

function usage() {
  throw new Error(
    "usage: build-portable.mjs --source-root DIR --output DIR --version VERSION "
      + "--commit COMMIT --toolchains JSON",
  )
}
