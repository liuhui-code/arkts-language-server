import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import { buildSync } from "esbuild"
import { projectRoot } from "./support/lsp-process.mjs"

test("references without a cancellation signal reject a changed candidate-stage document snapshot", async t => {
  const fixture = await createFixture(t)
  const { engine, document, release, audit, logs } = fixture
  const old = engine.references({ document: document("Query.ets"),
    position: { line: 1, character: 18 }, includeDeclaration: true })
  // Observe rejection immediately so a Worker failure is never an unhandled rejection.
  const settled = old.then(value => ({ value }), error => ({ error }))
  await waitUntil(() => audit().some(event => event.event === "status.held"),
    () => JSON.stringify({ audit: audit(), logs: logs() }))
  const changed = document("Query.ets", 2,
    'import { Other } from "./Target"\nexport let query: Other\n')
  engine.sync(changed)
  const hover = await bounded(engine.hover({ document: changed,
    position: { line: 1, character: 18 } }), "current document hover")
  assert.equal(hover.documentVersion, 2)
  assert.ok(hover.value, "the public hover barrier observes the changed buffer")
  release()
  const outcome = await bounded(settled, "old references settlement")
  assert.equal(outcome.error?.code, "content-modified",
    `old references must reject the changed snapshot: ${JSON.stringify({
      error: outcome.error && { code: outcome.error.code, message: outcome.error.message },
      value: outcome.value, audit: audit(), logs: logs(),
    })}`)

  // Request another document so resyncing Query cannot conceal old-text rollback.
  const current = await bounded(engine.references({ document: document("Target.ets"),
    position: { line: 0, character: 13 }, includeDeclaration: true }), "fresh references")
  assert.equal(current.value.status, "complete")
  assert.deepEqual(normalize(current.value.references), normalize([
    location(document("Target.ets").uri, 0, 12, 17),
    location(document("Use.ets").uri, 0, 9, 14),
    location(document("Use.ets").uri, 1, 16, 21),
  ]))
})

test("references without a cancellation signal reject a candidate-stage SDK configuration change", async t => {
  const fixture = await createFixture(t)
  const { engine, document, release, audit, logs, missingSdkPath } = fixture
  const old = engine.references({ document: document("Query.ets"),
    position: { line: 1, character: 18 }, includeDeclaration: true })
  const settled = old.then(value => ({ value }), error => ({ error }))
  await waitUntil(() => audit().some(event => event.event === "status.held"),
    () => JSON.stringify({ audit: audit(), logs: logs() }))
  engine.configureSdk({ path: missingSdkPath })
  const hover = await bounded(engine.hover({ document: document("Query.ets"),
    position: { line: 1, character: 18 } }), "configured SDK hover")
  assert.equal(hover.documentVersion, 1, "configuration does not change the buffer revision")
  assert.ok(hover.value)
  release()
  const outcome = await bounded(settled, "old SDK references settlement")
  assert.equal(outcome.error?.code, "content-modified",
    `old references must reject the changed SDK configuration: ${JSON.stringify({
      error: outcome.error && { code: outcome.error.code, message: outcome.error.message },
      value: outcome.value, audit: audit(), logs: logs(),
    })}`)
  for (const event of ["references.index.accepted", "references.batch.start", "references.cache.store"]) {
    assert.equal(logs().some(entry => entry.event === event), false,
      `the superseded operation must not publish ${event}`)
  }

  const current = await bounded(engine.references({ document: document("Target.ets"),
    position: { line: 0, character: 13 }, includeDeclaration: true }), "configured SDK references")
  assert.equal(current.value.status, "complete")
  assert.deepEqual(normalize(current.value.references), normalize([
    location(document("Target.ets").uri, 0, 12, 17),
    location(document("Query.ets").uri, 0, 9, 14),
    location(document("Query.ets").uri, 1, 18, 23),
    location(document("Use.ets").uri, 0, 9, 14),
    location(document("Use.ets").uri, 1, 16, 21),
  ]))
})

