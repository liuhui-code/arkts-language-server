import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("an unchanged complete resident Program answers exact references without verifier batches", async (t) => {
  const fixture = createFixture(t)
  const legacy = await replay(t, fixture, "legacy")
  const resident = await replay(t, fixture, "batched", { warm: true, resident: true })
  assert.deepEqual(resident.results, legacy.results)
  assertKnownReferences(fixture, resident.results)
  assert.equal(resident.events.filter(event => event.event === "references.resident.hit").length, 2,
    JSON.stringify(resident.events.filter(event => /resident|diagnostics.program|request.completed/u.test(event.event))))
  assert.ok(!resident.events.some(event => event.event === "references.batch.start"),
    "a complete unchanged resident compiler must not create transient verifier batches")
})

test("indexed constructor queries reuse the original cursor instead of trusting a class seed", async (t) => {
  const fixture = createFixture(t)
  const legacy = await replay(t, fixture, "legacy")
  for (const localSeed of [false, true]) {
    const resident = await replay(t, fixture, "indexed-batched", { warm: true, resident: true, localSeed })
    assert.deepEqual(resident.results, legacy.results)
    assertKnownReferences(fixture, resident.results)
    assert.equal(resident.events.filter(event => event.event === "references.resident.hit").length, 2)
    assert.ok(!resident.events.some(event => event.event === "references.batch.start"))
    assert.ok(!resident.events.some(event => event.event === "references.anchor.complete"
      && event.verifierIsolation === "transient-worker"))
    assert.equal(resident.events.filter(event => event.event === "references.cache.miss").length, 2)
    assert.ok(!resident.events.some(event => event.event === "references.cache.hit"))
  }
})

test("an unnotified package entry retarget cannot certify a stale resident Program", async (t) => {
  const fixture = createFixture(t, { namedPackage: true })
  const before = await replay(t, fixture, "legacy")
  assert.ok(before.results.every(result => result.map(JSON.parse)
    .some(location => location.uri === fixture.uri("PackageConsumer.ets"))))
  const resident = await replay(t, fixture, "batched", {
    warm: true, resident: true,
    afterWarm: () => fs.writeFileSync(path.join(fixture.root, "shared/oh-package.json5"),
      "{ main: 'B.ets' }"),
  })
  // Only a new process after the mutation is a valid compiler oracle here:
  // the original legacy service also caches package entry metadata.
  const fresh = await replay(t, fixture, "legacy")
  assert.ok(fresh.results.every(result => !result.map(JSON.parse)
    .some(location => location.uri === fixture.uri("PackageConsumer.ets"))))
  assert.deepEqual(resident.results, fresh.results)
  assert.ok(!resident.events.some(event => event.event === "references.resident.hit"))
  assert.ok(resident.events.some(event => event.event === "references.batch.start"))
})

test("creating a previously absent package owner rejects cached unresolved imports", async (t) => {
  const fixture = createFixture(t, { namedPackage: true })
  const manifest = path.join(fixture.root, "oh-package.json5")
  fs.unlinkSync(manifest)
  const resident = await replay(t, fixture, "batched", {
    warm: true, resident: true,
    afterWarm: () => fs.writeFileSync(manifest, "{ dependencies: { shared: 'file:./shared' } }"),
  })
  const fresh = await replay(t, fixture, "legacy")
  assert.deepEqual(resident.results, fresh.results)
  assert.ok(fresh.results.every(result => result.map(JSON.parse)
    .some(location => location.uri === fixture.uri("PackageConsumer.ets"))))
  assert.ok(!resident.events.some(event => event.event === "references.resident.hit"))
})

