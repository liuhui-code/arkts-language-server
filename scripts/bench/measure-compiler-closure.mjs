#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { LspSession } from "../../tests/support/lsp-session.mjs"
import { completeLogEvents } from "../../tests/support/complete-log-events.mjs"
import { createClosureFixture, fixtureDigest } from "./closure-baseline-fixture.mjs"
import { readClosureObservation, comparableClosureVariant, snapshotClosureArtifacts, closureArtifactsUnchanged, closureBaselineStatus } from "./closure-observation-report.mjs"
import { writeObservedWorker } from "./closure-observer-transform.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
try {
  const options = parseOptions(process.argv.slice(2))
  fs.mkdirSync(options.out) // Never overwrite evidence or reuse accumulated trace output.
  const fixture = createClosureFixture(options.out, options)
  const worker = path.join(root, "dist/semantic-worker.cjs")
  const observedWorker = path.join(options.out, "observed-worker.cjs")
  writeObservedWorker(worker, observedWorker, path.join(root, "scripts/bench/closure-observer.cjs"), { io: options.io === "on" })
  const artifactPaths = { server: path.join(root, "dist/server.cjs"), worker, observedWorker, sidecar: sidecar(),
    observer: path.join(root, "scripts/bench/closure-observer.cjs"), preload: path.join(root, "scripts/bench/closure-observer-preload.cjs"),
    runner: fileURLToPath(import.meta.url), fixture: path.join(root, "scripts/bench/closure-baseline-fixture.mjs"),
    transform: path.join(root, "scripts/bench/closure-observer-transform.mjs"), reportHelper: path.join(root, "scripts/bench/closure-observation-report.mjs") }
  const artifacts = snapshotClosureArtifacts(artifactPaths)
  const before = fixtureDigest(options.out)
  const report = { schema: "arkts.compiler-closure-baseline", schemaVersion: 1, releaseEligible: false,
    platform: process.platform, arch: process.arch, node: process.version, syntheticSdk: true, ioObservation: options.io === "on",
    scenario: { files: options.files, imports: options.imports, fields: options.fields, edges: options.edges, groups: options.groups },
    deadlines: { request: 30_000, preparation: 180_000, global: 120_000 },
    inputSha256: before, inputUnchanged: false,
    artifacts, variants: [],
    limitations: ["Synthetic Linux/Windows-host run, not the user's project or SDK", "Observer overhead is not a performance improvement",
      "Program sources are not root membership", "No heap ownership or whole-process-tree memory attribution",
      "Exact repeated builds and failure responses are preserved; no product-policy changes"] }
  for (const mode of options.mode === "pair" ? ["off", "on"] : [options.mode]) {
    report.variants.push(await runVariant(mode, options, fixture, worker, observedWorker, artifacts))
  }
  report.inputUnchanged = before === fixtureDigest(options.out)
  report.artifactsUnchanged = closureArtifactsUnchanged(artifactPaths, artifacts)
  report.payloadParity = report.variants.length === 2
    ? isDeepStrictEqual(comparableClosureVariant(report.variants[0]), comparableClosureVariant(report.variants[1])) : null
  report.status = closureBaselineStatus(report)
  fs.writeFileSync(path.join(options.out, "report.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" })
  process.stdout.write(JSON.stringify({ status: report.status, inputUnchanged: report.inputUnchanged, payloadParity: report.payloadParity }) + "\n")
  if (report.status !== "PASS") process.exitCode = 2
} catch (error) { process.stderr.write(String(error.stack ?? error) + "\n"); process.exitCode = 1 }

