#!/usr/bin/env node

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath, pathToFileURL } from "node:url"
import { isDeepStrictEqual } from "node:util"

import { LspSession } from "../../tests/support/lsp-session.mjs"
import { applyTextEdits } from "../../tests/support/lsp-edits.mjs"
import { capturePreparedIdentity, digestJson } from "./prepared-suite-input.mjs"
import { comparableLocations, validPosition } from "./reference-location-oracle.mjs"
import { canonicalPreparedCompletion } from "./prepared-query-report.mjs"
import { projectRoot, sha256File } from "./reference-replay-input.mjs"
import { editCallKinds, isCallFollowup, preparedRequestMethod, selectCallItem,
  validCallSelector, validateEditCallPayload } from "./prepared-edit-call.mjs"

try {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    process.stdout.write("Usage: node scripts/bench/discover-semantic-oracle.mjs --manifest <pinned.json> --out <report.json> [--compare <prior-report.json>]\n")
  } else {
    const input = await readInput(options)
    const report = await discover(input, options)
    fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" })
    process.stdout.write(`${report.payload !== undefined ? "SEMANTIC_DISCOVERY" : "IMPLEMENTATION_DISCOVERY"}=${report.status}\nLOCATIONS=${report.locations.length}\nREPORT=${options.out}\n`)
    if (!["DISCOVERED", "VERIFIED"].includes(report.status)) process.exitCode = 1
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}