test("an installation link retarget rejects the old loaded package identity", async (t) => {
  const fixture = createFixture(t, { namedPackage: true, installedPackage: true })
  const before = await replay(t, fixture, "legacy")
  assert.ok(before.results.every(result => result.map(JSON.parse)
    .some(location => location.uri === fixture.uri("PackageConsumer.ets"))))
  const resident = await replay(t, fixture, "batched", {
    warm: true, resident: true,
    afterWarm: () => {
      const link = path.join(fixture.root, "oh_modules/shared")
      fs.unlinkSync(link)
      fs.symlinkSync(path.join(fixture.root, "shared/B"), link, process.platform === "win32" ? "junction" : "dir")
    },
  })
  const fresh = await replay(t, fixture, "legacy")
  assert.deepEqual(resident.results, fresh.results)
  assert.ok(fresh.results.every(result => !result.map(JSON.parse)
    .some(location => location.uri === fixture.uri("PackageConsumer.ets"))))
  assert.ok(!resident.events.some(event => event.event === "references.resident.hit"))
})

test("SDK selection metadata and ETS loader options are actual resident freshness inputs", async (t) => {
  for (const changed of ["metadata", "loader", "selection"]) {
    const fixture = createFixture(t)
    const sdk = createTestSdk(t)
    const properties = path.join(fixture.root, "local.properties")
    fs.writeFileSync(properties, `sdk.dir=${sdk}\n`)
    const control = await replay(t, fixture, "batched", { warm: true, resident: true })
    assert.equal(control.events.filter(event => event.event === "references.resident.hit").length, 2)
    const resident = await replay(t, fixture, "batched", {
      warm: true, resident: true,
      afterWarm: () => {
        if (changed === "metadata") fs.writeFileSync(path.join(sdk, "ets/oh-uni-package.json"),
          JSON.stringify({ path: "ets", apiVersion: "24", version: "changed" }))
        if (changed === "loader") fs.writeFileSync(path.join(sdk, "ets/build-tools/ets-loader/tsconfig.json"),
          JSON.stringify({ compilerOptions: {} }))
        if (changed === "selection") fs.writeFileSync(properties, `sdk.dir=${createTestSdk(t)}\n`)
      },
    })
    const fresh = await replay(t, fixture, "legacy")
    assert.deepEqual(resident.results, fresh.results, changed)
    const admissions = resident.events.filter(event => /^references\.resident\.(hit|miss)$/u.test(event.event))
    assert.equal(admissions[0]?.event, "references.resident.miss", changed)
    // Normal diagnostics may create a new, valid context after that miss.
    // A later hit is allowed only after the stale first request fell back.
  }
})

test("automatic type-directive package metadata is part of loaded compiler freshness", async (t) => {
  const fixture = createFixture(t)
  const directory = path.join(fixture.root, "node_modules/@types/loaded")
  fs.mkdirSync(directory, { recursive: true })
  const metadata = path.join(directory, "package.json")
  fs.writeFileSync(metadata, JSON.stringify({ typings: "A.d.ts" }))
  fs.writeFileSync(path.join(directory, "A.d.ts"), "declare interface AutomaticA {}\n")
  fs.writeFileSync(path.join(directory, "B.d.ts"), "declare interface AutomaticB {}\n")
  const control = await replay(t, fixture, "batched", { warm: true, resident: true })
  assert.equal(control.events.filter(event => event.event === "references.resident.hit").length, 2)
  const resident = await replay(t, fixture, "batched", {
    warm: true, resident: true,
    afterWarm: () => fs.writeFileSync(metadata, JSON.stringify({ typings: "B.d.ts" })),
  })
  const fresh = await replay(t, fixture, "legacy")
  assert.deepEqual(resident.results, fresh.results)
  const admissions = resident.events.filter(event => /^references\.resident\.(hit|miss)$/u.test(event.event))
  assert.equal(admissions[0]?.event, "references.resident.miss")
})

