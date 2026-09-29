import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import { buildSync } from "esbuild"
import { projectRoot } from "./support/lsp-process.mjs"

test("the configured project target resolves self-package source proof through the real Worker", async t => {
  await verifyProjectConfigurationSnapshot(t)
})

test("references keep the configured project snapshot when the caller mutates a nested target", async t => {
  await verifyProjectConfigurationSnapshot(t, true)
})

test("references source proof includes an unsaved project target absent on disk", async t => {
  await verifyProjectConfigurationSnapshot(t, false, true)
})

test("source proof rejects an overlay alias retargeted during candidate selection", async t => {
  const { engine, document, release, audit, logs } = await createFixture(t)
  engine.configureProject({ product: "default", targets: { alpha: "tablet" } })
  const query = { document: document("module/src/main/ets/Query.ets"),
    position: { line: 1, character: 18 }, includeDeclaration: true }
  const target = document("module/src/tablet/Target.ets")
  const alias = document("module/src/tablet/Alias.ets", 1, target.text)
  const aliasPath = fileURLToPath(alias.uri)
  fs.symlinkSync(fileURLToPath(target.uri), aliasPath, "file")
  engine.sync(alias)
  const definition = await bounded(engine.define(query), "original alias definition")
  assert.deepEqual(normalize(definition.value), normalize([location(alias.uri, 0, 12, 17)]))
  const pending = engine.references(query)
  const settled = pending.then(value => ({ value }), error => ({ error }))
  await waitUntil(() => audit().some(event => event.event === "status.held"),
    () => JSON.stringify({ audit: audit(), logs: logs() }))
  // No managed revision event: the source-proof snapshot must reject physical drift itself.
  fs.unlinkSync(aliasPath)
  fs.symlinkSync(fileURLToPath(document("module/src/desktop/Target.ets").uri), aliasPath, "file")
  release()
  const outcome = await bounded(settled, "retargeted alias references")
  const retries = audit().filter(event => event.method === "references/candidates"
    && event.params.sourceResolutions?.length)
  assert.equal(retries.length, 0,
    `a changed overlay identity must not silently certify disk fallback: ${JSON.stringify({
      audit: audit(), logs: logs(), outcome,
    })}`)
  assert.ok(logs().some(event => event.event === "references.index.fallback"
    && event.reason === "index-error" && /overlay physical identity changed/.test(event.message)))
})

async function verifyProjectConfigurationSnapshot(t, mutateCaller = false, overlayTarget = false) {
  const { engine, document, release, audit, logs } = await createFixture(t, overlayTarget)
  const configuration = { product: "default", targets: { alpha: "tablet" } }
  engine.configureProject(configuration)
  const query = { document: document("module/src/main/ets/Query.ets"),
    position: { line: 1, character: 18 }, includeDeclaration: true }
  const target = document("module/src/tablet/Target.ets")
  const usage = document("module/src/main/ets/Use.ets")
  if (overlayTarget) {
    assert.equal(fs.existsSync(fileURLToPath(target.uri)), false,
      "the target must exist only in the open document overlay")
    engine.sync(target)
  }
  const definition = await bounded(engine.define(query), "selected-target definition")
  assert.deepEqual(normalize(definition.value), normalize([location(target.uri, 0, 12, 17)]),
    "the real Worker must select tablet before candidate-stage configuration capture")
  const pending = engine.references(query)
  const settled = pending.then(value => ({ value }), error => ({ error }))
  await waitUntil(() => audit().some(event => event.event === "status.held"),
    () => JSON.stringify({ audit: audit(), logs: logs() }))
  // Only the caller's object changes: no configure call, file edit or version advance.
  if (mutateCaller) configuration.targets.alpha = "desktop"
  release()
  const outcome = await bounded(settled, "selected-target references")
  assert.equal(outcome.error, undefined, outcome.error?.message)
  assert.equal(outcome.value.documentVersion, 1)
  assert.equal(outcome.value.value.status, "complete")
  assert.deepEqual(normalize(outcome.value.value.references), normalize([
    location(target.uri, 0, 12, 17),
    location(query.document.uri, 0, 9, 14),
    location(query.document.uri, 1, 18, 23),
    location(usage.uri, 0, 9, 14),
    location(usage.uri, 1, 16, 21),
  ]))
  const retries = audit().filter(event => event.method === "references/candidates"
    && event.params.sourceResolutions?.length)
  assert.equal(retries.length, 1,
    `self-package binding requires selected-target source proof: ${JSON.stringify({
      audit: audit(), logs: logs(), result: outcome.value,
    })}`)
  assert.deepEqual(retries[0].params.sourceResolutions, [{
    bindingUri: query.document.uri, sourceSpecifier: "snapshot/Target",
    resolvedSourceUri: target.uri,
  }], "Node source proof and the semantic Worker must use the same configured target")
}

