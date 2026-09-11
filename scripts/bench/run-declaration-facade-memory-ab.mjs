#!/usr/bin/env node

import { execFile, spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"

import { createProcessResourceProbe } from "../../tests/support/process-resource-probe.mjs"

const exec = promisify(execFile)
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const phaseRunner = path.join(
  projectRoot,
  "scripts",
  "semantic",
  "ets-declaration-facade-consumer-spike.mjs",
)
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024

try {
  const options = parseArguments(process.argv.slice(2))
  if (fs.existsSync(options.out)) throw new Error(`output already exists: ${options.out}`)
  const probe = await systemProbe()
  const runs = []
  for (let index = 0; index < options.runs; index += 1) {
    runs.push(await runComparison(options, probe, index))
  }
  const status = runs.every((run) => run.definitionExact && run.referencesExact)
    ? "PASS"
    : "FAIL"
  const summary = summarize(runs)
  const report = {
    schemaVersion: 1,
    status,
    measurementKind: "external-process-tree-rss",
    platform: `${os.type()} ${os.release()} ${os.arch()}`,
    compilerProcessesAreIndependent: runs.every(({ source, facade }) => source.pid !== facade.pid),
    sampleIntervalMs: options.sampleIntervalMs,
    inputs: {
      declaration: path.basename(options.declarationPath),
      consumer: path.basename(options.consumerPath),
      sdkConfigured: options.sdkRoot !== null,
    },
    summary,
    memoryGate: {
      status: summary.facadeOverSourcePeakRatio <= 0.70 ? "PASS" : "FAIL",
      requiredPeakReductionRatio: 0.30,
      observedFacadeOverSourcePeakRatio: summary.facadeOverSourcePeakRatio,
    },
    runs,
  }
  fs.mkdirSync(path.dirname(options.out), { recursive: true })
  fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" })
  process.stdout.write(
    `FACADE_MEMORY_AB=${status}\nFACADE_MEMORY_GATE=${report.memoryGate.status}\nREPORT=${options.out}\n`,
  )
  if (status !== "PASS") process.exitCode = 42
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}

async function runComparison(options, probe, index) {
  const sharedArgs = [
    "--declaration", options.declarationPath,
    "--consumer", options.consumerPath,
  ]
  if (options.sdkRoot) sharedArgs.push("--sdk", options.sdkRoot)
  if (options.line !== null) {
    sharedArgs.push("--line", String(options.line), "--character", String(options.character))
  }
  const sourcePhase = await runPhase(
    ["--mode", "source", ...sharedArgs],
    options.sampleIntervalMs,
    probe,
  )
  const ownerPath = path.resolve(
    path.dirname(options.declarationPath),
    sourcePhase.report.owner.relativeFileName,
  )
  requireFile(ownerPath, "reported owner")
  const facadePhase = await runPhase(
    [
      "--mode", "facade",
      ...sharedArgs,
      "--owner", ownerPath,
      "--owner-start", String(sourcePhase.report.owner.start),
    ],
    options.sampleIntervalMs,
    probe,
  )
  const source = sourcePhase.report.source
  const facade = facadePhase.report.facade
  return {
    index,
    definitionExact: same(source.definition, facade.definition),
    referencesExact: same(source.references, facade.references),
    source: { ...source, ...phaseEvidence(sourcePhase) },
    facade: { ...facade, ...phaseEvidence(facadePhase) },
  }
}

function phaseEvidence(phase) {
  return {
    pid: phase.report.pid,
    durationMs: phase.durationMs,
    peakRssBytes: Math.max(...phase.samples.map(({ totalRssBytes }) => totalRssBytes)),
    samples: phase.samples,
  }
}

async function runPhase(args, sampleIntervalMs, probe) {
  const startedAt = Date.now()
  const child = spawn(process.execPath, [phaseRunner, ...args], {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
  })
  let stdout = ""
  let stderr = ""
  let exit = null
  let outputExceeded = false
  child.stdout.setEncoding("utf8")
  child.stderr.setEncoding("utf8")
  child.stdout.on("data", (chunk) => {
    const collected = boundedOutput(stdout, chunk)
    stdout = collected.output
    outputExceeded ||= collected.exceeded
    if (outputExceeded) child.kill("SIGKILL")
  })
  child.stderr.on("data", (chunk) => {
    const collected = boundedOutput(stderr, chunk)
    stderr = collected.output
    outputExceeded ||= collected.exceeded
    if (outputExceeded) child.kill("SIGKILL")
  })
  const exited = new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("close", (code, signal) => {
      exit = { code, signal }
      resolve(exit)
    })
  })
  const identity = await probe.identify(child.pid)
  const samples = []
  while (!exit) {
    let sample
    try {
      sample = await probe.sample(identity)
    } catch (error) {
      if (exit || error?.code === "EPROCESS_NOT_FOUND") break
      throw error
    }
    samples.push({
      elapsedMs: sample.timestamp - startedAt,
      totalRssBytes: sample.processes.reduce((total, process) => total + process.rssBytes, 0),
      processes: sample.processes.map(({ role, pid, rssBytes }) => ({ role, pid, rssBytes })),
    })
    await Promise.race([delay(sampleIntervalMs), exited])
  }
  await exited
  if (outputExceeded) throw new Error(`query phase output exceeded ${MAX_OUTPUT_BYTES} bytes`)
  if (exit.code !== 0) {
    throw new Error(`query phase failed (${exit.code ?? exit.signal}): ${stderr.trim() || stdout.trim()}`)
  }
  if (samples.length === 0) throw new Error("query phase completed before external RSS sampling")
  return {
    report: JSON.parse(stdout),
    durationMs: Date.now() - startedAt,
    samples,
  }
}