test("an unrelated temporary sibling preserves loaded automatic type metadata", async (t) => {
  const fixture = createFixture(t)
  const directory = path.join(fixture.root, "node_modules/@types/loaded")
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ typings: "A.d.ts" }))
  fs.writeFileSync(path.join(directory, "A.d.ts"), "declare interface AutomaticA {}\n")
  const resident = await replay(t, fixture, "batched", {
    warm: true, resident: true,
    afterWarm: () => {
      const sibling = fs.mkdtempSync(path.join(path.dirname(fixture.root), "arkts-unrelated-type-"))
      t.after(() => fs.rmSync(sibling, { recursive: true, force: true }))
    },
  })
  const fresh = await replay(t, fixture, "legacy")
  assert.deepEqual(resident.results, fresh.results)
  assertKnownReferences(fixture, resident.results)
  assert.equal(resident.events.filter(event => event.event === "references.resident.hit").length, 2)
  assert.equal(resident.events.filter(event => event.event === "references.batch.start").length, 0)
})

test("resident reuse is opt-in and does not depend on tracing", async (t) => {
  const fixture = createFixture(t)
  const control = await replay(t, fixture, "batched", { warm: true })
  assert.ok(!control.events.some(event => event.event === "references.resident.hit"))
  assert.ok(control.events.some(event => event.event === "references.batch.start"))
  const untraced = await replay(t, fixture, "batched", { warm: true, resident: true, trace: false })
  assert.deepEqual(untraced.results, control.results)
  assertKnownReferences(fixture, untraced.results)
})

test("a selective resident Program cannot omit a disconnected legal constructor call", async (t) => {
  const fixture = createFixture(t, { disconnected: true })
  const legacy = await replay(t, fixture, "legacy")
  const selective = await replay(t, fixture, "batched", { warm: "selective", resident: true })
  assert.deepEqual(selective.results, legacy.results)
  assert.ok(selective.results.every(result => result.map(JSON.parse)
    .some(location => location.uri === fixture.uri("ZHidden.ets"))))
  assert.ok(!selective.events.some(event => event.event === "references.resident.hit"))
  assert.ok(selective.events.some(event => event.event === "references.batch.start"))
})

test("an unnotified source edit rejects the old resident text and preserves new references", async (t) => {
  const fixture = createFixture(t)
  const resident = await replay(t, fixture, "batched", {
    warm: true, resident: true,
    afterWarm: () => {
      fixture.sources["Derived.ets"] += "export const changed = new Child()\n"
      fs.writeFileSync(path.join(fixture.root, "Derived.ets"), fixture.sources["Derived.ets"])
    },
  })
  const fresh = await replay(t, fixture, "legacy")
  assert.deepEqual(resident.results, fresh.results)
  assert.ok(resident.results.every(result => result.map(JSON.parse)
    .some(location => location.uri === fixture.uri("Derived.ets") && location.range.start.line === 3)))
  assert.ok(!resident.events.some(event => event.event === "references.resident.hit"))
})

test("an edited unsaved overlay invalidates the resident proof without dropping new calls", async (t) => {
  const fixture = createFixture(t)
  const resident = await replay(t, fixture, "batched", {
    warm: true, resident: true,
    afterWarm: session => {
      fixture.overlay = fixture.sources["Consumer.ets"]
        + "export const unsaved = new Maker()\nexport const edited = new Maker()\n"
      session.changeDocument({ uri: fixture.uri("Consumer.ets"), version: 2, text: fixture.overlay })
    },
  })
  const fresh = await replay(t, fixture, "legacy")
  assert.deepEqual(resident.results, fresh.results)
  assert.ok(resident.results.every(result => result.map(JSON.parse)
    .some(location => location.uri === fixture.uri("Consumer.ets") && location.range.start.line === 3)))
  assert.ok(!resident.events.some(event => event.event === "references.resident.hit"))
})

test("level3 disposal invalidates resident reuse and the complete fallback recovers", async (t) => {
  const fixture = createFixture(t)
  const legacy = await replay(t, fixture, "legacy")
  const disposed = await replay(t, fixture, "batched", {
    warm: true, resident: true, benchmarkControl: true,
    afterWarm: async session => {
      const response = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
      assert.deepEqual(response.result, { applied: "level3" })
    },
  })
  assert.deepEqual(disposed.results, legacy.results)
  assertKnownReferences(fixture, disposed.results)
  assert.ok(!disposed.events.some(event => event.event === "references.resident.hit"))
  assert.ok(disposed.events.some(event => event.event === "references.batch.start"))
})

