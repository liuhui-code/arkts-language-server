import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { MessageChannel } from "node:worker_threads"
import { buildDriver } from "./support/semantic-worker-protocol-driver.mjs"
import { projectRoot } from "./support/lsp-process.mjs"

const rootPath = path.resolve(path.parse(process.cwd()).root, "workspace")
const rootUri = pathToFileURL(rootPath).href
const capabilities = JSON.parse(fs.readFileSync(path.join(projectRoot, "config/semantic-release-matrix.json"), "utf8")).capabilities
const unprepared = () => ({ rootUri, semanticState: "unprepared", semanticGeneration: null,
  readyCapabilities: [], unavailableReasons: [], unavailableInput: null, inputIdentity: null, coverage: null })
const success = (protocol, value, overrides = {}) => ({
  protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION, epoch: 1, id: 1, appliedRevision: 0,
  documentVersion: null, ok: true, value, ...overrides,
})
const decode = (protocol, response, expectedRoot = rootUri) =>
  protocol.decodeSemanticWorkerResponseForMethod("semanticReadiness", response, expectedRoot)
const ready = () => ({ rootUri, semanticState: "ready",
  semanticGeneration: `1:0:12345678-1234-4123-8123-123456789abc:${"a".repeat(64)}`,
  readyCapabilities: [...capabilities], unavailableReasons: [], unavailableInput: null,
  inputIdentity: { sha256: "a".repeat(64), engineGeneration: 1, canonicalRoot: rootPath, membershipRevision: 0,
    sourcesSha256: "b".repeat(64), overlaysSha256: "c".repeat(64), optionsSha256: "d".repeat(64),
    projectGraphSha256: "e".repeat(64), sdkSha256: "f".repeat(64), standardLibrarySha256: "a".repeat(64),
    backend: { packageVersion: "4.9.5-r10", compilerSha256: "b".repeat(64), packageSha256: "c".repeat(64) } },
  coverage: { projectSources: 2, sdkSources: 1, standardLibrarySources: 1, programSources: 4, dependenciesComplete: true },
})

test("usable partial SDK reports remain distinct from a complete readiness proof", t => {
  const protocol = buildDriver(t)
  const partial = { ...unprepared(), semanticState: "partial", unavailableReasons: ["sdk-inputs-incomplete"],
    availableCapabilities: ["definition", "typeDefinition", "hover", "signatureHelp", "completion", "completionResolve"],
    inputIssues: [{ layer: "sdk", reason: "module-not-found", specifier: "@ohos.missing" }] }
  const decoded = decode(protocol, success(protocol, partial))
  assert.deepEqual(decoded.value, partial)
  assert.ok(Object.isFrozen(decoded.value.inputIssues[0]))
  for (const reason of ["coverage-unproven", "declaration-not-found"]) {
    const report = { ...partial, inputIssues: [{ layer: "sdk", reason }] }
    assert.deepEqual(decode(protocol, success(protocol, report)).value, report)
  }
  let calls = 0
  const accessor = { layer: "sdk", reason: "module-not-found" }
  Object.defineProperty(accessor, "specifier", { enumerable: true, get() { calls++; return "@ohos.missing" } })
  for (const report of [
    { ...partial, semanticGeneration: ready().semanticGeneration },
    { ...partial, readyCapabilities: capabilities },
    { ...partial, inputIdentity: ready().inputIdentity },
    { ...partial, coverage: ready().coverage },
    { ...partial, availableCapabilities: [...partial.availableCapabilities.slice(1), "definition", "rename"] },
    { ...partial, inputIssues: [{ layer: "project", reason: "module-not-found", specifier: "@ohos.missing" }] },
    { ...partial, inputIssues: [{ layer: "sdk", reason: "module-not-found", specifier: "./Local" }] },
    { ...partial, inputIssues: [{ layer: "sdk", reason: "declaration-not-found", specifier: "forged" }] },
    { ...partial, inputIssues: [accessor] }, { ...partial, inputIssues: Array(1) },
    { ...partial, semanticState: "ready" }, { ...partial, unavailableReasons: ["worker-failed"] },
    { ...ready(), inputIssues: partial.inputIssues, availableCapabilities: partial.availableCapabilities },
  ]) assert.throws(() => decode(protocol, success(protocol, report)), /Invalid semantic worker response/)
  assert.equal(calls, 0)
})

