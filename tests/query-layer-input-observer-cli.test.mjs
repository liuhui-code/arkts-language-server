import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

import { makeQueryLayerFixture } from "./support/query-layer-fixture.mjs"
import { saveSuite } from "./support/prepared-suite-fixture.mjs"
import { digestJson } from "../scripts/bench/prepared-suite-input.mjs"
import { sha256File } from "../scripts/bench/reference-replay-input.mjs"

const runner = path.resolve("scripts/bench/query-layer-probe.mjs")

test("owner compiler observation records actual Worker definition calls and Program returns without changing exact results",
  { timeout: 60_000 }, async t => {
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Query.ets": "export function targetThing() { return 1 }\n",
        "Use.ets": 'import { targetThing } from "./Query"\nexport const result = targetThing()\n' },
      target: { kind: "definition", file: "Use.ets", symbol: "targetThing", position: { line: 1, character: 22 } },
      oracle: { schemaVersion: 1, locations: [{ file: "Query.ets", range: {
        start: { line: 0, character: 16 }, end: { line: 0, character: 27 },
      } }] },
    })
    const reports = []
    for (const enabled of [false, true]) {
      const output = path.join(fixture.directory, `${enabled ? "observed" : "normal"}-worker-objects.json`)
      const result = spawnSync(process.execPath, [runner, "--layer", "owner", "--manifest", fixture.input,
        "--out", output, ...(enabled ? ["--observe-inputs"] : [])], { encoding: "utf8", timeout: 25_000 })
      const report = JSON.parse(fs.readFileSync(output, "utf8"))
      assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}\n${JSON.stringify({ requests: report.requests,
        observations: report.inputOperations?.workerCompilerObjects?.map(record => ({ boundary: record.boundary,
          failure: record.compilerObjects.failure, registries: record.compilerObjects.registries })) })}`)
      assert.ok(report.requests.every(request => request.correctness.equal))
      assert.equal(report.inputIdentityUnchanged, true)
      assert.equal(report.preparation.targetQueries, 0)
      assert.equal(report.releaseEligible, false)
      reports.push(report)
    }
    assert.equal(reports[0].inputOperations, undefined)
    assert.deepEqual(reports[1].requests.map(q => q.locations), reports[0].requests.map(q => q.locations))
    const records = reports[1].inputOperations.workerCompilerObjects
    assert.ok(Array.isArray(records), "observe compiler returns in the actual Worker, not the owner driver")
    const worker = records.find(record => record.entryFile === "semantic-worker.cjs")
    assert.equal(worker.pid, reports[1].pid)
    assert.ok(worker.threadId > 0)
    assert.equal(worker.compilerObjects.complete, true)
    assert.equal(worker.compilerObjects.normalTimingEvidence, false)
    assert.ok(worker.compilerObjects.serviceStarts > 0)
    assert.ok(worker.compilerObjects.events.length > 0)
    assert.ok(worker.compilerObjects.programs.some(program => program.sources.some(source =>
      source.file === path.join(fixture.suite.workspace, "Query.ets"))))
    assert.ok(worker.compilerObjects.programs.some(program => program.sources.some(source =>
      source.file === path.join(path.dirname(fixture.suite.server), "lib.es5.d.ts"))), "keep the real production standard-library path")
    for (const registry of worker.compilerObjects.registries) {
      assert.equal(registry.outstandingLeases, registry.observedOutstandingLeases)
      assert.equal(registry.outstandingLeaseSource, "pinned-fork-refcounts-for-observed-public-path-kind")
    }
    const calls = worker.compilerObjects.calls.filter(call => call.method === "getDefinitionAtPosition")
    assert.ok(calls.length >= 2)
    for (const call of calls) {
      assert.equal(call.terminalStatus, "returned")
      assert.ok(call.completedMs >= call.startedMs && call.completedMs <= worker.observedAtMs)
      assert.equal(call.elapsedMs, call.completedMs - call.startedMs)
    }
  })

test("compiler target-call attribution records the executed definition intervals and exact returned array lengths",
  { timeout: 30_000 }, async t => {
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Query.ets": "export function targetThing() { return 1 }\n",
        "Use.ets": 'import { targetThing } from "./Query"\nexport const result = targetThing()\n' },
      target: { kind: "definition", file: "Use.ets", symbol: "targetThing", position: { line: 1, character: 22 } },
      oracle: { schemaVersion: 1, locations: [{ file: "Query.ets", range: {
        start: { line: 0, character: 16 }, end: { line: 0, character: 27 },
      } }] },
    })
    const result = spawnSync(process.execPath, [runner, "--layer", "official", "--manifest", fixture.input,
      "--out", fixture.output, "--observe-inputs"], { encoding: "utf8", timeout: 25_000 })
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.ok(report.requests.every(request => request.correctness.equal))
    assert.equal(report.preparation.targetQueries, 0)
    assert.ok(Array.isArray(report.compilerObjects.calls), "record actual target APIs, not only getProgram returns")
    assert.deepEqual(report.compilerObjects.calls.map(call => [call.scenarioId, call.method, call.returnedArrayLength]),
      [["first", "getDefinitionAtPosition", 1], ["repeat", "getDefinitionAtPosition", 1]])
    for (const call of report.compilerObjects.calls) {
      assert.equal(call.phase, "query")
      assert.equal(call.terminalStatus, "returned")
      assert.ok(Number.isFinite(call.startedMs) && call.completedMs >= call.startedMs)
      assert.equal(call.elapsedMs, call.completedMs - call.startedMs)
      const boundary = suffix => report.timeline.find(event => event.phase === `query-${suffix}`
        && event.scenarioId === call.scenarioId)
      assert.ok(call.startedMs >= boundary("start").monotonicMs)
      assert.ok(call.completedMs <= boundary("complete").monotonicMs)
    }
    assert.equal(report.compilerObjects.normalTimingEvidence, false)
  })

test("official Registry lifecycle observes real acquires and releases before successful probe shutdown",
  { timeout: 30_000 }, async t => {
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Query.ets": "export function targetThing() { return 1 }\n",
        "Use.ets": 'import { targetThing } from "./Query"\nexport const result = targetThing()\n' },
      target: { kind: "definition", file: "Use.ets", symbol: "targetThing", position: { line: 1, character: 22 } },
      oracle: { schemaVersion: 1, locations: [{ file: "Query.ets", range: {
        start: { line: 0, character: 16 }, end: { line: 0, character: 27 },
      } }] },
    })
    const result = spawnSync(process.execPath, [runner, "--layer", "official", "--manifest", fixture.input,
      "--out", fixture.output, "--observe-inputs"], { encoding: "utf8", timeout: 25_000 })
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.ok(report.requests.every(request => request.correctness.equal))
    assert.equal(report.officialServiceStarts, 1)
    assert.equal(report.preparation.targetQueries, 0)
    assert.ok(Array.isArray(report.compilerObjects.registries), "observe actual Registry ownership, not inferred disposal")
    assert.equal(report.compilerObjects.registries.length, 1)
    const registry = report.compilerObjects.registries[0]
    assert.ok(registry.acquired > 0)
    assert.equal(registry.released, registry.acquired)
    assert.ok(registry.peakOutstandingLeases > 0)
    assert.equal(registry.outstandingLeases, 0)
    assert.equal(registry.observedOutstandingLeases, 0)
    assert.equal(registry.outstandingLeaseSource, "pinned-fork-refcounts-for-observed-public-path-kind")
    assert.equal(registry.leaseKeyScope, "public-base-bucket-and-path")
    assert.equal(registry.unmatchedReleases, 0)
    assert.equal(report.compilerObjects.successfulServiceDisposals, 1)
    assert.equal(report.compilerObjects.complete, true)
    assert.equal(report.compilerObjects.normalTimingEvidence, false)
  })

test("official object observation identifies the returned Program and unchanged SourceFiles without extra service starts",
  { timeout: 30_000 }, async t => {
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Query.ets": "export function targetThing() { return 1 }\n",
        "Use.ets": 'import { targetThing } from "./Query"\nexport const result = targetThing()\n' },
      target: { kind: "definition", file: "Use.ets", symbol: "targetThing", position: { line: 1, character: 22 } },
      oracle: { schemaVersion: 1, locations: [{ file: "Query.ets", range: {
        start: { line: 0, character: 16 }, end: { line: 0, character: 27 },
      } }] },
    })
    const reports = []
    for (const enabled of [false, true]) {
      const output = path.join(fixture.directory, `${enabled ? "observed" : "normal"}-objects.json`)
      const result = spawnSync(process.execPath, [runner, "--layer", "official", "--manifest", fixture.input,
        "--out", output, ...(enabled ? ["--observe-inputs"] : [])], { encoding: "utf8", timeout: 25_000 })
      assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
      const report = JSON.parse(fs.readFileSync(output, "utf8"))
      assert.equal(report.officialServiceStarts, 1)
      assert.equal(report.preparation.targetQueries, 0)
      assert.ok(report.requests.every(request => request.correctness.equal && !request.answerCacheHit))
      assert.equal(report.inputIdentityUnchanged, true)
      assert.equal(report.releaseEligible, false)
      reports.push(report)
    }
    assert.equal(reports[0].compilerObjects, undefined, "normal probes do not enable object observations")
    assert.deepEqual(reports[1].requests.map(request => request.locations), reports[0].requests.map(request => request.locations))
    const observation = reports[1].compilerObjects
    assert.ok(observation, "actual compiler object identities must be reported, not inferred from phases")
    assert.equal(observation.boundary, "OFFICIAL_LANGUAGE_SERVICE_PUBLIC_OBJECTS")
    assert.equal(observation.normalTimingEvidence, false)
    assert.equal(observation.complete, true)
    assert.equal(observation.pid, reports[1].pid)
    const queryEvents = id => observation.events.filter(event => event.phase === "query" && event.scenarioId === id)
    const first = queryEvents("first").at(-1)
    const repeat = queryEvents("repeat").at(-1)
    assert.ok(first && repeat, "each actual query must expose its existing getProgram return")
    assert.equal(first.programId, repeat.programId)
    const program = observation.programs.find(program => program.id === first.programId)
    for (const file of ["Query.ets", "Use.ets"]) {
      const source = program.sources.find(source => source.file === path.join(fixture.suite.workspace, file))
      assert.ok(Number.isSafeInteger(source?.id) && source.id > 0, `${file} must be an actual observed SourceFile`)
    }
    assert.ok(program.sources.some(source => source.file.startsWith(fixture.suite.sdk + path.sep)),
      "the complete actual Program must still contain its SDK sources")
  })

test("official diagnostic observer counts executed input operations without changing exact results",
  { timeout: 30_000 }, async t => {
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Query.ets": "export function targetThing() { return 1 }\n",
        "Use.ets": 'import { targetThing } from "./Query"\nexport const result = targetThing()\n' },
      target: { kind: "definition", file: "Use.ets", symbol: "targetThing", position: { line: 1, character: 22 } },
      oracle: { schemaVersion: 1, locations: [{ file: "Query.ets", range: {
        start: { line: 0, character: 16 }, end: { line: 0, character: 27 },
      } }] },
    })
    const result = spawnSync(process.execPath, [runner, "--layer", "official",
      "--manifest", fixture.input, "--out", fixture.output, "--observe-inputs"],
    { encoding: "utf8", timeout: 25_000 })
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.ok(report.requests.every(request => request.correctness.equal && !request.answerCacheHit))
    assert.equal(report.preparation.targetQueries, 0)
    assert.equal(report.inputIdentityUnchanged, true)
    assert.equal(report.releaseEligible, false)
    const observation = report.inputOperations
    assert.equal(observation.boundary, "OFFICIAL_DRIVER_RUN_SYNC_INPUT_APIS")
    assert.equal(observation.countsKind, "native-api-attempts")
    assert.equal(observation.normalTimingEvidence, false)
    assert.equal(observation.pid, report.pid)
    assert.match(observation.observerSha256, /^[0-9a-f]{64}$/u)
    assert.ok(observation.windows.find(window => window.phase === "setup").counts.readFileSync > 0)
    const preparation = observation.windows.find(window => window.phase === "preparation")
    for (const key of ["statSync", "lstatSync", "realpathSyncNative", "hashUpdate"]) {
      assert.ok(preparation.counts[key] > 0, `${key} must count actual preparation operations`)
    }
    const queries = observation.windows.filter(window => window.phase === "query")
    assert.deepEqual(queries.map(window => window.scenarioId), report.requests.map(request => request.scenarioId))
    for (const window of observation.windows) {
      for (const value of Object.values(window.counts)) assert.ok(Number.isSafeInteger(value) && value >= 0)
    }
  })

test("compiler return timing records real getter intervals inside the existing preparation and query boundaries",
  { timeout: 30_000 }, async t => {
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Query.ets": "export function targetThing() { return 1 }\n",
        "Use.ets": 'import { targetThing } from "./Query"\nexport const result = targetThing()\n' },
      target: { kind: "definition", file: "Use.ets", symbol: "targetThing", position: { line: 1, character: 22 } },
      oracle: { schemaVersion: 1, locations: [{ file: "Query.ets", range: {
        start: { line: 0, character: 16 }, end: { line: 0, character: 27 },
      } }] },
    })
    const result = spawnSync(process.execPath, [runner, "--layer", "official", "--manifest", fixture.input,
      "--out", fixture.output, "--observe-inputs"], { encoding: "utf8", timeout: 25_000 })
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.ok(report.requests.every(request => request.correctness.equal))
    assert.equal(report.preparation.targetQueries, 0)
    assert.equal(report.compilerObjects.normalTimingEvidence, false)
    for (const phase of ["preparation", "query"]) {
      const events = report.compilerObjects.events.filter(event => event.phase === phase)
      assert.ok(events.length > 0, `${phase} must have actual getter returns`)
      for (const event of events) {
        assert.ok(Number.isFinite(event.startedMs) && Number.isFinite(event.completedMs),
          "a getter return must retain its actual monotonic interval, not a phase duration")
        assert.ok(event.completedMs >= event.startedMs)
        assert.equal(event.elapsedMs, event.completedMs - event.startedMs)
        const boundary = suffix => report.timeline.find(item => item.phase === `${phase}-${suffix}`
          && (phase !== "query" || item.scenarioId === event.scenarioId))
        assert.ok(event.startedMs >= boundary("start").monotonicMs)
        assert.ok(event.completedMs <= boundary("complete").monotonicMs)
      }
    }
  })

test("official object observations distinguish edited Program and SourceFile returns from the previous snapshot",
  { timeout: 30_000 }, async t => {
    const query = "export function targetThing() { return 1 }\n"
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Query.ets": query, "Use.ets": 'import { targetThing } from "./Query"\nexport const result = targetThing()\n' },
      target: { kind: "definition", file: "Use.ets", symbol: "targetThing", position: { line: 1, character: 22 } },
      oracle: { schemaVersion: 1, locations: [{ file: "Query.ets", range: {
        start: { line: 0, character: 16 }, end: { line: 0, character: 27 },
      } }] },
    })
    const oracle = path.join(fixture.directory, "edited-objects-oracle.json")
    fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, locations: [{ file: "Query.ets", range: {
      start: { line: 1, character: 16 }, end: { line: 1, character: 27 },
    } }] }))
    const changes = [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "/* 😀 */\n" }]
    fixture.suite.scenarios.push({ id: "edited", targetId: "thing", bucket: "edit-body",
      edit: { file: "Query.ets", changes, sha256: digestJson(changes),
        oracle: { path: oracle, sha256: sha256File(oracle), verified: true } } })
    saveSuite(fixture)
    const result = spawnSync(process.execPath, [runner, "--layer", "official", "--manifest", fixture.input,
      "--out", fixture.output, "--observe-inputs"], { encoding: "utf8", timeout: 25_000 })
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.compilerObjects.complete, true)
    assert.ok(report.requests.every(request => request.correctness.equal))
    assert.equal(report.inputIdentityUnchanged, true)
    assert.equal(fs.readFileSync(path.join(fixture.suite.workspace, "Query.ets"), "utf8"), query)
    const program = id => {
      const event = report.compilerObjects.events.filter(event => event.phase === "query" && event.scenarioId === id).at(-1)
      assert.ok(event, `${id} must expose an actual getProgram return`)
      return report.compilerObjects.programs.find(program => program.id === event.programId)
    }
    const previous = program("repeat")
    const current = program("edited")
    assert.notEqual(current.id, previous.id)
    const source = program => program.sources.find(source => source.file === path.join(fixture.suite.workspace, "Query.ets"))
    assert.notEqual(source(current).id, source(previous).id)
    assert.ok([...previous.sources, ...current.sources].every(source => !Object.hasOwn(source, "text")),
      "the report stores identity metadata, not old source text or ASTs")
    const registry = report.compilerObjects.registries[0]
    assert.ok(registry.updated > 0, "the real overlay must exercise Registry updates, not an inferred rebuild")
    assert.equal(registry.acquired, registry.released)
    assert.equal(registry.observedOutstandingLeases, 0)
    assert.equal(registry.outstandingLeases, 0, "pinned fork statistics must independently confirm observed-path zero residual leases")
    assert.equal(registry.untrackedUpdates, 0)
    assert.equal(registry.unmatchedReleases, 0)
    assert.equal(report.compilerObjects.successfulServiceDisposals, 1)
  })

test("owner input observation follows the SDK cache Worker across an unsaved reference edit",
  { timeout: 30_000 }, async t => {
    const source = 'import { TargetThing } from "./Query"\nexport const value = new TargetThing()\n'
    const locations = [
      { file: "Use.ets", range: { start: { line: 0, character: 9 }, end: { line: 0, character: 20 } } },
      { file: "Use.ets", range: { start: { line: 1, character: 25 }, end: { line: 1, character: 36 } } },
    ]
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Query.ets": "export class TargetThing {}\n", "Use.ets": source },
      target: { kind: "references", file: "Query.ets", symbol: "TargetThing",
        includeDeclaration: false, position: { line: 0, character: 14 } },
      oracle: { schemaVersion: 1, locations },
    })
    const editedOracle = path.join(fixture.directory, "edited-input-oracle.json")
    fs.writeFileSync(editedOracle, JSON.stringify({ schemaVersion: 1, locations: [...locations,
      { file: "Use.ets", range: { start: { line: 2, character: 24 }, end: { line: 2, character: 35 } } },
    ] }))
    const changes = [{ range: { start: { line: 2, character: 0 }, end: { line: 2, character: 0 } },
      newText: "export const more = new TargetThing()\n" }]
    fixture.suite.scenarios.push({ id: "edited", targetId: "thing", bucket: "edit-reference",
      edit: { file: "Use.ets", changes, sha256: digestJson(changes),
        oracle: { path: editedOracle, sha256: sha256File(editedOracle), verified: true } } })
    // This control observes real transient work, not the default resident route.
    fixture.suite.runtime.env.ARKTS_REFERENCES_RESIDENT_FAST_PATH = "0"
    saveSuite(fixture)
    const result = spawnSync(process.execPath, [runner, "--layer", "owner", "--manifest", fixture.input,
      "--out", fixture.output, "--observe-inputs"], { encoding: "utf8", timeout: 25_000 })
    assert.ok(fs.existsSync(fixture.output), `${result.status}: ${result.stderr}\n${result.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}\n${JSON.stringify({ requests: report.requests,
      observations: report.inputOperations?.workerCompilerObjects?.map(record => ({ entryFile: record.entryFile,
        boundary: record.boundary, failure: record.compilerObjects.failure, registries: record.compilerObjects.registries })) })}`)
    assert.equal(report.requests.length, 3)
    assert.ok(report.requests.every(request => request.correctness.equal))
    assert.equal(report.requests[2].answerCacheHit, false)
    assert.equal(report.inputIdentityUnchanged, true)
    assert.equal(fs.readFileSync(path.join(fixture.suite.workspace, "Use.ets"), "utf8"), source)
    const verifier = report.inputOperations.workerSnapshots.filter(snapshot => (
      snapshot.entryFile === "reference-verifier-worker.cjs"))
    assert.ok(verifier.some(snapshot => snapshot.threadId > 0 && snapshot.counts.hashUpdate > 0))
    assert.ok(report.inputOperations.workerSnapshots.some(snapshot => snapshot.entryFile === "semantic-worker.cjs"))
    assert.equal(report.inputOperations.workerArtifacts.baselineByteIdentical, true)
    const compilers = report.inputOperations.workerCompilerObjects.filter(record => record.entryFile === "reference-verifier-worker.cjs")
    assert.ok(compilers.length > 0)
    const lifetimes = report.inputOperations.workerLifecycleEvents
    assert.ok(Array.isArray(lifetimes), "observe parent-side real exits, not infer them from a final reply")
    for (const record of compilers) {
      const events = lifetimes.filter(event => event.pid === record.pid && event.threadId === record.threadId)
      assert.deepEqual(events.map(event => event.event), ["created", "exited"])
      assert.ok(Number.isSafeInteger(events[1].exitCode))
      assert.ok(events[1].observedAtMs >= events[0].observedAtMs)
      assert.equal(events[1].timeOrigin, events[0].timeOrigin)
      assert.equal(record.compilerObjects.complete, true)
      assert.ok(record.compilerObjects.serviceStarts > 1, "one cached Worker runs multiple fresh project LS jobs")
      assert.ok(record.compilerObjects.programs.length > 1)
      assert.ok(record.compilerObjects.calls.some(call => ["findReferences", "getReferencesAtPosition"].includes(call.method)))
      assert.equal(record.compilerObjects.successfulServiceDisposals, record.compilerObjects.serviceStarts)
      const sdkSources = record.compilerObjects.programs.flatMap(program => program.sources)
        .filter(source => source.file.startsWith(fixture.suite.sdk + path.sep) || (path.dirname(source.file) === path.dirname(fixture.suite.server) && /^lib(?:\..+)?\.d\.ts$/u.test(path.basename(source.file))))
      const sdkFiles = new Set(sdkSources.map(source => source.file)).size
      assert.ok(sdkFiles > 0)
      assert.equal(new Set(sdkSources.map(source => source.id)).size, sdkFiles, "actual SDK and compiler-library SourceFiles survive fresh Programs")
      assert.ok(record.compilerObjects.registries.every(registry => registry.outstandingLeases === sdkFiles
        && registry.observedOutstandingLeases === sdkFiles))
    }
  })

test("compiler object event capacity is explicit without dropping completed exact reference requests",
  { timeout: 35_000 }, async t => {
    const lines = ['import { targetThing } from "./Query"',
      ...Array.from({ length: 1024 }, (_, index) => `export const use${index} = targetThing()`)]
    const locations = lines.map((line, index) => ({ file: "Use.ets", range: {
      start: { line: index, character: line.indexOf("targetThing") },
      end: { line: index, character: line.indexOf("targetThing") + 11 },
    } }))
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Query.ets": "export function targetThing() { return 1 }\n", "Use.ets": lines.join("\n") + "\n" },
      target: { kind: "references", file: "Query.ets", symbol: "targetThing", includeDeclaration: false,
        position: { line: 0, character: 16 } }, oracle: { schemaVersion: 1, locations },
    })
    fixture.suite.scenarios.push(...Array.from({ length: 3 }, (_, index) => ({
      id: `capacity-${index}`, targetId: "thing", bucket: "repeated-snapshot",
    })))
    saveSuite(fixture)
    const result = spawnSync(process.execPath, [runner, "--layer", "official", "--manifest", fixture.input,
      "--out", fixture.output, "--observe-inputs"], { encoding: "utf8", timeout: 25_000 })
    assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.status, "FAIL")
    assert.equal(report.releaseEligible, false)
    assert.equal(report.requests.length, 5)
    assert.ok(report.requests.every(request => request.correctness.equal && request.locations.length === locations.length))
    assert.deepEqual(report.unexecutedScenarioIds, [])
    assert.equal(report.inputIdentityUnchanged, true)
    assert.equal(report.compilerObjects.complete, false)
    assert.equal(report.compilerObjects.failure, "QUERY_LAYER_COMPILER_EVENT_CAPACITY")
    assert.equal(report.compilerObjects.events.length, report.compilerObjects.limits.events)
    assert.equal(report.compilerObjects.limits.events, 4096)
  })

test("input observation refuses unknown layers and duplicate switches without an output",
  { timeout: 30_000 }, async t => {
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Query.ets": "export function targetThing() { return 1 }\n" },
      target: { kind: "definition", file: "Query.ets", symbol: "targetThing", position: { line: 0, character: 16 } },
      oracle: { schemaVersion: 1, locations: [{ file: "Query.ets", range: {
        start: { line: 0, character: 16 }, end: { line: 0, character: 27 },
      } }] },
    })
    for (const [layer, switches, error] of [
      ["unknown", ["--observe-inputs"], "QUERY_LAYER_OPTIONS_INVALID"],
      ["official", ["--observe-inputs", "--observe-inputs"], "QUERY_LAYER_OPTIONS_INVALID"],
    ]) {
      const result = spawnSync(process.execPath, [runner, "--layer", layer,
        "--manifest", fixture.input, "--out", fixture.output, ...switches],
      { encoding: "utf8", timeout: 25_000 })
      assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
      assert.match(result.stderr, new RegExp(error, "u"))
      assert.equal(fs.existsSync(fixture.output), false)
    }
  })

test("compiler Program capacity does not certify a truncated edit history or lose any exact answer",
  { timeout: 35_000 }, async t => {
    const query = "export function targetThing() { return 1 }\n"
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Query.ets": query, "Use.ets": 'import { targetThing } from "./Query"\nexport const result = targetThing()\n' },
      target: { kind: "definition", file: "Use.ets", symbol: "targetThing", position: { line: 1, character: 22 } },
      oracle: { schemaVersion: 1, locations: [{ file: "Query.ets", range: {
        start: { line: 0, character: 16 }, end: { line: 0, character: 27 },
      } }] },
    })
    fixture.suite.scenarios.push(...Array.from({ length: 130 }, (_, index) => {
      const changes = [{ range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } },
        newText: query.replace("return 1", `return ${index % 2 + 2}`) }]
      return { id: `edited-${index}`, targetId: "thing", bucket: "edit-body",
        edit: { file: "Query.ets", changes, sha256: digestJson(changes), oracle: fixture.suite.targets[0].oracle } }
    }))
    saveSuite(fixture)
    const result = spawnSync(process.execPath, [runner, "--layer", "official", "--manifest", fixture.input,
      "--out", fixture.output, "--observe-inputs"], { encoding: "utf8", timeout: 25_000 })
    assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.status, "FAIL")
    assert.equal(report.requests.length, 132)
    assert.ok(report.requests.every(request => request.correctness.equal))
    assert.deepEqual(report.unexecutedScenarioIds, [])
    assert.equal(report.inputIdentityUnchanged, true)
    assert.equal(fs.readFileSync(path.join(fixture.suite.workspace, "Query.ets"), "utf8"), query)
    assert.equal(report.compilerObjects.complete, false)
    assert.equal(report.compilerObjects.failure, "QUERY_LAYER_COMPILER_OBJECT_CAPACITY")
    assert.equal(report.compilerObjects.programs.length, report.compilerObjects.limits.programs)
    assert.equal(report.compilerObjects.limits.programs, 128)
  })

test("owner diagnostic observation includes real semantic Worker input attempts and exact cached references",
  { timeout: 30_000 }, async t => {
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Query.ets": "export class TargetThing {}\n",
        "Use.ets": 'import { TargetThing } from "./Query"\nexport const value = new TargetThing()\n' },
      target: { kind: "references", file: "Query.ets", symbol: "TargetThing",
        includeDeclaration: false, position: { line: 0, character: 14 } },
      oracle: { schemaVersion: 1, locations: [
        { file: "Use.ets", range: { start: { line: 0, character: 9 }, end: { line: 0, character: 20 } } },
        { file: "Use.ets", range: { start: { line: 1, character: 25 }, end: { line: 1, character: 36 } } },
      ] },
    })
    const editedOracle = path.join(fixture.directory, "default-edited-input-oracle.json")
    const changes = [{ range: { start: { line: 2, character: 0 }, end: { line: 2, character: 0 } },
      newText: "export const more = new TargetThing()\n" }]
    fs.writeFileSync(editedOracle, JSON.stringify({ schemaVersion: 1, locations: [
      ...JSON.parse(fs.readFileSync(fixture.suite.targets[0].oracle.path, "utf8")).locations,
      { file: "Use.ets", range: { start: { line: 2, character: 24 }, end: { line: 2, character: 35 } } },
    ] }))
    fixture.suite.scenarios.push({ id: "edited", targetId: "thing", bucket: "edit-reference",
      edit: { file: "Use.ets", changes, sha256: digestJson(changes),
        oracle: { path: editedOracle, sha256: sha256File(editedOracle), verified: true } } })
    saveSuite(fixture)
    assert.deepEqual(fixture.suite.runtime.env, {})
    const result = spawnSync(process.execPath, [runner, "--layer", "owner", "--manifest", fixture.input,
      "--out", fixture.output, "--observe-inputs"], { encoding: "utf8", timeout: 25_000 })
    assert.ok(fs.existsSync(fixture.output), `${result.status}: ${result.stderr}\n${result.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}\n${JSON.stringify({ requests: report.requests,
      observations: report.inputOperations?.workerCompilerObjects?.map(record => ({ entryFile: record.entryFile,
        boundary: record.boundary, failure: record.compilerObjects.failure, registries: record.compilerObjects.registries })) })}`)
    assert.ok(report.requests.every(request => request.correctness.equal))
    assert.equal(report.requests.length, 3)
    assert.equal(report.requests[0].answerCacheHit, false)
    assert.equal(report.requests[1].answerCacheHit, true)
    assert.equal(report.requests[2].answerCacheHit, false)
    assert.equal(report.preparation.targetQueries, 0)
    assert.equal(report.inputIdentityUnchanged, true)
    assert.equal(report.releaseEligible, false)
    const observation = report.inputOperations
    assert.equal(observation.boundary, "OWNER_DRIVER_AND_WORKER_SYNC_INPUT_APIS")
    assert.equal(observation.normalTimingEvidence, false)
    const snapshots = observation.workerSnapshots.filter(snapshot => snapshot.entryFile === "semantic-worker.cjs")
    assert.ok(snapshots.length > 0, "main-thread counters cannot stand in for Worker observations")
    assert.ok(snapshots.every(snapshot => snapshot.threadId > 0 && snapshot.pid === report.pid))
    assert.ok(snapshots.some(snapshot => snapshot.counts.lstatSync > 0 && snapshot.counts.hashUpdate > 0))
    assert.ok(snapshots.some(snapshot => snapshot.request?.method === "references"))
    assert.deepEqual(observation.workerLifecycleEvents.filter(event => event.entryFile === "reference-verifier-worker.cjs"), [])
  })
