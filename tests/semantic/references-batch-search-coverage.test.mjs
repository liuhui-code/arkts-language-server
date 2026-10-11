import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

import { assertKnownReferences, createFixture, createTestSdk, positionAt, replay, waitForEvent } from "../support/reference-coverage-replay.mjs"

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

test("L04 selected policy rejects an unnotified package retarget and retains only current fallback state", async t => {
  const fixture = createFixture(t, { namedPackage: true })
  const before = await replay(t, fixture, "legacy")
  assert.ok(before.results.every(result => result.map(JSON.parse)
    .some(location => location.uri === fixture.uri("PackageConsumer.ets"))))
  const resident = await replay(t, fixture, "batched", {
    warm: true, resident: true,
    runtimeEnv: {
      ARKTS_BENCHMARK_CONTROL: "1", ARKTS_MEMORY_BUDGET_MB: "1024",
      ARKTS_REFERENCES_CONTEXT_RETENTION: "budget-aware", ARKTS_L03_COST_AWARE_EVICTION: "1",
      ARKTS_L01_PRESSURE_ADMISSION: "1", ARKTS_L01_TRANSIENT_DIAGNOSTICS: "1",
      ARKTS_L01_SEMANTIC_WORKER_RECYCLE: "0", ARKTS_L03_PRESSURE_WORKER_RECYCLE: "0",
    },
    afterWarm: () => fs.writeFileSync(path.join(fixture.root, "shared/oh-package.json5"), "{ main: 'B.ets' }"),
  })
  const fresh = await replay(t, fixture, "legacy")
  assert.deepEqual(resident.results, fresh.results)
  assert.ok(fresh.results.every(result => !result.map(JSON.parse)
    .some(location => location.uri === fixture.uri("PackageConsumer.ets"))))
  assert.ok(!resident.events.some(event => event.event === "references.resident.hit"))
  assert.ok(resident.events.some(event => event.event === "references.batch.start"))
  assert.ok(resident.events.some(event => event.event === "references.context.retention"
    && event.profile === "budget-aware" && event.removed === false), "actually run the selected budget policy")
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
  assert.ok(selective.events.some(event => event.event === "references.resident.proof.rejected"
    && event.reason === "inputs-incomplete"),
  "the incomplete preparation must expose its admission reason without changing the complete fallback")
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

test("an unprovable loaded lookup exposes its configuration failure without guessing resident input", async (t) => {
  const fixture = createFixture(t)
  fixture.sources["Target.ets"] = 'import "./Poison"\n' + fixture.sources["Target.ets"]
  fs.writeFileSync(path.join(fixture.root, "Target.ets"), fixture.sources["Target.ets"])
  fs.symlinkSync(path.join(fixture.root, "does-not-exist.ts"), path.join(fixture.root, "Poison.ts"), "file")
  const resident = await replay(t, fixture, "batched", { warm: "incomplete-implementation", resident: true })
  const fresh = await replay(t, fixture, "legacy")
  assert.deepEqual(resident.results, fresh.results)
  assert.ok(!resident.events.some(event => event.event === "references.resident.hit"))
  assert.ok(resident.events.some(event => event.event === "references.batch.start"))
  assert.ok(resident.events.some(event => event.event === "references.resident.proof.rejected"
    && event.stage === "configuration" && event.reason === "configuration-identity-unavailable"
    && event.sourcePath === path.join(fixture.root, "Poison.ts")),
  "the actual unprovable compiler lookup must identify its cause and source")
})

test("negative descendants share their loaded absent ancestor without exhausting resident admission", async (t) => {
  const fixture = createFixture(t)
  fixture.sources["Target.ets"] = Array.from({ length: 800 }, (_, index) =>
    `import "./Absent/Probe${index}"`).join("\n") + "\n" + fixture.sources["Target.ets"]
  fs.writeFileSync(path.join(fixture.root, "Target.ets"), fixture.sources["Target.ets"])
  const resident = await replay(t, fixture, "batched", { warm: true, resident: true })
  const fresh = await replay(t, fixture, "legacy")
  assert.deepEqual(resident.results, fresh.results)
  assert.ok(!resident.events.some(event => event.reason === "configuration-witness-capacity"),
    "one actually observed absent ancestor must not occupy thousands of witness paths")
  assert.equal(resident.events.filter(event => event.event === "references.resident.hit").length, 2)
  assert.ok(!resident.events.some(event => event.event === "references.batch.start"))
  const created = await replay(t, fixture, "batched", { warm: true, resident: true,
    afterWarm: () => fs.mkdirSync(path.join(fixture.root, "Absent")) })
  assert.deepEqual(created.results, (await replay(t, fixture, "legacy")).results)
  assert.equal(created.events.filter(event => /^references\.resident\.(hit|miss)$/u.test(event.event))[0]?.event,
    "references.resident.miss", "creating the witnessed ancestor must invalidate the old proof")
})

test("an observed directory proves absent children without exhausting resident admission", async (t) => {
  const fixture = createFixture(t)
  fs.mkdirSync(path.join(fixture.root, "node_modules"))
  fixture.sources["Target.ets"] = Array.from({ length: 800 }, (_, index) =>
    `import "probe-package-${index}"`).join("\n") + "\n" + fixture.sources["Target.ets"]
  fs.writeFileSync(path.join(fixture.root, "Target.ets"), fixture.sources["Target.ets"])
  const resident = await replay(t, fixture, "batched", { warm: true, resident: true })
  const fresh = await replay(t, fixture, "legacy")
  assert.deepEqual(resident.results, fresh.results)
  assert.ok(!resident.events.some(event => event.reason === "configuration-witness-capacity"),
    "an actually observed unchanged directory must cover its actual absent child lookups")
  assert.equal(resident.events.filter(event => event.event === "references.resident.hit").length, 2)
  assert.ok(!resident.events.some(event => event.event === "references.batch.start"))
  const changed = await replay(t, fixture, "batched", { warm: true, resident: true,
    afterWarm: () => fs.writeFileSync(path.join(fixture.root, "node_modules/unrelated.txt"), "changed") })
  assert.deepEqual(changed.results, (await replay(t, fixture, "legacy")).results)
  assert.equal(changed.events.filter(event => /^references\.resident\.(hit|miss)$/u.test(event.event))[0]?.event,
    "references.resident.miss", "a changed directly observed owner must not certify its old child decisions")
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

for (const selectedPolicy of [false, true]) {
test(selectedPolicy ? "L04 selected policy cancels a resident request without partial success and recovers exact references"
  : "a cancelled resident request publishes no partial result and the next exact query recovers", async (t) => {
  const fixture = createFixture(t)
  // Generated regression work, not a real-project performance fixture.
  fixture.sources["Derived.ets"] += Array.from({ length: 2_000 }, (_, index) =>
    `export const cancellation${index} = new Child()\n`).join("")
  fs.writeFileSync(path.join(fixture.root, "Derived.ets"), fixture.sources["Derived.ets"])
  const resident = await replay(t, fixture, "batched", {
    warm: true, resident: true,
    runtimeEnv: selectedPolicy ? {
      ARKTS_BENCHMARK_CONTROL: "1", ARKTS_MEMORY_BUDGET_MB: "1024",
      ARKTS_REFERENCES_CONTEXT_RETENTION: "budget-aware", ARKTS_L03_COST_AWARE_EVICTION: "1",
      ARKTS_L01_PRESSURE_ADMISSION: "1", ARKTS_L01_TRANSIENT_DIAGNOSTICS: "1",
      ARKTS_L01_SEMANTIC_WORKER_RECYCLE: "0", ARKTS_L03_PRESSURE_WORKER_RECYCLE: "0",
    } : {},
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
}

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