test("a readiness response cannot claim ready without complete input and coverage proofs", t => {
  const protocol = buildDriver(t)
  const incomplete = { ...unprepared(), semanticState: "ready", semanticGeneration: "claimed-ready" }
  assert.throws(() => decode(protocol, success(protocol, incomplete)),
    /Invalid semantic worker response/)
})

test("readiness request and response versions are root-only, including errors", t => {
  const protocol = buildDriver(t)
  const request = { protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION, epoch: 1, id: 1,
    requiredRevision: 0, method: "semanticReadiness", uri: rootUri, expectedDocumentVersion: null,
    args: { prepare: false }, cancelCell: protocol.createSemanticWorkerCancellationCell() }
  assert.equal(protocol.decodeSemanticWorkerRequest(request).expectedDocumentVersion, null)
  for (const version of [0, 1, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => protocol.decodeSemanticWorkerRequest({ ...request, expectedDocumentVersion: version }),
      /Invalid semantic worker request/)
    assert.throws(() => decode(protocol,
      success(protocol, unprepared(), { documentVersion: version })), /Invalid semantic worker response/)
    const error = { protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION, epoch: 1, id: 1,
      appliedRevision: 0, documentVersion: version, ok: false, error: protocol.createSemanticWorkerError("client-cancelled") }
    assert.throws(() => decode(protocol, error),
      /Invalid semantic worker response/)
  }
})

test("unknown or nonready states cannot carry prepared generations, capabilities or proofs", t => {
  const protocol = buildDriver(t)
  for (const report of [
    { ...unprepared(), semanticState: "warming" },
    { ...unprepared(), semanticGeneration: "old-ready" },
    { ...unprepared(), readyCapabilities: ["definition"] },
    { ...unprepared(), inputIdentity: {} },
    { ...unprepared(), coverage: {} },
    { ...unprepared(), unavailableReasons: ["missing-input"] },
    { ...unprepared(), semanticState: "degraded" },
    { ...unprepared(), semanticState: "degraded", unavailableReasons: [""] },
  ]) {
    assert.throws(() => decode(protocol, success(protocol, report)),
      /Invalid semantic worker response/, JSON.stringify(report))
  }
  for (const report of [unprepared(), { ...unprepared(), semanticState: "degraded", unavailableReasons: ["missing-input"] }]) {
    assert.deepEqual(decode(protocol, success(protocol, report)).value, report)
  }
})

test("ready requires the full frozen capability set and no unavailable input or reason", t => {
  const protocol = buildDriver(t)
  for (const report of [
    { ...ready(), readyCapabilities: [] },
    { ...ready(), readyCapabilities: capabilities.slice(1) },
    { ...ready(), readyCapabilities: capabilities.map(() => "definition") },
    { ...ready(), readyCapabilities: [...capabilities.slice(1), "unknownCapability"] },
    { ...ready(), unavailableReasons: ["missing-input"] },
    { ...ready(), unavailableInput: { uri: null, code: 2307, message: "missing", position: null } },
  ]) {
    assert.throws(() => decode(protocol, success(protocol, report)),
      /Invalid semantic worker response/, JSON.stringify(report))
  }
  assert.deepEqual(decode(protocol, success(protocol, ready())).value, ready())
})