test("a cancelled resident request publishes no partial result and the next exact query recovers", async (t) => {
  const fixture = createFixture(t)
  // Generated regression work, not a real-project performance fixture.
  fixture.sources["Derived.ets"] += Array.from({ length: 2_000 }, (_, index) =>
    `export const cancellation${index} = new Child()\n`).join("")
  fs.writeFileSync(path.join(fixture.root, "Derived.ets"), fixture.sources["Derived.ets"])
  const resident = await replay(t, fixture, "batched", {
    warm: true, resident: true,
    afterWarm: async (session, logs) => {
      const id = 500
      session.transport.send({ jsonrpc: "2.0", id, method: "textDocument/references", params: {
        textDocument: { uri: fixture.uri("Target.ets") },
        position: positionAt(fixture.sources["Target.ets"], fixture.sources["Target.ets"].lastIndexOf("Thing") + 1),
        context: { includeDeclaration: false },
      } })
      await waitForEvent(logs, "references.queue.start")
      session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
      const response = await session.transport.response(id, 10_000)
      assert.equal(response.error?.code, -32800, JSON.stringify(response.error))
      assert.equal(response.result, undefined)
    },
  })
  const fresh = await replay(t, fixture, "legacy")
  assert.deepEqual(resident.results, fresh.results)
  assert.ok(resident.events.some(event => event.event === "references.resident.hit"))
  assert.ok(!resident.events.some(event => event.event === "references.batch.start"))
})

test("one exact full-Program constructor search avoids remaining redundant batches", async (t) => {
  const fixture = createFixture(t)
  const legacy = await replay(t, fixture, "legacy")
  const batched = await replay(t, fixture, "batched")
  assert.deepEqual(batched.results, legacy.results)
  assertKnownReferences(fixture, batched.results)
  const plans = batched.events.filter(event => event.event === "references.plan.complete")
  assert.equal(plans.length, 2)
  assert.ok(plans.every(event => event.batchCount > 1), "must plan multiple genuine batches")
  const completed = batched.events.filter(event => event.event === "references.batch.complete")
  assert.equal(completed.length, 2, "one compiler search per declaration policy is sufficient")
  const coverage = batched.events.filter(event => event.event === "references.search-scope.complete")
  assert.equal(coverage.length, 2)
  assert.ok(coverage.every(event => event.skippedBatches > 0))
})

test("an unsearched legal file prevents early completion and keeps inherited alias calls", async (t) => {
  const fixture = createFixture(t, { disconnected: true })
  const legacy = await replay(t, fixture, "legacy")
  const batched = await replay(t, fixture, "batched")
  assert.deepEqual(batched.results, legacy.results)
  assertKnownReferences(fixture, batched.results)
  for (const result of batched.results) {
    assert.ok(result.map(JSON.parse).some(location => location.uri === fixture.uri("ZHidden.ets")
      && location.range.start.line === 1), "do not omit a disconnected inherited constructor call")
  }
  const completed = batched.events.filter(event => event.event === "references.batch.complete")
  const plans = batched.events.filter(event => event.event === "references.plan.complete")
  assert.equal(completed.length, plans.reduce((count, plan) => count + plan.batchCount, 0))
  assert.ok(batched.events.filter(event => event.event === "references.search-scope.complete")
    .every(event => event.skippedBatches === 0))
})

test("a zero-definition response is not proof of a completed full-scope search", async (t) => {
  const fixture = createFixture(t)
  const { results, events } = await replay(t, fixture, "batched", { noAnchor: true })
  assert.deepEqual(results, [[], []])
  assert.ok(!events.some(event => event.event === "references.search-scope.complete"))
  const completed = events.filter(event => event.event === "references.batch.complete")
  const plans = events.filter(event => event.event === "references.plan.complete")
  assert.equal(completed.length, plans.reduce((count, plan) => count + plan.batchCount, 0))
})

