#!/usr/bin/env node

import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { createArtifactManifest } from "../../tests/support/artifact-manifest.mjs"

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, "../..")

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
  await fs.mkdir(outputRoot)

  const sidecarName = process.platform === "win32"
    ? "arkts-index-sidecar.exe"
    : "arkts-index-sidecar"
  const files = [
    {
      source: path.join(source, "bin", "arkts-language-server"),
      destination: "bin/arkts-language-server",
    },
    {
      source: path.join(source, "dist", "server.cjs"),
      destination: "dist/server.cjs",
    },
    {
      source: path.join(source, "target", "release", sidecarName),
      destination: `target/release/${sidecarName}`,
    },
    {
      source: path.join(repositoryRoot, "scripts", "install-local.sh"),
      destination: "scripts/install-local.sh",
    },
    {
      source: path.join(scriptDirectory, "install-from-manifest.mjs"),
      destination: "scripts/artifact/install-from-manifest.mjs",
    },
  ]

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