test("ready input identities require exact counters, canonical path, all digests and backend identity", t => {
  const protocol = buildDriver(t)
  const identity = ready().inputIdentity
  const invalid = [
    { ...identity, sha256: "bad" },
    { ...identity, engineGeneration: -1 },
    { ...identity, engineGeneration: 1.5 },
    { ...identity, membershipRevision: -1 },
    { ...identity, canonicalRoot: "relative-root" },
    { ...identity, canonicalRoot: rootPath + "\0" },
    { ...identity, backend: {} },
    { ...identity, backend: { ...identity.backend, packageVersion: "" } },
    { ...identity, backend: { ...identity.backend, compilerSha256: "bad" } },
    { ...identity, backend: { ...identity.backend, packageSha256: null } },
    { ...identity, ignored: undefined },
  ]
  for (const key of Object.keys(identity)) {
    const missing = { ...identity }; delete missing[key]; invalid.push(missing)
    if (key.endsWith("Sha256")) invalid.push({ ...identity, [key]: "G".repeat(64) })
  }
  for (const inputIdentity of invalid) {
    assert.throws(() => decode(protocol,
      success(protocol, { ...ready(), inputIdentity })), /Invalid semantic worker response/, JSON.stringify(inputIdentity))
  }
  assert.deepEqual(decode(protocol, success(protocol, ready())).value, ready())
})

test("ready coverage is complete and bounded by the actual Program source count", t => {
  const protocol = buildDriver(t)
  const coverage = ready().coverage
  const invalid = [
    { ...coverage, dependenciesComplete: false },
    { ...coverage, projectSources: 0 },
    { ...coverage, sdkSources: 0 },
    { ...coverage, standardLibrarySources: 0 },
    { ...coverage, programSources: 1 },
    { ...coverage, sdkSources: -1 },
    { ...coverage, projectSources: 1.5 },
    { ...coverage, programSources: Number.MAX_SAFE_INTEGER + 1 },
    { ...coverage, ignored: undefined },
  ]
  for (const key of Object.keys(coverage)) { const missing = { ...coverage }; delete missing[key]; invalid.push(missing) }
  for (const value of invalid) {
    assert.throws(() => decode(protocol,
      success(protocol, { ...ready(), coverage: value })), /Invalid semantic worker response/, JSON.stringify(value))
  }
  assert.deepEqual(decode(protocol, success(protocol, ready())).value, ready())
})

test("a readiness success must be correlated with its dispatched canonical root", t => {
  const protocol = buildDriver(t)
  for (const root of [pathToFileURL(rootPath + "-other").href, "https://example.invalid/workspace",
    "relative-root", rootUri + "?query=ignored", null, 1]) {
    assert.throws(() => decode(protocol, success(protocol, { ...ready(), rootUri: root })),
      /Invalid semantic worker response/, JSON.stringify(root))
  }
  assert.throws(() => protocol.decodeSemanticWorkerResponseForMethod("semanticReadiness", success(protocol, ready())),
    /Invalid semantic worker response/, "success without dispatched root correlation is not admissible")
  assert.deepEqual(decode(protocol, success(protocol, ready())).value, ready())
})

test("the ready generation binds its actual Worker epoch, applied revision, Program UUID and input digest", t => {
  const protocol = buildDriver(t)
  for (const generation of ["claimed-ready", ready().semanticGeneration.replace(/^1:/, "2:"),
    ready().semanticGeneration.replace(/^1:0:/, "1:1:"),
    ready().semanticGeneration.replace("12345678-1234-4123-8123-123456789abc", "not-a-program"),
    ready().semanticGeneration.replace(/a{64}$/, "b".repeat(64)), ready().semanticGeneration + ":extra"]) {
    assert.throws(() => decode(protocol, success(protocol, { ...ready(), semanticGeneration: generation })),
      /Invalid semantic worker response/, generation)
  }
  assert.throws(() => decode(protocol, success(protocol, ready(), { appliedRevision: 1 })), /Invalid semantic worker response/)
  assert.throws(() => decode(protocol, success(protocol, ready(), { epoch: 2 })), /Invalid semantic worker response/)
  const changed = ready(); changed.inputIdentity.sha256 = "b".repeat(64)
  assert.throws(() => decode(protocol, success(protocol, changed)), /Invalid semantic worker response/)
  assert.deepEqual(decode(protocol, success(protocol, ready())).value, ready())
})