function boundedOutput(current, chunk) {
  const next = current + chunk
  if (Buffer.byteLength(next) > MAX_OUTPUT_BYTES) {
    return { output: current, exceeded: true }
  }
  return { output: next, exceeded: false }
}

async function systemProbe() {
  if (process.platform === "darwin") {
    return createProcessResourceProbe({
      platform: "darwin",
      now: () => Date.now(),
      runPs: async ({ command, args, maxBuffer, env }) => (
        await exec(command, args, { maxBuffer, env: { ...process.env, ...env } })
      ).stdout,
    })
  }
  if (process.platform === "linux") {
    const clockTicks = Number((await exec("getconf", ["CLK_TCK"])).stdout.trim())
    return createProcessResourceProbe({
      platform: "linux",
      now: () => Date.now(),
      readFile: fs.promises.readFile,
      clockTicksPerSecond: clockTicks,
    })
  }
  throw new Error(`external RSS sampling is unsupported on ${process.platform}`)
}

function summarize(runs) {
  const sourcePeaks = runs.map(({ source }) => source.peakRssBytes)
  const facadePeaks = runs.map(({ facade }) => facade.peakRssBytes)
  const sourcePeakRssBytes = Math.max(...sourcePeaks)
  const facadePeakRssBytes = Math.max(...facadePeaks)
  return {
    sourcePeakRssBytes,
    facadePeakRssBytes,
    facadeOverSourcePeakRatio: facadePeakRssBytes / sourcePeakRssBytes,
    sourceMedianDurationMs: median(runs.map(({ source }) => source.durationMs)),
    facadeMedianDurationMs: median(runs.map(({ facade }) => facade.durationMs)),
  }
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function requireFile(fileName, label) {
  if (!fs.statSync(fileName).isFile()) throw new Error(`${label} must identify a file`)
}

function parseArguments(args) {
  const options = {
    declarationPath: null,
    consumerPath: null,
    sdkRoot: null,
    line: null,
    character: null,
    out: null,
    runs: 3,
    sampleIntervalMs: 100,
  }
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (!value) throw new Error(usage())
    if (flag === "--declaration" && !options.declarationPath) {
      options.declarationPath = path.resolve(value)
    } else if (flag === "--consumer" && !options.consumerPath) {
      options.consumerPath = path.resolve(value)
    } else if (flag === "--sdk" && !options.sdkRoot) {
      options.sdkRoot = path.resolve(value)
    } else if (flag === "--line" && options.line === null && /^\d+$/u.test(value)) {
      options.line = Number(value)
    } else if (flag === "--character" && options.character === null && /^\d+$/u.test(value)) {
      options.character = Number(value)
    } else if (flag === "--out" && !options.out) {
      options.out = path.resolve(value)
    } else if (flag === "--runs" && /^[1-9]\d*$/u.test(value)) {
      options.runs = Number(value)
    } else if (flag === "--sample-interval-ms" && /^\d+$/u.test(value)) {
      options.sampleIntervalMs = Number(value)
    } else {
      throw new Error(usage())
    }
  }
  if (!options.declarationPath || !options.consumerPath || !options.out) throw new Error(usage())
  if ((options.line === null) !== (options.character === null)) throw new Error(usage())
  if (options.runs > 20) throw new Error("--runs must not exceed 20")
  if (options.sampleIntervalMs < 10 || options.sampleIntervalMs > 1_000) {
    throw new Error("--sample-interval-ms must be between 10 and 1000")
  }
  requireFile(options.declarationPath, "declaration")
  requireFile(options.consumerPath, "consumer")
  if (options.sdkRoot && !fs.statSync(options.sdkRoot).isDirectory()) {
    throw new Error("SDK must identify a directory")
  }
  return options
}

function usage() {
  return "usage: run-declaration-facade-memory-ab.mjs --declaration <file.ets> --consumer <file.ets> --out <report.json> [--sdk <sdk-root>] [--line <0-based> --character <UTF-16>] [--runs <1-20>] [--sample-interval-ms <10-1000>]"
}
