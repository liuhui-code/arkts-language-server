#!/usr/bin/env node

import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import vm from "node:vm"
import { pathToFileURL } from "node:url"
import { isDeepStrictEqual, promisify } from "node:util"

import { capturePreparedIdentity, isPreparedPayloadKind, loadPreparedOracle, readPreparedSuite } from "./prepared-suite-input.mjs"
import { comparableLocations } from "./reference-location-oracle.mjs"
import { checkPreparedPayload } from "./prepared-query-report.mjs"
import { isCallFollowup, selectCallItem } from "./prepared-edit-call.mjs"
import { applyTextEdits } from "../../tests/support/lsp-edits.mjs"
import { observeInputOperations } from "./query-layer-input-observer.mjs"
import { observeWorkerInputs } from "./query-layer-worker-observer.mjs"
import { observeCompilerObjects, wrapCompilerForObservation } from "./query-layer-compiler-observer.mjs"

try {
  const options = parseOptions(process.argv.slice(2))
  const suite = await readPreparedSuite({ preparedSuite: options.manifest, out: options.out })
  for (const key of Object.keys(process.env)) if (key.startsWith("ARKTS_")) delete process.env[key]
  Object.assign(process.env, suite.runtime.env)
  const require = createRequire(import.meta.url)
  const compiler = require("typescript")
  const compilerBytes = fs.readFileSync(require.resolve("typescript"))
  const compilerPackage = fs.readFileSync(require.resolve("typescript/package.json"))
  const identity = { packageVersion: JSON.parse(compilerPackage.toString("utf8")).version,
    compilerSha256: sha256(compilerBytes), packageSha256: sha256(compilerPackage) }
  const timeline = []
  const compilerObserver = options.observeInputs && options.layer === "official" ? observeCompilerObjects() : undefined
  let inputObserver
  const capture = { calls: 0, targetQueryCalls: 0, mark(phase, details = {}) {
    const { request, ...phaseDetails } = details
    inputObserver?.mark(phase, phaseDetails)
    compilerObserver?.mark(phase, phaseDetails)
    const event = { ...phaseDetails, phase, timestamp: Date.now(), monotonicMs: performance.now() }
    timeline.push(event)
    if (request && process.send) {
      process.send({ channel: "arkts-query-layer-checkpoint", request: checkRequest(request) })
    }
    process.send?.({ channel: "arkts-query-layer-phase", ...event })
  } }
  const wrapped = wrapCompilerForObservation(compiler, compilerObserver, capture)
  const entry = path.resolve(`scripts/bench/query-layer-${options.layer}-entry.ts`)
  const buildOptions = { entryPoints: [entry], bundle: true, write: false,
    platform: "node", format: "cjs", target: "node20", external: ["typescript"],
    define: { ARKTS_COMPILER_ARTIFACT_IDENTITY: JSON.stringify(identity) } }
  // A separate builder must finish/reap before the measured process owns a Program.
  const builder = 'const {build,stop}=require("esbuild"); build(JSON.parse(process.argv[1]))'
    + '.then(async result=>{if(result.outputFiles.length!==1)throw new Error("QUERY_LAYER_DRIVER_INCOMPLETE");'
    + 'process.stdout.write(result.outputFiles[0].text);await stop()})'
    + '.catch(error=>{process.stderr.write(error.message+"\\n");process.exitCode=1})'
  const { stdout: code } = await promisify(execFile)(process.execPath, ["-e", builder, JSON.stringify(buildOptions)],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
  const module = { exports: {} }
  const workerObserver = options.observeInputs && options.layer === "owner"
    ? await observeWorkerInputs(options.out, suite.server, identity) : undefined
  vm.compileFunction(code, ["require", "module", "exports", "__filename", "__dirname"], { filename: entry })(
    specifier => specifier === "typescript" ? wrapped : specifier === "node:worker_threads" && workerObserver
      ? workerObserver.module : require(specifier), module, module.exports, entry, path.dirname(entry))
  const overlays = new Map()
  const versions = new Map()
  const scenarios = suite.scenarios.map(scenario => {
    const target = suite.targets.find(item => item.id === scenario.targetId)
    let resolvedOverlay
    if (scenario.edit) {
      const filePath = path.resolve(suite.workspace, scenario.edit.file)
      const uri = pathToFileURL(filePath).href
      const text = applyTextEdits(overlays.get(uri) ?? fs.readFileSync(filePath, "utf8"), scenario.edit.changes)
      const version = (versions.get(uri) ?? 1) + 1
      overlays.set(uri, text)
      versions.set(uri, version)
      resolvedOverlay = { path: filePath, text, version }
    }
    const expected = loadPreparedOracle(scenario.edit?.oracle?.path ?? target.oracle.path, target.kind, suite.workspace, overlays)
    return { ...scenario, resolvedOverlay, expected, overlays: new Map(overlays) }
  })
  const preparedCalls = new Map()
  const checkedRequests = new Map()
  const checkRequest = request => {
    if (checkedRequests.has(request)) return checkedRequests.get(request)
    const checked = compareRequest(request)
    checkedRequests.set(request, checked)
    return checked
  }
  function compareRequest(request) {
    const scenario = scenarios.find(item => item.id === request.scenarioId)
    const target = suite.targets.find(item => item.id === request.targetId)
    if (request.failure) return { ...request, kind: target.kind, correctness: { equal: false } }
    if (isPreparedPayloadKind(target.kind)) {
      const sourceItem = isCallFollowup(target.kind)
        ? selectCallItem(preparedCalls.get(target.callHierarchyTargetId), target.callHierarchySelector) : undefined
      const correctness = checkPreparedPayload(request.payload, scenario.expected, sourceItem,
        { workspace: suite.workspace, overlays: scenario.overlays, sourceUri: pathToFileURL(path.join(suite.workspace, target.file)).href })
      if (target.kind === "prepareCallHierarchy") preparedCalls.set(target.id, request.payload)
      return { ...request, kind: target.kind, correctness }
    }
    const locations = comparableLocations(request.locations.map(location => ({
      uri: pathToFileURL(path.join(suite.workspace, location.file)).href, range: location.range,
    })), suite.workspace)
    return { ...request, kind: target.kind, locations, correctness: { equal: isDeepStrictEqual(locations, scenario.expected.locations) } }
  }
  const run = options.layer === "official" ? module.exports.runOfficialLayer : module.exports.runOwnerLayer
  const observerSha256 = options.observeInputs
    ? sha256(fs.readFileSync(new URL("./query-layer-input-observer.mjs", import.meta.url))) : undefined
  inputObserver = options.observeInputs ? observeInputOperations() : undefined
  let result
  let inputOperations
  try { result = await run({ ...suite, scenarios, outputPath: options.out }, capture) }
  finally {
    if (inputObserver) inputOperations = { ...inputObserver.stop(), pid: process.pid, observerSha256 }
    inputObserver = undefined
  }
  if (workerObserver) inputOperations = { ...inputOperations,
    boundary: "OWNER_DRIVER_AND_WORKER_SYNC_INPUT_APIS",
    mainCounterScope: "owner-driver-run-synchronous-native-api-attempts",
    mainCounterExcluded: inputOperations.excluded,
    excluded: ["async-fs", "child-processes", "kernel-syscalls"],
    workerPreloadSha256: sha256(fs.readFileSync(new URL("./query-layer-worker-preload.mjs", import.meta.url))),
    workerCollectorSha256: sha256(fs.readFileSync(new URL("./query-layer-worker-observer.mjs", import.meta.url))),
    workerCompilerObserverSha256: sha256(fs.readFileSync(new URL("./query-layer-compiler-observer.mjs", import.meta.url))),
    workerLifecycleObserverSha256: sha256(fs.readFileSync(new URL("./query-layer-worker-lifecycle.mjs", import.meta.url))),
    ...workerObserver.collect() }
  const requests = result.requests.map(checkRequest)
  const compilerObjects = compilerObserver ? { ...compilerObserver.snapshot(), pid: process.pid,
    observerSha256: sha256(fs.readFileSync(new URL("./query-layer-compiler-observer.mjs", import.meta.url))) } : undefined
  const postflight = await capturePreparedIdentity(suite)
  const unchanged = isDeepStrictEqual(suite.pins, postflight)
  if (!unchanged) throw new Error("QUERY_LAYER_INPUT_CHANGED")
  const report = { schema: "arkts-language-server.query-layer-probe", schemaVersion: 1,
    ...result, requests, timeline, layer: options.layer, pid: process.pid,
    ...(inputOperations ? { inputOperations } : {}),
    ...(compilerObjects ? { compilerObjects } : {}),
    unexecutedScenarioIds: scenarios.filter(scenario => !requests.some(request => request.scenarioId === scenario.id)).map(scenario => scenario.id),
    inputIdentity: suite.pins, inputIdentityUnchanged: unchanged,
    compilerIdentity: identity, driverSha256: sha256(code),
    releaseEligible: false, status: requests.every(request => request.correctness.equal)
      && compilerObjects?.complete !== false && inputOperations?.workerCompilerObservationComplete !== false ? "PASS" : "FAIL" }
  fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" })
  process.stdout.write(`QUERY_LAYER_PROBE=${report.status}\nLAYER=${options.layer}\nREPORT=${options.out}\n`)
  if (report.status !== "PASS") process.exitCode = 1
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}

function parseOptions(args) {
  const values = new Map()
  let observeInputs = false
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--observe-inputs") {
      if (observeInputs) throw new Error("QUERY_LAYER_OPTIONS_INVALID")
      observeInputs = true
      continue
    }
    if (!["--layer", "--manifest", "--out"].includes(args[index])
      || !args[index + 1] || values.has(args[index])) throw new Error("QUERY_LAYER_OPTIONS_INVALID")
    values.set(args[index], args[++index])
  }
  if (values.size !== 3 || !["official", "owner"].includes(values.get("--layer"))) throw new Error("QUERY_LAYER_OPTIONS_INVALID")
  return { layer: values.get("--layer"), manifest: path.resolve(values.get("--manifest")),
    out: path.resolve(values.get("--out")), observeInputs }
}

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex") }