test("references retain the entry snapshot when the caller mutates its query during candidate selection", async t => {
  const fixture = await createFixture(t)
  const { engine, document, release, audit, logs } = fixture
  const input = { document: document("Query.ets"),
    position: { line: 1, character: 18 }, includeDeclaration: true }
  const old = engine.references(input)
  const settled = old.then(value => ({ value }), error => ({ error }))
  await waitUntil(() => audit().some(event => event.event === "status.held"),
    () => JSON.stringify({ audit: audit(), logs: logs() }))
  // This only changes caller-owned values; no authoritative engine mutation occurs.
  input.document.text = 'import { Other } from "./Target"\nexport let query: Other\n'
  input.document.version = 2
  input.position.line = 0
  input.position.character = 10
  release()
  const outcome = await bounded(settled, "original caller snapshot references")
  assert.equal(outcome.error, undefined,
    `caller mutation must not alter the ongoing operation: ${JSON.stringify({
      error: outcome.error && { code: outcome.error.code, message: outcome.error.message },
      value: outcome.value,
    })}`)
  assert.equal(outcome.value.documentVersion, 1)
  assert.equal(outcome.value.value.status, "complete")
  const expected = normalize([
    location(document("Target.ets").uri, 0, 12, 17),
    location(document("Query.ets").uri, 0, 9, 14),
    location(document("Query.ets").uri, 1, 18, 23),
    location(document("Use.ets").uri, 0, 9, 14),
    location(document("Use.ets").uri, 1, 16, 21),
  ])
  assert.deepEqual(normalize(outcome.value.value.references), expected)
  const current = await bounded(engine.references({ document: document("Target.ets"),
    position: { line: 0, character: 13 }, includeDeclaration: true }), "unchanged authoritative buffers")
  assert.equal(current.value.status, "complete")
  assert.deepEqual(normalize(current.value.references), expected)
})

test("parent references reject an edit to an authoritative nested workspace buffer during candidate selection", async t => {
  const fixture = await createFixture(t, { nestedUse: true })
  const { engine, document, release, audit, logs } = fixture
  const old = engine.references({ document: document("Query.ets"),
    position: { line: 1, character: 18 }, includeDeclaration: true })
  const settled = old.then(value => ({ value }), error => ({ error }))
  await waitUntil(() => audit().some(event => event.event === "status.held"),
    () => JSON.stringify({ audit: audit(), logs: logs() }))
  const changed = document("nested/Use.ets", 2,
    'import { Other } from "../Target"\nexport let use: Other\n')
  engine.sync(changed)
  const hover = await bounded(engine.hover({ document: changed,
    position: { line: 1, character: 16 } }), "nested buffer hover")
  assert.equal(hover.documentVersion, 2)
  assert.ok(hover.value)
  release()
  const outcome = await bounded(settled, "old parent references settlement")
  assert.equal(outcome.error?.code, "content-modified",
    `the parent operation must reject changed nested input: ${JSON.stringify({
      error: outcome.error && { code: outcome.error.code, message: outcome.error.message },
      value: outcome.value,
    })}`)
  for (const event of ["references.index.accepted", "references.batch.start", "references.cache.store"]) {
    assert.equal(logs().some(entry => entry.event === event), false,
      `the superseded parent operation must not publish ${event}`)
  }
  const current = await bounded(engine.references({ document: document("Target.ets"),
    position: { line: 0, character: 13 }, includeDeclaration: true }), "fresh parent references")
  assert.equal(current.value.status, "complete")
  assert.deepEqual(normalize(current.value.references), normalize([
    location(document("Target.ets").uri, 0, 12, 17),
    location(document("Query.ets").uri, 0, 9, 14),
    location(document("Query.ets").uri, 1, 18, 23),
  ]))
})

test("a cached parent reference result is invalidated by a nested workspace buffer edit", async t => {
  const fixture = await createFixture(t, { nestedUse: true })
  const { engine, document, release, logs } = fixture
  release()
  const query = { document: document("Target.ets"),
    position: { line: 0, character: 13 }, includeDeclaration: true }
  const initial = await bounded(engine.references(query), "initial parent references")
  const original = normalize([
    location(document("Target.ets").uri, 0, 12, 17),
    location(document("Query.ets").uri, 0, 9, 14),
    location(document("Query.ets").uri, 1, 18, 23),
    location(document("nested/Use.ets").uri, 0, 9, 14),
    location(document("nested/Use.ets").uri, 1, 16, 21),
  ])
  assert.equal(initial.value.status, "complete")
  assert.deepEqual(normalize(initial.value.references), original)
  const batches = logs().filter(entry => entry.event === "references.batch.start").length
  const repeated = await bounded(engine.references(query), "cached parent references")
  assert.deepEqual(normalize(repeated.value.references), original)
  assert.equal(logs().filter(entry => entry.event === "references.cache.hit").length, 1)
  assert.equal(logs().filter(entry => entry.event === "references.batch.start").length, batches,
    "the identical repeat starts no additional verifier")

  const changed = document("nested/Use.ets", 2,
    'import { Other } from "../Target"\nexport let use: Other\n')
  engine.sync(changed)
  const hover = await bounded(engine.hover({ document: changed,
    position: { line: 1, character: 16 } }), "changed nested buffer hover")
  assert.equal(hover.documentVersion, 2)
  assert.ok(hover.value)
  const current = await bounded(engine.references(query), "uncached parent references after nested edit")
  assert.equal(current.value.status, "complete")
  assert.deepEqual(normalize(current.value.references), normalize([
    location(document("Target.ets").uri, 0, 12, 17),
    location(document("Query.ets").uri, 0, 9, 14),
    location(document("Query.ets").uri, 1, 18, 23),
  ]))
  assert.equal(logs().filter(entry => entry.event === "references.cache.hit").length, 1,
    "the nested edit cannot reuse the parent result from the old overlay snapshot")
})

