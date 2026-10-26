#!/usr/bin/env node

import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

import { readPreparedSuite } from "./prepared-suite-input.mjs"
import { preparedMemory } from "./prepared-query-report.mjs"
import { readJsonLines } from "./reference-replay-evidence.mjs"
import { projectRoot, sha256File } from "./reference-replay-input.mjs"

try {
  const options = parseOptions(process.argv.slice(2))
  const suite = await readPreparedSuite({ preparedSuite: options.manifest, out: options.out })
  const rawProbePath = `${options.out}.probe.json`
  const rawSamplesPath = `${options.out}.rss.jsonl`
  for (const file of [rawProbePath, rawSamplesPath, `${rawProbePath}.metrics.jsonl`]) {
    if (fs.existsSync(file)) throw new Error("QUERY_LAYER_RESOURCE_OUTPUT_EXISTS")
  }
  const probeScript = path.join(projectRoot, "scripts/bench/query-layer-probe.mjs")
  const probe = spawn(process.execPath, [probeScript, "--layer", options.layer,
    "--manifest", options.manifest, "--out", rawProbePath], { stdio: ["ignore", "pipe", "pipe", "ipc"] })
  const probeCompletion = completion(probe)
  const samplerScript = path.join(projectRoot, "scripts/bench/sample-process-tree-rss.mjs")
  const intervalMs = suite.runtime.sampleIntervalMs
  const sampler = spawn(process.execPath, [samplerScript, String(probe.pid), rawSamplesPath,
    String(intervalMs)], { stdio: ["ignore", "ignore", "pipe"] })
  const samplerCompletion = completion(sampler)
  let probeStderr = ""
  let samplerStderr = ""
  let failure = null
  let stoppingSampler = false
  const timeline = []
  const checkpoints = new Map()
  let activeRequest
  let interruptedAt
  let timeout
  const deadline = (phase, timeoutMs) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      failure = `QUERY_LAYER_TIMEOUT:${phase}`
      interruptedAt = performance.now()
      probe.kill("SIGTERM")
    }, timeoutMs)
  }
  deadline("driver-startup", suite.runtime.timeoutMs * 3)
  probe.on("message", message => {
    if (message?.channel === "arkts-query-layer-checkpoint") {
      const request = message.request
      if (request?.scenarioId === activeRequest?.scenarioId && request.targetId === activeRequest.targetId) {
        checkpoints.set(request.scenarioId, request)
        activeRequest = undefined
      }
      return
    }
    if (message?.channel !== "arkts-query-layer-phase" || !Number.isFinite(message.timestamp)) return
    const { channel: _channel, ...event } = message
    timeline.push(event)
    if (event.phase === "query-start") {
      activeRequest = { scenarioId: event.scenarioId, targetId: event.targetId, receivedAt: performance.now() }
    }
    deadline(event.phase, suite.runtime.timeoutMs)
  })
  probe.stdout.resume()
  probe.stderr.setEncoding("utf8")
  probe.stderr.on("data", chunk => { probeStderr = (probeStderr + chunk).slice(-32_768) })
  sampler.stderr.setEncoding("utf8")
  sampler.stderr.on("data", chunk => { samplerStderr = (samplerStderr + chunk).slice(-32_768) })
  void samplerCompletion.then(result => {
    if (!stoppingSampler && (result.code !== 0 || result.error)) {
      failure = "QUERY_LAYER_RSS_SAMPLER_FAILED"
      probe.kill("SIGTERM")
    }
  })
  const closeResult = await probeCompletion
  interruptedAt ??= performance.now()
  if (!failure && (closeResult.code !== 0 || closeResult.error)) {
    failure = `QUERY_LAYER_PROBE_EXIT:${closeResult.signal ?? closeResult.error ?? closeResult.code}`
  }
  clearTimeout(timeout)
  stoppingSampler = true
  // The root has exited. Its sampler observes that exit and flushes naturally;
  // a late SIGINT can kill it after Node has removed its signal handlers.
  const samplerTimeout = setTimeout(() => sampler.kill("SIGTERM"), 5_000)
  const samplerCloseResult = await samplerCompletion
  clearTimeout(samplerTimeout)
  const samples = readJsonLines(rawSamplesPath)
  const resources = preparedMemory(samples, probe.pid, intervalMs, samplerStderr)
  const raw = fs.existsSync(rawProbePath) ? JSON.parse(fs.readFileSync(rawProbePath, "utf8")) : null
  const retainedRequests = [...checkpoints.values()]
  if (activeRequest) {
    const scenario = suite.scenarios.find(item => item.id === activeRequest.scenarioId)
    const target = suite.targets.find(item => item.id === activeRequest.targetId)
    retainedRequests.push({ scenarioId: scenario.id, targetId: target.id, bucket: scenario.bucket, kind: target.kind,
      terminalStatus: failure?.startsWith("QUERY_LAYER_TIMEOUT:") ? "timeout" : "error",
      failure: failure ?? "QUERY_LAYER_PROBE_INCOMPLETE", correctness: { equal: false },
      elapsedMsLowerBound: Math.max(0, interruptedAt - activeRequest.receivedAt) })
  }
  const passed = raw?.status === "PASS" && closeResult.code === 0 && !closeResult.error
    && !failure && samplerCloseResult.code === 0 && samples.length >= 2
  const report = { ...(raw ?? { layer: options.layer, pid: probe.pid, requests: retainedRequests, inputIdentity: suite.pins,
    unexecutedScenarioIds: suite.scenarios.filter(item => !retainedRequests.some(request => request.scenarioId === item.id))
      .map(item => item.id) }),
    status: passed ? "PASS" : "FAIL", releaseEligible: false, harnessPid: process.pid,
    resources, timeline: raw?.timeline ?? timeline, rawProbePath, rawSamplesPath, closeResult, samplerCloseResult,
    failure, probeStderr, launch: { command: process.execPath,
      args: [probeScript, "--layer", options.layer, "--manifest", options.manifest, "--out", rawProbePath] },
    runtime: suite.runtime, harnessSha256: sha256File(path.join(projectRoot, "scripts/bench/measure-query-layer.mjs")),
    probeScriptSha256: sha256File(probeScript) }
  fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" })
  process.stdout.write(`QUERY_LAYER_RESOURCE_PROBE=${report.status}\nLAYER=${options.layer}\nREPORT=${options.out}\n`)
  if (!passed) process.exitCode = 1
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}

function completion(child) {
  return new Promise(resolve => {
    child.once("error", error => resolve({ code: null, signal: null, error: error.message }))
    child.once("close", (code, signal) => resolve({ code, signal, error: null }))
  })
}

function parseOptions(args) {
  const values = new Map()
  for (let index = 0; index < args.length; index += 2) {
    if (!["--layer", "--manifest", "--out"].includes(args[index]) || !args[index + 1]
      || values.has(args[index])) throw new Error("QUERY_LAYER_RESOURCE_OPTIONS_INVALID")
    values.set(args[index], args[index + 1])
  }
  if (values.size !== 3 || !["official", "owner"].includes(values.get("--layer"))) {
    throw new Error("QUERY_LAYER_RESOURCE_OPTIONS_INVALID")
  }
  return { layer: values.get("--layer"), manifest: path.resolve(values.get("--manifest")),
    out: path.resolve(values.get("--out")) }
}
