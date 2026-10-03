#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { digest, inputIdentity, readJson, readQueries, readSources } from "./input.mjs"

const cli = fileURLToPath(import.meta.url)
try {
  const options = parseOptions(process.argv.slice(2))
  let result
  if (options.mode === "extract") {
    result = (await import("./compiler.mjs")).extract(options.input)
  } else if (options.mode === "oracle") {
    result = (await import("./compiler.mjs")).oracle(options.input, readQueries(options.queries))
  } else if (options.mode === "query") {
    result = (await import("./consumer.mjs")).queryFacts(readJson(options.facts), readQueries(options.queries))
  } else {
    result = await runExperiment(options)
    if (result.status !== "SLICE_PASS") process.exitCode = 42
  }
  process.stdout.write(`${JSON.stringify(result)}\n`)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}

async function runExperiment(options) {
  const sourceIdentity = inputIdentity(readSources(options.input).files)
  const planned = readQueries(options.queries)
  const queryIdentity = digest(JSON.stringify(planned))
  const assertUnchanged = () => {
    if (sourceIdentity !== inputIdentity(readSources(options.input).files)
      || queryIdentity !== digest(JSON.stringify(readQueries(options.queries)))) {
      throw new Error("input changed during experiment; retaining partial evidence without PASS")
    }
  }
  fs.mkdirSync(options.out, { recursive: true })
  const factsPath = path.join(options.out, "facts.json")
  const reportPath = path.join(options.out, "report.json")
  for (const file of [factsPath, reportPath, path.join(options.out, "oracle.json"),
    path.join(options.out, "consumer.json")]) {
    if (fs.existsSync(file)) throw new Error(`refusing to overwrite evidence: ${file}`)
  }
  // Queries are NEVER passed into extraction. spawnSync return establishes process exit.
  const extraction = child(["--mode", "extract", "--input", options.input])
  assertUnchanged()
  if (extraction.facts.inputSha256 !== sourceIdentity) throw new Error("input changed during extraction")
  writeJson(factsPath, extraction.facts)
  const factsIdentity = digest(JSON.stringify(extraction.facts))
  const consumer = child(["--mode", "query", "--facts", factsPath, "--queries", options.queries])
  assertUnchanged()
  const oracle = child(["--mode", "oracle", "--input", options.input, "--queries", options.queries])
  assertUnchanged()
  if (oracle.inputSha256 !== sourceIdentity || oracle.queriesSha256 !== queryIdentity
    || consumer.queriesSha256 !== queryIdentity || consumer.factsSha256 !== factsIdentity
    || digest(JSON.stringify(readJson(factsPath))) !== factsIdentity
    || JSON.stringify(oracle.compiler) !== JSON.stringify(extraction.facts.compiler)) {
    throw new Error("input changed between extraction, consumer and oracle")
  }
  const { compareAnswers } = await import("./consumer.mjs")
  const differences = compareAnswers(consumer.answers, oracle.answers, planned.map(({ id }) => id))
  const diagnosticsValid = extraction.metrics.errorDiagnostics === 0
  const report = {
    schemaVersion: 1, status: !diagnosticsValid ? "ENVIRONMENT_BLOCKED" : differences.length ? "FAIL" : "SLICE_PASS",
    hypothesis: extraction.facts.hypothesis, productionApproved: false,
    inputSha256: extraction.facts.inputSha256,
    queriesSha256: queryIdentity, plannedQueries: planned.length,
    factsSha256: factsIdentity,
    environment: environment(),
    compiler: extraction.facts.compiler,
    extraction: { ...extraction.metrics, processExitedBeforeQuery: true,
      childElapsedMs: extraction.childElapsedMs,
      artifactBytes: fs.statSync(factsPath).size },
    consumer: { ...consumer.metrics, childElapsedMs: consumer.childElapsedMs },
    oracle: { ...oracle.metrics, childElapsedMs: oracle.childElapsedMs },
    answers: consumer.answers, differences,
    untested: ["Settings/SDK pressure", "full new this/super/own-constructor barrier coverage", "inheritance/override",
      "implementations", "augmentation", "Unicode/overlay freshness"],
  }
  writeJson(path.join(options.out, "consumer.json"), consumer)
  writeJson(path.join(options.out, "oracle.json"), oracle)
  writeJson(reportPath, report)
  return report
}

function environment() {
  const root = path.resolve(path.dirname(cli), "../../..")
  const tooling = [cli, ...["compiler.mjs", "consumer.mjs", "input.mjs"].map((file) => (
    path.join(path.dirname(cli), file)
  )), path.join(root, "scripts/semantic/ohos-typescript-spike/backend-host.mjs")]
  return { node: process.version, platform: process.platform, arch: process.arch,
    osRelease: os.release(), logicalCpus: os.cpus().length, physicalMemoryBytes: os.totalmem(),
    repositoryHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    worktreeStatus: execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(),
    toolingSha256: digest(JSON.stringify(tooling.map((file) => [path.relative(root, file),
      digest(fs.readFileSync(file))]))),
    host: "existing createSpikeProject; ETS ScriptKind; ES2021/ESNext/NodeJs; no SDK; standard libs loaded",
    productionIntegration: "none; standalone spike" }
}

function child(args) {
  const started = process.hrtime.bigint()
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(`spike child failed (${result.status}): ${result.error?.message ?? result.stderr}`)
  }
  return { ...JSON.parse(result.stdout), childElapsedMs: Number(process.hrtime.bigint() - started) / 1e6 }
}

function parseOptions(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]?.replace(/^--/u, "")
    const value = args[index + 1]
    if (!args[index]?.startsWith("--") || !["mode", "input", "facts", "queries", "out"].includes(name)
      || !value || options[name]) throw new Error(usage())
    options[name] = name === "mode" ? value : path.resolve(value)
  }
  const required = { extract: ["input"], oracle: ["input", "queries"],
    query: ["facts", "queries"], run: ["input", "queries", "out"] }[options.mode]
  if (!required || required.some((key) => !options[key])
    || Object.keys(options).some((key) => key !== "mode" && !required.includes(key))) throw new Error(usage())
  return options
}

function usage() {
  return "semantic-facts spike: --mode extract|oracle|query|run with --input/--facts, --queries and --out as applicable"
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}