async function runVariant(mode, options, fixture, worker, observedWorker, artifacts) {
  const directory = path.join(options.out, mode)
  fs.mkdirSync(directory)
  const trace = path.join(directory, "compiler.ndjson"), log = path.join(directory, "logs/server.log")
  if (mode === "on" && options["trace-sink"] === "directory") fs.mkdirSync(trace)
  const clear = Object.fromEntries(Object.keys(process.env).filter(key => key.startsWith("ARKTS_")).map(key => [key, undefined]))
  const uri = pathToFileURL(path.join(fixture.workspace, fixture.main)).href
  const rootUri = pathToFileURL(fixture.workspace).href
  const session = new LspSession({ command: process.execPath, args: [path.join(root, "dist/server.cjs"), "--stdio"],
    cwd: root, rootUri, env: { ...clear, NODE_OPTIONS: mode === "on"
      ? `--require=${JSON.stringify(path.join(root, "scripts/bench/closure-observer-preload.cjs"))}` : undefined,
      ARKTS_CLOSURE_IO: options.io === "on" ? "1" : undefined, ARKTS_CLOSURE_WORKER: worker, ARKTS_CLOSURE_WORKER_SHA256: artifacts.workerSha256,
      ARKTS_CLOSURE_OBSERVED_SHA256: artifacts.observedWorkerSha256,
      ARKTS_CLOSURE_OBSERVER: path.join(root, "scripts/bench/closure-observer.cjs"), ARKTS_CLOSURE_OBSERVER_SHA256: artifacts.observerSha256,
      ARKTS_CLOSURE_OBSERVED_WORKER: observedWorker, ARKTS_CLOSURE_TRACE: trace,
      ARKTS_CLOSURE_WORKSPACE: fixture.workspace, ARKTS_CLOSURE_SDK: fixture.sdk,
      ARKLINE_HARMONY_SDK_PATH: fixture.sdk, DEVECO_SDK_HOME: fixture.sdk,
      ARKTS_LSP_LOG_DIR: path.dirname(log), ARKTS_INDEX_CACHE_DIR: path.join(directory, "cache"),
      ARKTS_INDEX_SIDECAR_PATH: sidecar() } })
  const result = { mode, definitions: [] }
  try {
    const start = performance.now()
    await session.initialize({ initializationOptions: { sdk: { path: fixture.sdk } }, timeoutMs: 10_000 })
    const prepared = await session.transport.notification("arkts/semanticPreparation", message => ["complete", "failed"].includes(message.params.phase), 190_000)
    result.preparationMs = performance.now() - start
    result.preparation = redact(prepared.params.report ?? { phase: prepared.params.phase }, fixture)
    // Status is a real public read, not a sampling call to getProgram().
    result.status = redact(await session.request("arkts/semanticReadiness", { rootUri, prepare: false }, { timeoutMs: 190_000 }), fixture)
    for (let i = 0; i < 2; i++) {
      const began = performance.now()
      const response = await session.request("textDocument/definition", { textDocument: { uri }, position: fixture.position }, { timeoutMs: 195_000 })
      const payload = redact(response, fixture)
      const expected = [{ uri: "<workspace>/" + fixture.target, range: { start: { line: 0, character: 13 }, end: { line: 0, character: 19 } } }]
      result.definitions.push({ elapsedMs: performance.now() - began, payload, exact: isDeepStrictEqual(payload.result, expected) })
    }
  } catch (error) { result.failure = { name: error.name, message: redact(error.message, fixture) } }
  finally { result.closed = await session.close({ timeoutMs: 5000 }).catch(error => ({ error: redact(error.message, fixture) })) }
  const events = completeLogEvents(log)
  result.workerStarts = events.filter(event => event.event === "semantic.worker.started").length
  result.watchdog = events.filter(event => event.event === "semantic.worker.unresponsive")
    .map(({ ts, reason, method, epoch, commandId, commandEpoch, phase, elapsedMs, limitMs, programStarts, programReturns, checkerStarts, checkerReturns }) =>
      ({ ts, reason, method, epoch, commandId, commandEpoch, phase, elapsedMs, limitMs, programStarts, programReturns, checkerStarts, checkerReturns }))
  result.observation = mode === "off" ? { status: "disabled" } : readClosureObservation(trace)
  return result
}
function redact(value, fixture) {
  const replacements = [[pathToFileURL(fixture.workspace).href, "<workspace>"], [pathToFileURL(fixture.sdk).href, "<sdk>"],
    [fixture.workspace, "<workspace>"], [fixture.sdk, "<sdk>"]]
  const visit = item => typeof item === "string" ? replacements.reduce((s, [from, to]) => s.split(from).join(to), item)
    : Array.isArray(item) ? item.map(visit) : item && typeof item === "object"
      ? Object.fromEntries(Object.entries(item).map(([key, val]) => [key, visit(val)])) : item
  return visit(value)
}
function sidecar() { return path.join(root, "target/release", process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar") }
function parseOptions(args) {
  const options = { files: 23787, imports: 6000, fields: 0, edges: 0, groups: 0, mode: "pair", io: "off", "trace-sink": "file" }
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, ""), value = args[i + 1]
    if (!["out", "files", "imports", "fields", "edges", "groups", "mode", "io", "trace-sink"].includes(key) || value === undefined) throw Error("Invalid closure baseline option")
    options[key] = ["out", "mode", "io", "trace-sink"].includes(key) ? value : Number(value)
  }
  if (!["on", "off"].includes(options.io)) throw Error("Invalid --io")
  if (!["file", "directory"].includes(options["trace-sink"])) throw Error("Invalid --trace-sink")
  if (!options.out || !["pair", "on", "off"].includes(options.mode)) throw Error("--out and a valid --mode are required")
  for (const key of ["files", "imports", "fields", "edges", "groups"]) if (!Number.isSafeInteger(options[key]) || options[key] < 0) throw Error("Invalid " + key)
  if (options.files < 2 || options.files > 50000 || options.imports > options.files - 2 || options.fields > 100 || options.edges > 20) throw Error("Synthetic fixture exceeds bounded limits")
  if (options.groups > 20 || options.groups > 0 && (options.files !== options.groups * 2 || options.imports !== 0)) throw Error("Groups require two sources per module and zero extra imports")
  options.out = path.resolve(options.out)
  return options
}
