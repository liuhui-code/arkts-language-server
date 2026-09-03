import { spawn as spawnChild } from "node:child_process"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { TEST_LAYER_MANIFEST } from "../tests/support/test-layer-manifest.mjs"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export async function runNodeTestLayer({
  argv = process.argv.slice(2),
  manifest = TEST_LAYER_MANIFEST,
  spawn = spawnChild,
  stdout = process.stdout,
  cwd = projectRoot,
  nodePath = process.execPath,
} = {}) {
  const selection = parseArguments(argv, manifest)
  const selectedLayers = selection.fast
    ? manifest.layers.filter((layer) => layer.fast)
    : [manifest.layers.find((layer) => layer.id === selection.layerId)]
  const entries = stableUnique(selectedLayers.flatMap((layer) => layer.entries))
  if (entries.length === 0) throw new Error("selected test layers contain no entries")

  if (selection.list) {
    stdout.write(entries.length > 0 ? `${entries.join("\n")}\n` : "")
    return { entries, code: 0, signal: null }
  }

  const child = spawn(
    nodePath,
    ["--test", "--test-concurrency=1", ...entries],
    { cwd, stdio: "inherit" },
  )
  const { code, signal } = await childTermination(child)
  return { entries, code, signal }
}

function stableUnique(entries) {
  return [...new Set(entries)].sort(ordinalCompare)
}

function ordinalCompare(left, right) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function childTermination(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", (code, signal) => resolve({ code, signal }))
  })
}

function parseArguments(argv, manifest) {
  let fast = false
  let layerId
  let list = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--fast") {
      if (fast) throw new Error("--fast may appear only once")
      fast = true
    } else if (argument === "--layer") {
      if (layerId !== undefined) throw new Error("--layer may appear only once")
      const candidate = argv[index + 1]
      if (!candidate || candidate.startsWith("--")) {
        throw new Error("--layer requires a layer id")
      }
      layerId = candidate
      index += 1
    } else if (argument === "--list") {
      if (list) throw new Error("--list may appear only once")
      list = true
    } else {
      throw new Error(`unknown argument: ${argument}`)
    }
  }

  if (Number(fast) + Number(layerId !== undefined) !== 1) {
    throw new Error("choose exactly one selector: --fast or --layer <id>")
  }
  if (layerId !== undefined && !manifest.layers.some((layer) => layer.id === layerId)) {
    throw new Error(`unknown test layer: ${layerId}`)
  }
  return { fast, layerId, list }
}

function isMainModule() {
  return process.argv[1]
    && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
}

if (isMainModule()) {
  runNodeTestLayer().then(
    ({ code, signal }) => {
      if (signal) process.kill(process.pid, signal)
      else process.exitCode = code ?? 1
    },
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 2
    },
  )
}