test("a degraded necessary-input diagnostic is exact, canonical and zero-based UTF-16", t => {
  const protocol = buildDriver(t)
  const diagnostic = { uri: pathToFileURL(path.join(rootPath, "Main.ets")).href,
    code: 2307, message: "missing input", position: { line: 0, character: 2 } }
  const degraded = unavailableInput => ({ ...unprepared(), semanticState: "degraded",
    unavailableReasons: ["dependency-inputs-incomplete"], unavailableInput })
  for (const value of [{}, { ...diagnostic, code: "2307" }, { ...diagnostic, code: 0 },
    { ...diagnostic, message: "" }, { ...diagnostic, uri: "https://example.invalid/source" },
    { ...diagnostic, uri: null }, { ...diagnostic, position: { line: -1, character: 0 } },
    { ...diagnostic, position: { line: 0, character: 1.5 } },
    { ...diagnostic, position: { line: 0, character: 1, ignored: undefined } },
    { ...diagnostic, ignored: undefined }]) {
    assert.throws(() => decode(protocol, success(protocol, degraded(value))), /Invalid semantic worker response/, JSON.stringify(value))
  }
  for (const value of [diagnostic, { ...diagnostic, position: null }, { ...diagnostic, uri: null, position: null }, null]) {
    assert.deepEqual(decode(protocol, success(protocol, degraded(value))).value, degraded(value))
  }
})

test("raw readiness arguments cannot hide target fields behind undefined JSON omission", t => {
  const protocol = buildDriver(t)
  const request = { protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION, epoch: 1, id: 1,
    requiredRevision: 0, method: "semanticReadiness", uri: rootUri, expectedDocumentVersion: null,
    args: { prepare: true, symbol: undefined }, cancelCell: protocol.createSemanticWorkerCancellationCell() }
  assert.throws(() => protocol.decodeSemanticWorkerRequest(request), /Invalid semantic worker request/)
  for (const prepare of [false, true]) {
    assert.deepEqual(protocol.decodeSemanticWorkerRequest({ ...request, args: { prepare } }).args, { prepare })
  }
})

test("the immutable readiness snapshot cannot contradict the validated raw report", t => {
  const protocol = buildDriver(t)
  let reads = 0
  const coverage = new Proxy(ready().coverage, {
    getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key)
      return key === "dependenciesComplete" ? { ...descriptor, value: ++reads === 1 } : descriptor
    },
  })
  assert.throws(() => decode(protocol, success(protocol, { ...ready(), coverage })), /Invalid semantic worker response/)
})

test("complete readiness reports clone across a real MessageChannel into immutable method-bound snapshots", async t => {
  const protocol = buildDriver(t)
  const channel = new MessageChannel()
  t.after(() => { channel.port1.close(); channel.port2.close() })
  const sender = decode(protocol, success(protocol, ready()))
  const received = new Promise(resolve => channel.port2.once("message", resolve))
  channel.port1.postMessage(sender)
  const receiver = decode(protocol, await received)
  assert.deepEqual(receiver, sender)
  assert.notEqual(receiver.value, sender.value)
  for (const value of [receiver, receiver.value, receiver.value.inputIdentity, receiver.value.inputIdentity.backend,
    receiver.value.coverage, receiver.value.readyCapabilities, receiver.value.unavailableReasons]) {
    assert.equal(Object.isFrozen(value), true)
  }
})

test("raw readiness records and arrays reject extras, holes and accessors without invoking getters", t => {
  const protocol = buildDriver(t)
  let calls = 0
  const getterRecord = ready()
  Object.defineProperty(getterRecord.inputIdentity.backend, "compilerSha256", { enumerable: true,
    get() { calls++; return "a".repeat(64) } })
  const getterArray = [...capabilities]
  Object.defineProperty(getterArray, "0", { enumerable: true, get() { calls++; return "definition" } })
  const hole = [...capabilities]; delete hole[0]
  for (const report of [getterRecord, { ...ready(), ignored: undefined },
    { ...ready(), readyCapabilities: getterArray }, { ...ready(), readyCapabilities: hole },
    { ...ready(), readyCapabilities: [...capabilities, "extra"] },
    { ...ready(), unavailableReasons: Array(100).fill("unavailable") }]) {
    assert.throws(() => decode(protocol, success(protocol, report)), /Invalid semantic worker response/)
  }
  assert.equal(calls, 0)
})