test("sibling workspace edits preserve a pending parent reference snapshot and its complete cache", async t => {
  const fixture = await createFixture(t, { siblingWorkspace: true })
  const { engine, document, secondaryDocument, release, audit, logs } = fixture
  const query = { document: document("Query.ets"),
    position: { line: 1, character: 18 }, includeDeclaration: true }
  const old = engine.references(query)
  const settled = old.then(value => ({ value }), error => ({ error }))
  await waitUntil(() => audit().some(event => event.event === "status.held"),
    () => JSON.stringify({ audit: audit(), logs: logs() }))
  const sibling = secondaryDocument("Sibling.ets", 1, "export let sibling = 1\n")
  engine.sync(sibling)
  const hover = await bounded(engine.hover({ document: sibling,
    position: { line: 0, character: 13 } }), "sibling buffer hover")
  assert.equal(hover.documentVersion, 1)
  assert.ok(hover.value)
  release()
  const outcome = await bounded(settled, "unaffected parent references")
  assert.equal(outcome.error, undefined)
  assert.equal(outcome.value.value.status, "complete")
  const expected = normalize([
    location(document("Target.ets").uri, 0, 12, 17),
    location(document("Query.ets").uri, 0, 9, 14),
    location(document("Query.ets").uri, 1, 18, 23),
    location(document("Use.ets").uri, 0, 9, 14),
    location(document("Use.ets").uri, 1, 16, 21),
  ])
  assert.deepEqual(normalize(outcome.value.value.references), expected)
  const batches = logs().filter(entry => entry.event === "references.batch.start").length
  const changed = secondaryDocument("Sibling.ets", 2, "export let sibling = 2\n")
  engine.sync(changed)
  assert.equal((await bounded(engine.hover({ document: changed,
    position: { line: 0, character: 13 } }), "changed sibling buffer hover")).documentVersion, 2)
  const repeated = await bounded(engine.references(query), "parent cache after sibling edit")
  assert.deepEqual(normalize(repeated.value.references), expected)
  assert.equal(logs().filter(entry => entry.event === "references.cache.hit").length, 1)
  assert.equal(logs().filter(entry => entry.event === "references.batch.start").length, batches)
})

test("a physical workspace alias edit invalidates a pending parent reference snapshot", async t => {
  const fixture = await createFixture(t, { aliasWorkspace: true })
  const { engine, document, secondaryDocument, release, audit, logs } = fixture
  const old = engine.references({ document: document("Query.ets"),
    position: { line: 1, character: 18 }, includeDeclaration: true })
  const settled = old.then(value => ({ value }), error => ({ error }))
  await waitUntil(() => audit().some(event => event.event === "status.held"),
    () => JSON.stringify({ audit: audit(), logs: logs() }))
  const changed = secondaryDocument("Use.ets", 2,
    'import { Other } from "./Target"\nexport let use: Other\n')
  engine.sync(changed)
  const hover = await bounded(engine.hover({ document: changed,
    position: { line: 1, character: 16 } }), "physical alias buffer hover")
  assert.equal(hover.documentVersion, 2)
  assert.ok(hover.value)
  release()
  const outcome = await bounded(settled, "aliased parent references settlement")
  assert.equal(outcome.error?.code, "content-modified")
  for (const event of ["references.index.accepted", "references.batch.start", "references.cache.store"]) {
    assert.equal(logs().some(entry => entry.event === event), false)
  }
  const current = await bounded(engine.references({ document: document("Target.ets"),
    position: { line: 0, character: 13 }, includeDeclaration: true }), "parent recovery after alias edit")
  assert.equal(current.value.status, "complete")
  assert.deepEqual(normalize(current.value.references), normalize([
    location(document("Target.ets").uri, 0, 12, 17),
    location(document("Query.ets").uri, 0, 9, 14),
    location(document("Query.ets").uri, 1, 18, 23),
  ]))
})

