import { spawn as spawnChild } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { withTestEvidence } from "../tests/support/test-evidence.mjs"
import { TEST_LAYER_MANIFEST } from "../tests/support/test-layer-manifest.mjs"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const runtimeReporterPath = fileURLToPath(new URL("./node-test-runtime-reporter.mjs", import.meta.url))
const MAX_RUNTIME_REPORT_BYTES = 4_096
const DENY_RUNTIME_ANNOTATIONS = Object.freeze({
  allowSkipped: false,
  allowTodo: false,
  allowCancelled: false,
})
const RUNTIME_ANNOTATION_POLICIES = Object.freeze({
  fast: DENY_RUNTIME_ANNOTATIONS,
  "artifact-e2e": DENY_RUNTIME_ANNOTATIONS,
  large: DENY_RUNTIME_ANNOTATIONS,
  default: DENY_RUNTIME_ANNOTATIONS,
})
const SAFE_EVIDENCE_TARGETS = new Set([
  "unit-contract",
  "protocol",
  "bundle-e2e",
  "artifact-e2e",
  "large",
  "real-sdk",
])

export async function runNodeTestLayer({
  argv = process.argv.slice(2),
  manifest = TEST_LAYER_MANIFEST,
  spawn = spawnChild,
  stdout = process.stdout,
  cwd = projectRoot,
  nodePath = process.execPath,
  evidenceRoot = process.env.ARKTS_TEST_EVIDENCE_ROOT,
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

  const target = evidenceTarget(selection)
  const runChild = () => runTestChild({ spawn, nodePath, entries, cwd, target })
  const { code, signal } = evidenceRoot
    ? await terminationWithEvidence({ runChild, evidenceRoot, target })
    : await runChild()
  return { entries, code, signal }
}

async function runTestChild({ spawn, nodePath, entries, cwd, target }) {
  const reportDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-node-test-runtime-"))
  const reportPath = path.join(reportDirectory, "summary.json")
  try {
    const termination = await childTermination(spawn(
      nodePath,
      [
        "--test",
        "--test-concurrency=1",
        "--test-reporter=spec",
        `--test-reporter=${runtimeReporterPath}`,
        "--test-reporter-destination=stdout",
        `--test-reporter-destination=${reportPath}`,
        ...entries,
      ],
      { cwd, stdio: "inherit" },
    ))
    if (termination.code !== 0 || termination.signal !== null) return termination

    const runtimeSummary = await readRuntimeSummary(reportPath)
    return runtimePolicyAllows(target, runtimeSummary)
      ? termination
      : { code: 1, signal: null }
  } finally {
    await fs.rm(reportDirectory, { recursive: true, force: true })
  }
}

async function readRuntimeSummary(reportPath) {
  let handle
  try {
    handle = await fs.open(reportPath, "r")
    const bytes = Buffer.alloc(MAX_RUNTIME_REPORT_BYTES + 1)
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
    if (bytesRead > MAX_RUNTIME_REPORT_BYTES) return null
    const summary = JSON.parse(bytes.subarray(0, bytesRead).toString("utf8"))
    if (summary?.schema !== "arkts-language-server.node-test-runtime"
      || summary.schemaVersion !== 1
      || !validRuntimeCounts(summary.counts)) {
      return null
    }
    return summary
  } catch {
    return null
  } finally {
    await handle?.close()
  }
}

function validRuntimeCounts(counts) {
  return [counts?.skipped, counts?.todo, counts?.cancelled]
    .every((count) => Number.isSafeInteger(count) && count >= 0)
}

function runtimePolicyAllows(target, summary) {
  if (!summary) return false
  const policy = RUNTIME_ANNOTATION_POLICIES[target]
    ?? RUNTIME_ANNOTATION_POLICIES.default
  return (policy.allowSkipped || summary.counts.skipped === 0)
    && (policy.allowTodo || summary.counts.todo === 0)
    && (policy.allowCancelled || summary.counts.cancelled === 0)
}

async function terminationWithEvidence({ runChild, evidenceRoot, target }) {
  let failedTermination
  try {
    return await withTestEvidence({
      root: evidenceRoot,
      caseId: `node-test-layer/${target}`,
      metadata: { target },
    }, async () => {
      const termination = await runChild()
      if (termination.code === 0 && termination.signal === null) return termination

      failedTermination = termination
      throw Object.assign(new Error("Node test layer failed"), termination)
    })
  } catch (error) {
    if (failedTermination) return failedTermination
    throw error
  }
}

function evidenceTarget(selection) {
  if (selection.fast) return "fast"
  return SAFE_EVIDENCE_TARGETS.has(selection.layerId) ? selection.layerId : "custom"
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
    child.once("close", (code, signal) => resolve({ code, signal }))
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