async function createFixture(t, overlayTarget = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-project-snapshot-"))
  const workspacePath = path.join(root, "workspace")
  fs.mkdirSync(workspacePath)
  const physicalWorkspace = fs.realpathSync.native(workspacePath)
  const auditPath = path.join(root, "index.ndjson")
  const releasePath = path.join(root, "release")
  const logPath = path.join(root, "semantic.log")
  const sources = {
    "module/src/tablet/Target.ets": "export type Thing = string\nexport type Other = number\n",
    "module/src/desktop/Target.ets": "export type Thing = number\nexport type Other = boolean\n",
    "module/src/main/ets/Query.ets": 'import { Thing } from "snapshot/Target"\nexport let query: Thing\n',
    "module/src/main/ets/Use.ets": 'import { Thing } from "snapshot/Target"\nexport let use: Thing\n',
  }
  const files = {
    ...sources,
    "build-profile.json5": JSON.stringify({ app: { products: [{ name: "default" }] },
      modules: [{ name: "alpha", srcPath: "./module", targets: [
        { name: "tablet", applyToProducts: ["default"] },
        { name: "desktop", applyToProducts: ["default"] },
      ] }] }),
    "module/build-profile.json5": JSON.stringify({ targets: [
      { name: "tablet", source: { sourceRoots: ["./src/tablet"] } },
      { name: "desktop", source: { sourceRoots: ["./src/desktop"] } },
    ] }),
    "module/oh-package.json5": JSON.stringify({ name: "snapshot", dependencies: {} }),
  }
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(physicalWorkspace, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    if (overlayTarget && name === "module/src/tablet/Target.ets") continue
    fs.writeFileSync(file, text)
  }
  const overrides = {
    ARKTS_INDEX_TEST_AUDIT: auditPath,
    ARKTS_INDEX_TEST_RELEASE: releasePath,
    ARKTS_INDEX_TEST_SDK_SOURCE_PROOF: "0",
    ARKTS_INDEX_TEST_PROJECT_SOURCE_PROOF: "1",
    ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
    DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
    ARKTS_REFERENCES_STRATEGY: "indexed-batched",
    ARKTS_REFERENCES_TRACE: "1",
  }
  const previous = Object.fromEntries(Object.keys(overrides).map(key => [key, process.env[key]]))
  Object.assign(process.env, overrides)
  let engine
  let index
  const workspaceUri = pathToFileURL(physicalWorkspace).href
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
  engine = new runtime.SemanticWorkerEngine(new runtime.SingleRootProjectResolver(workspaceUri),
    runtime.createStructuredLogger(logPath), { env: { ...process.env },
      workerPath: path.join(projectRoot, "dist/semantic-worker.cjs"),
      referenceIndex: index, exportIndex: index })
  const document = (name, version = 1, text = sources[name]) => ({
    uri: pathToFileURL(path.join(physicalWorkspace, name)).href,
    workspaceId: workspaceUri, version, text,
  })
  return { engine, document, release,
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
