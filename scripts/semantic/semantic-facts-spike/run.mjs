#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { digest, inputIdentity, readJson, readOracleSources, readQueries, readSources } from "./input.mjs"

const cli = fileURLToPath(import.meta.url)
const bulkHypotheses = new Set(["compiler-bulk-reference-groups-v3",
  "compiler-bulk-reference-groups-v4", "compiler-origin-reference-groups-v5",
  "compiler-origin-reference-groups-v6"])
const bulkUntested = ["Settings/SDK pressure", "all constructor and call shapes",
  "import and re-export chains", "no unindexed compiler-wide internal loops",
  "non-constructor symbols", "overlay freshness", "multi-target throughput and memory scaling"]
try {
  const options = parseOptions(process.argv.slice(2))
  let result
  if (options.mode === "extract") {
    result = bulkHypotheses.has(options.hypothesis)
      ? (await import("./compiler-bulk.mjs")).extractBulk(
        options.input, options.compilerArtifact, options.hypothesis)
      : (await import("./compiler.mjs")).extract(options.input, options.hypothesis)
    if (result.status === "FAIL") process.exitCode = 42
  } else if (options.mode === "oracle") {
    result = (await import("./compiler.mjs")).oracle(options.input, readQueries(options.queries))
  } else if (options.mode === "production-oracle") {
    const input = readOracleSources(options.input)
    if (input.kind !== "disk-workspace") throw new Error("production oracle requires disk-workspace input")
    result = await (await import("./production-oracle-loader.mjs"))
      .productionDiskOracle(input, readQueries(options.queries))
  } else if (options.mode === "production-extract") {
    const input = readOracleSources(options.input)
    result = await (await import("./compiler-bulk.mjs"))
      .extractProductionBulk(input, options.compilerArtifact)
    if (result.status === "FAIL") process.exitCode = 42
    if (options.out) {
      writeJson(options.out, result)
      result = { status: result.status ?? "EXTRACTED", artifactPath: options.out,
        artifactSha256: digest(fs.readFileSync(options.out)),
        hostParity: result.hostParity ?? null, productionApproved: false,
        metrics: result.metrics ?? null, failureCode: result.failureCode ?? null }
    }
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
  const artifactIdentity = options.compilerArtifact
    ? digest(fs.readFileSync(options.compilerArtifact)) : undefined
  const assertUnchanged = () => {
    if (sourceIdentity !== inputIdentity(readSources(options.input).files)
      || queryIdentity !== digest(JSON.stringify(readQueries(options.queries)))
      || (artifactIdentity && artifactIdentity !== digest(fs.readFileSync(options.compilerArtifact)))) {
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
  const extraction = child(["--mode", "extract", "--input", options.input,
    ...(options.hypothesis ? ["--hypothesis", options.hypothesis] : []),
    ...(options.compilerArtifact ? ["--compiler-artifact", options.compilerArtifact] : [])],
  { allowFailure: bulkHypotheses.has(options.hypothesis) })
  assertUnchanged()
  if (extraction.status === "FAIL") {
    const report = { schemaVersion: 1, ...extraction, productionApproved: false,
      ...(["compiler-bulk-reference-groups-v4", "compiler-origin-reference-groups-v5",
        "compiler-origin-reference-groups-v6"].includes(options.hypothesis)
        ? { s02Gate: "NOT_MET", untested: bulkUntested } : {}),
      inputSha256: sourceIdentity, queriesSha256: queryIdentity,
      compilerArtifactSha256: artifactIdentity, plannedQueries: planned.length,
      environment: environment() }
    writeJson(reportPath, report)
    return report
  }
  if (extraction.facts.inputSha256 !== sourceIdentity) throw new Error("input changed during extraction")
  writeJson(factsPath, extraction.facts)
  const factsIdentity = digest(JSON.stringify(extraction.facts))
  const consumer = child(["--mode", "query", "--facts", factsPath, "--queries", options.queries])
  assertUnchanged()
  const oracle = child(["--mode", "oracle", "--input", options.input, "--queries", options.queries])
  assertUnchanged()
  const compilerCompatible = bulkHypotheses.has(options.hypothesis)
    ? oracle.compiler.runtimeSha256 === extraction.facts.compiler.stockRuntimeSha256
      && oracle.compiler.runtimeVersion === extraction.facts.compiler.runtimeVersion
      && extraction.facts.compiler.artifactSha256 === artifactIdentity
    : JSON.stringify(oracle.compiler) === JSON.stringify(extraction.facts.compiler)
  if (oracle.inputSha256 !== sourceIdentity || oracle.queriesSha256 !== queryIdentity
    || consumer.queriesSha256 !== queryIdentity || consumer.factsSha256 !== factsIdentity
    || digest(JSON.stringify(readJson(factsPath))) !== factsIdentity
    || !compilerCompatible) {
    throw new Error("input changed between extraction, consumer and oracle")
  }
  const { compareAnswers } = await import("./consumer.mjs")
  const differences = compareAnswers(consumer.answers, oracle.answers, planned.map(({ id }) => id))
  const diagnosticsValid = extraction.metrics.errorDiagnostics === 0
  const nonBulk = options.hypothesis === "compiler-bulk-reference-groups-v3"
    ? extraction.metrics.internalGroupQueries > 0
    : ["compiler-bulk-reference-groups-v4", "compiler-origin-reference-groups-v5",
      "compiler-origin-reference-groups-v6"]
      .includes(options.hypothesis)
      && (extraction.metrics.internalGroupQueries !== 0
        || extraction.metrics.perTargetFullFileScans !== 0
        || extraction.metrics.sharedWorklistPasses !== 1)
  const report = {
    schemaVersion: 1,
    status: !diagnosticsValid ? "ENVIRONMENT_BLOCKED" : differences.length || nonBulk ? "FAIL" : "SLICE_PASS",
    ...(nonBulk ? { failureCode: "NON_BULK", s02Gate: "NOT_MET",
      explanation: ["compiler-bulk-reference-groups-v4", "compiler-origin-reference-groups-v5",
        "compiler-origin-reference-groups-v6"]
        .includes(options.hypothesis)
        ? "hook did not prove one shared worklist without per-constructor whole-file scans"
        : "shared name-table indexing still invokes compiler reference grouping per constructor" } : {}),
    ...(["compiler-bulk-reference-groups-v4", "compiler-origin-reference-groups-v5",
      "compiler-origin-reference-groups-v6"].includes(options.hypothesis)
      ? { s02Gate: "NOT_MET" } : {}),
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
    untested: bulkHypotheses.has(options.hypothesis)
      ? bulkUntested
      : options.hypothesis === "resolved-signature-explicit-constructor-v2"
      ? ["implicit/default constructor projection", "constructor overload normalization",
        "ambiguous/failed signature resolution",
        "modified constructor equivalence", "new-expression cursor projection",
        "broader new this/super/own-constructor combinations", "Settings/SDK pressure",
        "non-constructor inheritance/override", "implementations", "augmentation", "Unicode/overlay freshness"]
      : ["Settings/SDK pressure", "full new this/super/own-constructor barrier coverage", "inheritance/override",
        "implementations", "augmentation", "Unicode/overlay freshness"],
  }
  writeJson(path.join(options.out, "consumer.json"), consumer)
  writeJson(path.join(options.out, "oracle.json"), oracle)
  writeJson(reportPath, report)
  return report
}

function environment() {
  const root = path.resolve(path.dirname(cli), "../../..")
  const tooling = [cli, ...["compiler.mjs", "compiler-bulk.mjs", "build-bulk-hook.mjs",
    "build-worklist-hook.mjs", "consumer.mjs", "input.mjs"].map((file) => (
    path.join(path.dirname(cli), file)
  )).filter((file) => fs.existsSync(file)),
  path.join(root, "scripts/semantic/ohos-typescript-spike/backend-host.mjs")]
  return { node: process.version, platform: process.platform, arch: process.arch,
    osRelease: os.release(), logicalCpus: os.cpus().length, physicalMemoryBytes: os.totalmem(),
    repositoryHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    worktreeStatus: execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(),
    toolingSha256: digest(JSON.stringify(tooling.map((file) => [path.relative(root, file),
      digest(fs.readFileSync(file))]))),
    host: "existing createSpikeProject; ETS ScriptKind; ES2021/ESNext/NodeJs; no SDK; standard libs loaded",
    productionIntegration: "none; standalone spike" }
}

function child(args, { allowFailure = false } = {}) {
  const started = process.hrtime.bigint()
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024,
  })
  if (result.status !== 0 && !(allowFailure && result.status === 42)) {
    throw new Error(`spike child failed (${result.status}): ${result.error?.message ?? result.stderr}`)
  }
  const response = JSON.parse(result.stdout)
  if (result.status === 42 && response.status !== "FAIL") {
    throw new Error("spike child returned failure exit without a failure report")
  }
  return { ...response, childElapsedMs: Number(process.hrtime.bigint() - started) / 1e6 }
}

function parseOptions(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]?.replace(/^--/u, "")
    const value = args[index + 1]
    const key = name === "compiler-artifact" ? "compilerArtifact" : name
    if (!args[index]?.startsWith("--") || !["mode", "input", "facts", "queries", "out", "hypothesis", "compiler-artifact"].includes(name)
      || !value || options[key]) throw new Error(usage())
    options[key] = name === "mode"
      || name === "hypothesis" ? value : path.resolve(value)
  }
  const required = { extract: ["input"], oracle: ["input", "queries"],
    "production-oracle": ["input", "queries"],
    "production-extract": ["input"],
    query: ["facts", "queries"], run: ["input", "queries", "out"] }[options.mode]
  if (!required || required.some((key) => !options[key])
    || Object.keys(options).some((key) => key !== "mode" && key !== "hypothesis"
      && key !== "compilerArtifact" && !required.includes(key)
      && !(options.mode === "production-extract" && key === "out"))
    || (options.hypothesis && (!["extract", "run"].includes(options.mode)
      || !["resolved-signature-explicit-constructor-v2", ...bulkHypotheses]
        .includes(options.hypothesis)))
    || (options.mode === "production-extract"
      ? !options.compilerArtifact || Boolean(options.hypothesis)
      : bulkHypotheses.has(options.hypothesis) !== Boolean(options.compilerArtifact))) {
    throw new Error(usage())
  }
  return options
}

function usage() {
  return "semantic-facts spike: --mode extract|oracle|production-oracle|production-extract|query|run with --input/--facts, --queries and --out as applicable; production-extract requires --compiler-artifact; extract/run may use --hypothesis resolved-signature-explicit-constructor-v2 or compiler-bulk-reference-groups-v3|v4 or compiler-origin-reference-groups-v5|v6 with --compiler-artifact"
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}