function parseArguments(args) {
  const values = new Map()
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]
    if (name === "--help" && args.length === 1) return { help: true }
    if (!["--manifest", "--out", "--compare"].includes(name) || values.has(name)) {
      throw new Error(`invalid argument: ${name}`)
    }
    if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${name} requires a value`)
    values.set(name, args[index + 1])
  }
  for (const name of ["--manifest", "--out"]) if (!values.has(name)) throw new Error(`${name} is required`)
  return { manifest: path.resolve(values.get("--manifest")), out: path.resolve(values.get("--out")),
    compare: values.has("--compare") ? path.resolve(values.get("--compare")) : null }
}

async function readInput(options) {
  if (fs.existsSync(options.out)) throw new Error("DISCOVERY_BLOCKED=OUTPUT_EXISTS")
  const manifest = JSON.parse(fs.readFileSync(options.manifest, "utf8"))
  if (manifest.schemaVersion !== 1 || !manifest.benchmarkId || !manifest.pins
    || !manifest.query || (!discoveryUsesPayload(manifest.query.kind) && !manifest.knownLocation)) throw new Error("DISCOVERY_BLOCKED=INVALID_MANIFEST")
  for (const key of ["workspace", "sdk", "server", "sidecar"]) {
    if (typeof manifest[key] !== "string" || !manifest[key]) throw new Error("DISCOVERY_BLOCKED=INPUT_PATH")
    manifest[key] = path.resolve(projectRoot, manifest[key])
  }
  manifest.workspace = fs.realpathSync(manifest.workspace)
  const query = manifest.query
  if (!["implementation", "definition", "typeDefinition", "hover", "signatureHelp", "completion", "completionResolve", ...editCallKinds].includes(query.kind ?? "implementation")) throw new Error("DISCOVERY_BLOCKED=QUERY_KIND")
  if (query.kind === "rename" && (typeof query.newName !== "string" || !query.newName)) throw new Error("DISCOVERY_BLOCKED=RENAME_NAME")
  if (isCallFollowup(query.kind) && !validCallSelector(query.callHierarchySelector)) throw new Error("DISCOVERY_BLOCKED=CALL_SELECTOR")
  if (query.kind === "completionResolve") {
    const selector = query.completionSelector
    if (!selector || typeof selector.label !== "string" || !selector.label
      || Object.keys(selector).some(key => !["label", "detail", "kind"].includes(key))) throw new Error("DISCOVERY_BLOCKED=RESOLVE_SELECTOR")
  }
  const source = workspaceFile(manifest.workspace, query.file)
  const diskText = fs.readFileSync(source, "utf8")
  if (sha256File(source) !== query.sourceSha256) throw new Error("DISCOVERY_BLOCKED=SOURCE_MISMATCH")
  const overlay = manifest.overlay
  if (overlay !== undefined && (overlay?.version !== 2 || !Array.isArray(overlay.changes)
    || overlay.changes.length === 0 || overlay.sha256 !== digestJson(overlay.changes)
    || overlay.changes.some(change => typeof change.newText !== "string"))) {
    throw new Error("DISCOVERY_BLOCKED=OVERLAY_PIN")
  }
  const text = overlay ? applyTextEdits(diskText, overlay.changes) : diskText
  if (!validPosition(query.position, text.split(/\r?\n/u))) throw new Error("DISCOVERY_BLOCKED=POSITION")
  const line = text.split(/\r?\n/u)[query.position.line]
  const before = line.slice(0, query.position.character).match(/[$\p{ID_Continue}]*$/u)?.[0] ?? ""
  const after = line.slice(query.position.character).match(/^[$\p{ID_Continue}]*/u)?.[0] ?? ""
  if (before + after !== query.symbol) throw new Error("DISCOVERY_BLOCKED=SYMBOL_POSITION")
  if (!discoveryUsesPayload(query.kind)) {
    const knownFile = workspaceFile(manifest.workspace, manifest.knownLocation.file)
    if (!validRange(manifest.knownLocation.range, knownFile === source ? text : fs.readFileSync(knownFile, "utf8"))) {
      throw new Error("DISCOVERY_BLOCKED=KNOWN_LOCATION")
    }
  }
  const actualPins = await capturePreparedIdentity({ ...manifest, file: query.file })
  if (JSON.stringify(actualPins) !== JSON.stringify(manifest.pins)) {
    throw new Error("DISCOVERY_BLOCKED=PIN_MISMATCH")
  }
  if (actualPins.workspaceStatus !== "") throw new Error("DISCOVERY_BLOCKED=DIRTY_WORKSPACE")
  const runtime = { timeoutMs: 180_000, diagnosticTimeoutMs: 180_000, ...manifest.runtime }
  if (![runtime.timeoutMs, runtime.diagnosticTimeoutMs].every(value => Number.isSafeInteger(value) && value > 0)
    || Object.entries(runtime.env ?? {}).some(([key, value]) => !key.startsWith("ARKTS_") || typeof value !== "string"
      || ["ARKTS_LSP_LOG_DIR", "ARKTS_INDEX_CACHE_DIR", "ARKTS_INDEX_SIDECAR_PATH"].includes(key))) {
    throw new Error("DISCOVERY_BLOCKED=RUNTIME")
  }
  const prior = options.compare ? JSON.parse(fs.readFileSync(options.compare, "utf8")) : null
  if (prior && (prior.status !== "DISCOVERED" && prior.status !== "VERIFIED"
    || JSON.stringify(prior.inputIdentity?.pins) !== JSON.stringify(manifest.pins)
    || JSON.stringify(prior.request?.query) !== JSON.stringify(query)
    || JSON.stringify(prior.request?.overlay) !== JSON.stringify(overlay))) {
    throw new Error("DISCOVERY_BLOCKED=COMPARISON_INPUT")
  }
  return { manifest, query, source, diskText, text, runtime, prior, manifestSha256: sha256File(options.manifest) }
}

async function discover(input, options) {
  const { manifest, query, source, diskText, text, runtime, prior } = input
  const version = manifest.overlay?.version ?? 1
  const payloadKind = discoveryUsesPayload(query.kind)
  const method = preparedRequestMethod(query.kind ?? "implementation")
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-implementation-discovery-"))
  const logDir = path.join(temporary, "logs")
  const indexDir = path.join(temporary, "index")
  fs.mkdirSync(logDir)
  fs.mkdirSync(indexDir)
  const sourceUri = pathToFileURL(source).href
  const started = performance.now()
  const timeline = []
  const mark = (phase, details = {}) => timeline.push({ phase, timestamp: Date.now(),
    monotonicMs: performance.now() - started, ...details })
  const env = { ...Object.fromEntries(Object.keys(process.env).filter(key => key.startsWith("ARKTS_"))
    .map(key => [key, undefined])), ...runtime.env,
  ARKLINE_HARMONY_SDK_PATH: manifest.sdk, DEVECO_SDK_HOME: undefined,
  ARKTS_INDEX_SIDECAR_PATH: manifest.sidecar, ARKTS_INDEX_CACHE_DIR: indexDir, ARKTS_LSP_LOG_DIR: logDir }
  const session = new LspSession({ command: process.execPath, args: [manifest.server, "--stdio"],
    cwd: projectRoot, rootUri: pathToFileURL(manifest.workspace).href, env,
    capabilities: { general: { positionEncodings: ["utf-16"] },
      ...(editCallKinds.includes(query.kind)
        ? { workspace: { workspaceEdit: { documentChanges: true, failureHandling: "transactional" } } } : {}),
      textDocument: { publishDiagnostics: { versionSupport: true },
        ...(editCallKinds.includes(query.kind) ? { rename: { prepareSupport: true }, callHierarchy: {} } : {}) } } })
  const targetPid = session.transport.child.pid
  let response = null
  let sourceCompletion = null
  let sourceCallHierarchy = null
  let sourceItem
  let diagnostics = []
  let diagnosticError = null
  let failure = null
  let closeResult = null
  try {
    mark("server-process-started", { targetPid })
    await session.initialize({ initializationOptions: { sdk: { path: manifest.sdk } }, timeoutMs: runtime.timeoutMs })
    mark("initialize-response-complete")
    const diagnostic = session.transport.notification("textDocument/publishDiagnostics",
      message => message.params?.uri === sourceUri && message.params?.version === version,
      runtime.diagnosticTimeoutMs).then(message => {
      diagnostics = message.params.diagnostics
      mark("publishDiagnostics", { version, count: diagnostics.length })
    }, error => { diagnosticError = error.message; mark("diagnostic-not-observed", { error: diagnosticError }) })
    session.openDocument({ uri: sourceUri, version: 1, text: diskText })
    mark("didOpen-sent", { version: 1 })
    if (manifest.overlay) {
      session.changeDocument({ uri: sourceUri, version,
        contentChanges: manifest.overlay.changes.map(({ range, newText }) => ({ range, text: newText })) })
      mark("didChange-sent", { version, overlaySha256: manifest.overlay.sha256 })
    }
    if (query.kind === "completionResolve") {
      mark("completion-source-request-start", { method: "textDocument/completion", position: query.position })
      const sourceResponse = await session.request("textDocument/completion", {
        textDocument: { uri: sourceUri }, position: query.position,
      }, { timeoutMs: runtime.timeoutMs })
      mark("completion-source-response-complete", { error: sourceResponse.error ?? null })
      sourceCompletion = { error: sourceResponse.error ?? null, rawPayload: sourceResponse.result ?? null,
        elapsedMs: timeline.at(-1).monotonicMs - timeline.find(event => event.phase === "completion-source-request-start").monotonicMs }
      if (sourceResponse.error || typeof sourceResponse.result?.isIncomplete !== "boolean"
        || !Array.isArray(sourceResponse.result.items)) throw new Error("DISCOVERY_FAILED=COMPLETION_SOURCE")
      sourceResponse.result.items.forEach(canonicalPreparedCompletion)
      const matches = sourceResponse.result.items.filter(item => Object.entries(query.completionSelector)
        .every(([key, value]) => item[key] === value))
      if (matches.length !== 1) throw new Error("DISCOVERY_FAILED=AMBIGUOUS_OR_MISSING_ITEM")
      sourceItem = matches[0]
    }
    if (isCallFollowup(query.kind)) {
      mark("call-source-request-start", { method: "textDocument/prepareCallHierarchy", position: query.position })
      const sourceResponse = await session.request("textDocument/prepareCallHierarchy", {
        textDocument: { uri: sourceUri }, position: query.position,
      }, { timeoutMs: runtime.timeoutMs })
      mark("call-source-response-complete", { error: sourceResponse.error ?? null })
      sourceCallHierarchy = { error: sourceResponse.error ?? null, rawPayload: sourceResponse.result ?? null,
        elapsedMs: timeline.at(-1).monotonicMs - timeline.find(event => event.phase === "call-source-request-start").monotonicMs }
      if (sourceResponse.error) throw new Error("DISCOVERY_FAILED=CALL_SOURCE")
      validateEditCallPayload("prepareCallHierarchy", sourceResponse.result,
        { workspace: manifest.workspace, overlays: new Map([[sourceUri, text]]) })
      sourceItem = selectCallItem(sourceResponse.result, query.callHierarchySelector)
    }
    mark("request-start", { method, position: query.position })
    response = await session.request(method, isCallFollowup(query.kind) ? { item: sourceItem } : sourceItem ?? {
      textDocument: { uri: sourceUri }, position: query.position,
      ...(query.kind === "rename" ? { newName: query.newName } : {}),
    }, { timeoutMs: runtime.timeoutMs })
    mark("response-complete", { error: response.error ?? null })
    await diagnostic
  } catch (error) { failure = error.message; mark("failure", { message: failure }) }
  finally {
    closeResult = await session.close({ timeoutMs: 10_000 }).catch(error => ({ error: error.message }))
    mark("server-process-closed", { closeResult })
    fs.rmSync(temporary, { recursive: true, force: true })
  }
  const locations = []
  const locationErrors = []
  if (!payloadKind && Array.isArray(response?.result)) {
    for (const location of response.result) {
      try {
        const file = workspaceFileFromUri(manifest.workspace, location?.uri)
        if (!validRange(location?.range, file === source ? text : fs.readFileSync(file, "utf8"))) throw new Error("invalid UTF-16 range")
        locations.push({ uri: location.uri, range: location.range })
      } catch (error) { locationErrors.push(error.message) }
    }
  } else if (!payloadKind && !response?.error) locationErrors.push("implementation response is not Location[]")
  let payload = payloadKind ? response?.result ?? null : null
  let payloadError = null
  if (query.kind === "completion") {
    try {
      if (typeof payload?.isIncomplete !== "boolean" || !Array.isArray(payload.items)) throw new Error("invalid CompletionList")
      payload = { ...payload, items: payload.items.map(canonicalPreparedCompletion) }
    } catch (error) { payloadError = error.message }
  } else if (query.kind === "completionResolve") {
    try {
      if (!isDeepStrictEqual(payload?.data, sourceItem?.data)) throw new Error("resolve changed the source session handle")
      payload = canonicalPreparedCompletion(payload)
    } catch (error) { payloadError = error.message }
  }
  let editCallPayloadValid = false
  if (editCallKinds.includes(query.kind)) {
    try {
      validateEditCallPayload(query.kind, payload, { workspace: manifest.workspace, sourceUri, sourceItem,
        overlays: new Map([[sourceUri, text]]), versions: session.documentVersions })
      editCallPayloadValid = true
    } catch (error) { payloadError = error.message }
  }
  const payloadValid = editCallKinds.includes(query.kind) ? editCallPayloadValid : query.kind === "hover" ? payload?.contents && validRange(payload.range, text)
    && (typeof payload.contents === "string" ? payload.contents.length > 0
      : typeof payload.contents.value === "string" && payload.contents.value.length > 0)
    : query.kind === "signatureHelp" ? Array.isArray(payload?.signatures) && payload.signatures.length > 0
      && payload.signatures.every(signature => typeof signature.label === "string" && signature.label.length > 0)
      && Number.isInteger(payload.activeSignature) && payload.activeSignature >= 0 && payload.activeSignature < payload.signatures.length
      && Number.isInteger(payload.activeParameter) && payload.activeParameter >= 0
      : query.kind === "completion" && !payloadError && typeof payload?.isIncomplete === "boolean"
        && Array.isArray(payload.items) && payload.items.length > 0
        || query.kind === "completionResolve" && !payloadError && payload?.label === query.completionSelector.label
  const normalized = comparableLocations(locations, manifest.workspace)
  const duplicates = normalized.length - new Set(normalized.map(JSON.stringify)).size
  const knownIncluded = !payloadKind && normalized.some(location => JSON.stringify(location) === JSON.stringify(manifest.knownLocation))
  const comparison = prior ? { equal: payloadKind ? isDeepStrictEqual(payload, prior.payload)
    : JSON.stringify(normalized) === JSON.stringify(prior.locations),
    previousReport: options.compare } : null
  const postflightPins = await capturePreparedIdentity({ ...manifest, file: query.file })
  const inputUnchanged = JSON.stringify(postflightPins) === JSON.stringify(manifest.pins)
  const complete = !failure && !response?.error && !diagnosticError && inputUnchanged
    && (payloadKind ? payloadValid : Array.isArray(response?.result)
      && normalized.length > 0 && locationErrors.length === 0 && duplicates === 0 && knownIncluded)
  const status = complete && (!comparison || comparison.equal) ? (comparison ? "VERIFIED" : "DISCOVERED") : "FAIL"
  return { schema: query.kind && query.kind !== "implementation" ? "arkts-language-server.semantic-oracle-discovery"
    : "arkts-language-server.implementation-oracle-discovery", schemaVersion: 1, status,
    inputIdentity: { pins: manifest.pins, postflightPins, inputUnchanged,
      manifestSha256: input.manifestSha256, benchmarkId: manifest.benchmarkId },
    environment: { workspace: manifest.workspace, sdk: manifest.sdk, nodeVersion: process.version,
      platform: `${os.type()} ${os.release()} ${os.arch()}`, targetPid,
      launch: { command: process.execPath, args: [manifest.server, "--stdio"] },
      effectiveArktsFlags: runtime.env ?? {}, sidecar: manifest.sidecar },
    request: { method, query, ...(manifest.overlay ? { overlay: manifest.overlay } : {}),
      ...(sourceCompletion || sourceCallHierarchy ? { preparatoryTargetQueries: 1 } : {}),
      elapsedMs: timeline.find(event => event.phase === "response-complete")?.monotonicMs
      - timeline.find(event => event.phase === "request-start")?.monotonicMs },
    response: { error: response?.error ?? null, rawLocations: payloadKind ? null : response?.result ?? null,
      ...(payloadKind ? { rawPayload: response?.result ?? null } : {}) }, locations: normalized,
    ...(payloadKind ? { payload, payloadError } : {}),
    ...(sourceCompletion ? { sourceCompletion } : {}),
    ...(sourceCallHierarchy ? { sourceCallHierarchy } : {}),
    diagnostics: diagnosticError ? [{ error: diagnosticError }] : [{ uri: sourceUri,
      version, diagnostics }], knownLocation: payloadKind ? null : { ...manifest.knownLocation, included: knownIncluded },
    comparison, locationErrors, duplicates, timeline, closeResult, failure,
    transcript: session.transport.diagnosticSnapshot() }
}

function discoveryUsesPayload(kind) {
  return ["hover", "signatureHelp", "completion", "completionResolve", ...editCallKinds].includes(kind)
}

function workspaceFile(workspace, relative) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative) || relative.includes("\\")) {
    throw new Error("DISCOVERY_BLOCKED=SOURCE_PATH")
  }
  const root = fs.realpathSync(workspace)
  const file = fs.realpathSync(path.resolve(root, relative))
  const within = path.relative(root, file)
  if (within.startsWith("..") || path.isAbsolute(within)) throw new Error("DISCOVERY_BLOCKED=SOURCE_PATH")
  return file
}

function workspaceFileFromUri(workspace, uri) {
  if (typeof uri !== "string") throw new Error("implementation Location lacks URI")
  const file = fileURLToPath(uri)
  const relative = path.relative(workspace, file)
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("implementation Location outside workspace")
  return workspaceFile(workspace, relative)
}

function validRange(range, text) {
  const lines = text.split(/\r?\n/u)
  const { start, end } = range ?? {}
  return validPosition(start, lines) && validPosition(end, lines)
    && (end.line > start.line || end.line === start.line && end.character >= start.character)
}