test("full-scope completion survives rejected class seeds and does not depend on tracing", async (t) => {
  const fixture = createFixture(t)
  const legacy = await replay(t, fixture, "legacy")
  const seeded = await replay(t, fixture, "indexed-batched", { localSeed: true })
  assert.deepEqual(seeded.results, legacy.results)
  assert.ok(seeded.events.some(event => event.event === "references.anchor.seed.rejected"))
  assert.ok(seeded.events.some(event => event.event === "references.search-scope.complete"
    && event.skippedBatches > 0))
  const untraced = await replay(t, fixture, "batched", { trace: false })
  assert.deepEqual(untraced.results, legacy.results)
  assert.ok(!untraced.events.some(event => event.event === "references.search-scope.complete"))
})

function createFixture(t, { disconnected = false, namedPackage = false, installedPackage = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-coverage-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sources = {
    "Target.ets": [
      'import "./Consumer"', 'import "./Derived"', 'import "./SameName"',
      "export class Thing {", "  constructor() {}",
      "  static make() { return new this() }", "}",
      "export const seed = new Thing()", "",
    ].join("\n"),
    "Consumer.ets": 'import { Thing as Maker } from "./Target"\nexport const use = new Maker()\n',
    "Derived.ets": 'import { Thing } from "./Target"\nexport class Child extends Thing {}\nexport const leaf = new Child()\n',
    "SameName.ets": "export class Thing { constructor() {} }\nexport const other = new Thing()\n",
  }
  if (disconnected) sources["ZHidden.ets"] =
    'import { Child as Leaf } from "./Derived"\nexport const hidden = new Leaf()\n'
  if (namedPackage) {
    sources["Target.ets"] = sources["Target.ets"].replace('import "./SameName"',
      'import "./SameName"; import "./PackageConsumer"')
    sources["PackageConsumer.ets"] =
      'import { Thing as PackageThing } from "shared"\nexport const use = new PackageThing()\n'
    sources["shared/A.ets"] = 'export { Thing } from "../Target"\n'
    sources["shared/B.ets"] = "export class Thing { constructor() {} }\n"
    fs.mkdirSync(path.join(root, "shared"))
    fs.writeFileSync(path.join(root, "oh-package.json5"), "{ dependencies: { shared: 'file:./shared' } }")
    fs.writeFileSync(path.join(root, "shared/oh-package.json5"), "{ main: 'A.ets' }")
  }
  if (installedPackage) {
    delete sources["shared/A.ets"]
    delete sources["shared/B.ets"]
    sources["shared/A/Index.ets"] = 'export { Thing } from "../../Target"\n'
    sources["shared/B/Index.ets"] = "export class Thing { constructor() {} }\n"
    for (const entry of ["A", "B"]) {
      fs.mkdirSync(path.join(root, "shared", entry))
      fs.writeFileSync(path.join(root, "shared", entry, "oh-package.json5"), "{ main: 'Index.ets' }")
    }
    fs.writeFileSync(path.join(root, "oh-package.json5"), "{ dependencies: { shared: '1.0.0' } }")
    fs.mkdirSync(path.join(root, "oh_modules"))
    fs.symlinkSync(path.join(root, "shared/A"), path.join(root, "oh_modules/shared"),
      process.platform === "win32" ? "junction" : "dir")
  }
  for (const [file, text] of Object.entries(sources)) fs.writeFileSync(path.join(root, file), text)
  return { root, sources, uri: file => pathToFileURL(path.join(root, file)).href }
}

async function replay(t, fixture, strategy, {
  noAnchor = false, localSeed = false, trace = true, warm = false, resident = false, afterWarm,
  benchmarkControl = false,
} = {}) {
  const { root, sources, uri } = fixture
  fixture.replayCount = (fixture.replayCount ?? 0) + 1
  const runId = `${strategy}-${localSeed}-${trace}-${fixture.replayCount}`
  const logs = path.join(root, `${runId}-logs`)
  const session = new LspSession({
    command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot, rootUri: pathToFileURL(root).href,
    capabilities: { window: { workDoneProgress: true } },
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, `${runId}-cache`),
      ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "target/release/arkts-index-sidecar"),
      ARKTS_LSP_LOG_DIR: logs, ARKTS_REFERENCES_STRATEGY: strategy,
      ARKTS_REFERENCES_BATCH_ROOTS: "1", ARKTS_REFERENCES_TRACE: trace ? "1" : "0",
      ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR: localSeed ? "1" : "0", ARKTS_REFERENCES_ANCHOR_REUSE: "0",
      ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS: "0",
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: resident ? "1" : "0",
      ARKTS_BENCHMARK_CONTROL: benchmarkControl ? "1" : "0",
    },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  const create = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  await session.transport.progress(create.params.token, message => message.params.value.kind === "end", 10_000)
  session.openDocument({ uri: uri("Target.ets"), version: 1, text: sources["Target.ets"] })
  const overlay = fixture.overlay ?? sources["Consumer.ets"] + "export const unsaved = new Maker()\n"
  session.openDocument({ uri: uri("Consumer.ets"), version: 1, text: overlay })
  if (warm) {
    const response = await session.request(warm === "selective" ? "textDocument/definition"
      : "textDocument/implementation", {
      textDocument: { uri: uri("Target.ets") },
      position: positionAt(sources["Target.ets"], sources["Target.ets"].indexOf("Thing") + 1),
    }, { timeoutMs: 30_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
  }
  await afterWarm?.(session, logs)
  const results = []
  for (const includeDeclaration of [false, true]) {
    const response = await session.request("textDocument/references", {
      textDocument: { uri: uri("Target.ets") },
      position: positionAt(sources["Target.ets"], noAnchor ? sources["Target.ets"].length
        : sources["Target.ets"].lastIndexOf("Thing") + 1),
      context: { includeDeclaration },
    }, { timeoutMs: 30_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    results.push(response.result.map(location => JSON.stringify(location)).sort())
  }
  await session.close({ timeoutMs: 5_000 })
  const events = fs.readFileSync(path.join(logs, "server.log"), "utf8")
    .split("\n").filter(Boolean).map(JSON.parse)
  return { results, events }
}

function assertKnownReferences(fixture, results) {
  for (const result of results) {
    const locations = result.map(value => JSON.parse(value))
    for (const [file, line] of [["Target.ets", 5], ["Target.ets", 7],
      ["Consumer.ets", 1], ["Consumer.ets", 2], ["Derived.ets", 2]]) {
      assert.ok(locations.some(location => location.uri === fixture.uri(file)
        && location.range.start.line === line), `missing known reference ${file}:${line}`)
    }
    assert.ok(!locations.some(location => location.uri === fixture.uri("SameName.ets")))
  }
}

function positionAt(text, offset) {
  const prefix = text.slice(0, offset).split("\n")
  return { line: prefix.length - 1, character: prefix.at(-1).length }
}

function createTestSdk(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resident-sdk-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const directory of ["toolchains", "ets/component", "ets/build-tools/ets-loader"]) {
    fs.mkdirSync(path.join(root, directory), { recursive: true })
  }
  fs.writeFileSync(path.join(root, "ets/oh-uni-package.json"),
    JSON.stringify({ path: "ets", apiVersion: "24", version: "resident-test" }))
  fs.writeFileSync(path.join(root, "ets/component/common.d.ts"), "interface ResidentSdkMarker {}\n")
  fs.writeFileSync(path.join(root, "ets/build-tools/ets-loader/tsconfig.json"),
    JSON.stringify({ compilerOptions: { ets: {} } }))
  return root
}

async function waitForEvent(logs, event, timeoutMs = 10_000) {
  const file = path.join(logs, "server.log")
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    if (fs.existsSync(file) && fs.readFileSync(file, "utf8").split("\n")
      .filter(Boolean).some(line => JSON.parse(line).event === event)) return
    await new Promise(resolve => setTimeout(resolve, 2))
  }
  throw new Error(`timed out waiting for ${event}`)
}