test("the configured SDK resolves source proof through the real sidecar and semantic Worker", async t => {
  await verifySdkConfigurationSnapshot(t)
})

test("references keep the configured SDK snapshot when the caller mutates its configuration object", async t => {
  await verifySdkConfigurationSnapshot(t, true)
})

async function verifySdkConfigurationSnapshot(t, mutateCaller = false) {
  const { engine, document, release, audit, logs, sdkPath, missingSdkPath } = await createFixture(t,
    { sdkSourceProof: true })
  const configuration = { path: sdkPath }
  engine.configureSdk(configuration)
  const query = { document: document("Query.ets"), position: { line: 1, character: 18 },
    includeDeclaration: true }
  assert.ok((await bounded(engine.hover(query), "configured SDK hover")).value)
  assert.ok(logs().some(event => event.event === "sdk.selected" && event.sdkPath === sdkPath
    && event.ready === true), "the real Worker selected the identified SDK before references")
  const pending = engine.references(query)
  const settled = pending.then(value => ({ value }), error => ({ error }))
  await waitUntil(() => audit().some(event => event.event === "status.held"),
    () => JSON.stringify({ audit: audit(), logs: logs() }))
  if (mutateCaller) configuration.path = missingSdkPath
  release()
  const outcome = await bounded(settled, "configured SDK reference snapshot")
  assert.equal(outcome.error, undefined, outcome.error?.message)
  const retries = audit().filter(event => event.method === "references/candidates"
    && event.params.sourceResolutions?.length)
  assert.equal(retries.length, 1,
    `source proof must use the configured SDK despite caller mutation: ${JSON.stringify({
      audit: audit(), logs: logs(), result: outcome.value,
    })}`)
  assert.deepEqual(retries[0].params.sourceResolutions.map(value => ({
    bindingUri: value.bindingUri, sourceSpecifier: value.sourceSpecifier,
    sdkTerminal: /^sdk:[0-9a-f]{64}$/.test(value.externalTerminalIdentity),
    sourceUri: value.resolvedSourceUri,
  })), [{ bindingUri: pathToFileURL(fs.realpathSync.native(fileURLToPath(document("Query.ets").uri))).href,
    sourceSpecifier: "@ohos.example",
    sdkTerminal: true, sourceUri: undefined }])
  assert.equal(outcome.value.value.status, "complete")
  assert.deepEqual(normalize(outcome.value.value.references), normalize([
    location(document("Target.ets").uri, 0, 12, 17),
    location(document("Query.ets").uri, 0, 9, 14),
    location(document("Query.ets").uri, 1, 18, 23),
    location(document("Use.ets").uri, 0, 9, 14),
    location(document("Use.ets").uri, 1, 16, 21),
  ]))
}

