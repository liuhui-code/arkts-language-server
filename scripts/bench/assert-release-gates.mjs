#!/usr/bin/env node

import fs from "node:fs"
import { evaluateProductMemoryGates } from "./product-memory-gates.mjs"

try {
  const paths = parseArguments(process.argv.slice(2))
  const server = readJson(paths.server, "server evidence")
  const deveco = readJson(paths.deveco, "DevEco evidence")
  const gates = readJson(paths.gates, "release gates")
  const result = evaluateProductMemoryGates(server, deveco, gates)
  process.stdout.write(`MEMORY_RELEASE_GATE=${result.memory ? "PASS" : "FAIL"}\n`)
  process.stdout.write(`SEMANTIC_CORRECTNESS_GATE=${result.correctness ? "PASS" : "FAIL"}\n`)
  if (!result.memory || !result.correctness) process.exitCode = 1
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}

function parseArguments(args) {
  const values = new Map()
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (!flag?.startsWith("--") || value === undefined || values.has(flag)) usage()
    values.set(flag, value)
  }
  const expected = ["--server", "--deveco", "--gates"]
  if (values.size !== 3 || expected.some((flag) => !values.has(flag))) usage()
  return {
    server: values.get("--server"),
    deveco: values.get("--deveco"),
    gates: values.get("--gates"),
  }
}

function usage() {
  throw new Error("usage: assert-release-gates.mjs --server FILE --deveco FILE --gates FILE")
}

function readJson(filePath, label) {
  const source = fs.readFileSync(filePath)
  if (source.byteLength > 1024 * 1024) throw new Error(`${label} exceeded 1 MiB`)
  try {
    return JSON.parse(source.toString("utf8"))
  } catch {
    throw new Error(`${label} must be valid JSON`)
  }
}