async function createFixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-snapshot-"))
  const workspacePath = path.join(root, "workspace")
  const auditPath = path.join(root, "index.ndjson")
  const releasePath = path.join(root, "release")
  const logPath = path.join(root, "semantic.log")
  fs.mkdirSync(workspacePath)
  const sdkPath = path.join(root, "sdk")
  if (options.sdkSourceProof) {
    fs.mkdirSync(path.join(sdkPath, "ets", "api"), { recursive: true })
    fs.mkdirSync(path.join(sdkPath, "toolchains"), { recursive: true })
    fs.writeFileSync(path.join(sdkPath, "ets", "oh-uni-package.json"), JSON.stringify({
      path: "ets", apiVersion: "24", version: "6.1.1.125",
    }))
    fs.writeFileSync(path.join(sdkPath, "ets", "api", "@ohos.example.d.ts"), "export class Thing {}\n")
  }
  const secondaryPath = options.siblingWorkspace ? path.join(root, "sibling")
    : options.aliasWorkspace ? path.join(root, "workspace-alias") : undefined
  if (options.siblingWorkspace) {
    fs.mkdirSync(secondaryPath)
    fs.writeFileSync(path.join(secondaryPath, "Sibling.ets"), "export let sibling = 1\n")
  }
  if (options.aliasWorkspace) fs.symlinkSync(workspacePath, secondaryPath, "dir")
  const sources = {
    "Target.ets": "export type Thing = string\nexport type Other = number\n",
    "Query.ets": 'import { Thing } from "./Target"\nexport let query: Thing\n',
    "Use.ets": 'import { Thing } from "./Target"\nexport let use: Thing\n',
  }
  if (options.sdkSourceProof) sources["Query.ets"] += 'import { Thing as SdkThing } from "@ohos.example"\n'
  if (options.nestedUse) {
    sources["nested/Use.ets"] = 'import { Thing } from "../Target"\nexport let use: Thing\n'
    delete sources["Use.ets"]
    fs.mkdirSync(path.join(workspacePath, "nested"))
  }
  for (const [name, text] of Object.entries(sources)) {
    fs.writeFileSync(path.join(workspacePath, name), text)
  }
  const overrides = {
    ARKTS_INDEX_TEST_AUDIT: auditPath,
    ARKTS_INDEX_TEST_RELEASE: releasePath,
    ARKTS_INDEX_TEST_SDK_SOURCE_PROOF: options.sdkSourceProof ? "1" : "0",
    ARKTS_INDEX_TEST_USE_PATH: options.nestedUse ? "nested/Use.ets" : "Use.ets",
    ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
    DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
    ARKTS_REFERENCES_STRATEGY: "indexed-batched",
    ARKTS_REFERENCES_TRACE: "1",
  }
  const previous = Object.fromEntries(Object.keys(overrides).map(key => [key, process.env[key]]))
  Object.assign(process.env, overrides)
  let engine
  let index
  const workspaceUri = pathToFileURL(workspacePath).href
  const release = () => fs.writeFileSync(releasePath, "release")
  t.after(async () => {
    release()
    try {
      await bounded(engine?.dispose(), "semantic engine cleanup", 5_000)
      await bounded(index?.close(workspaceUri), "sidecar cleanup", 5_000)
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
  const outfile = path.join(root, "engine.cjs")
  buildSync({ stdin: { contents: [
    'export { SidecarWorkspaceIndex } from "./src/index/sidecar-workspace-index.ts"',
    'export { SemanticWorkerEngine } from "./src/semantic/semantic-worker-proxy.ts"',
    'export { SingleRootProjectResolver } from "./src/project/single-root-project-resolver.ts"',
    'export { createStructuredLogger } from "./src/observability/logger.ts"',
  ].join("\n"), resolveDir: projectRoot }, outfile, bundle: true,
    platform: "node", format: "cjs", target: "node20" })
  const runtime = createRequire(import.meta.url)(outfile)
  index = new runtime.SidecarWorkspaceIndex({
    sidecarPath: path.join(projectRoot, "tests/fixtures/index/references-held-status.mjs"),
    requestTimeoutMs: 10_000,
  })
  await bounded(index.open({ id: workspaceUri, rootUri: workspaceUri }, path.join(root, "cache")),
    "sidecar initialization")
  const projects = new runtime.SingleRootProjectResolver(workspaceUri)
  const nestedUri = pathToFileURL(path.join(workspacePath, "nested")).href
  if (options.nestedUse) projects.configure([workspaceUri, nestedUri])
  const secondaryUri = secondaryPath && pathToFileURL(secondaryPath).href
  if (secondaryUri) projects.configure([workspaceUri, secondaryUri])
  engine = new runtime.SemanticWorkerEngine(projects,
    runtime.createStructuredLogger(logPath), { env: { ...process.env },
      workerPath: path.join(projectRoot, "dist/semantic-worker.cjs"),
      referenceIndex: index, exportIndex: index })
  const document = (name, version = 1, text = sources[name]) => ({
    uri: pathToFileURL(path.join(workspacePath, name)).href,
    workspaceId: options.nestedUse && name.startsWith("nested/") ? nestedUri : workspaceUri,
    version, text,
  })
  engine.sync(document("Target.ets"))
  engine.sync(document("Query.ets"))
  if (options.nestedUse) engine.sync(document("nested/Use.ets"))
  const secondaryDocument = (name, version, text) => ({
    uri: pathToFileURL(path.join(secondaryPath, name)).href,
    workspaceId: secondaryUri, version, text,
  })
  return { engine, document, secondaryDocument, release, sdkPath, missingSdkPath: path.join(root, "missing-configured-sdk"),
    audit: () => readEvents(auditPath), logs: () => readEvents(logPath) }
}

function location(uri, line, start, end) {
  return { uri, range: { start: { line, character: start }, end: { line, character: end } } }
}

function normalize(locations) {
  return locations.map(({ uri, range }) => JSON.stringify([uri, range.start.line,
    range.start.character, range.end.line, range.end.character])).sort()
}

function readEvents(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse) : []
}

async function waitUntil(predicate, diagnostic) {
  const deadline = performance.now() + 10_000
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error(`timed out waiting for held index status: ${diagnostic()}`)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

async function bounded(promise, label, timeoutMs = 10_000) {
  let timer
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), timeoutMs)
    })])
  } finally {
    clearTimeout(timer)
  }
}
