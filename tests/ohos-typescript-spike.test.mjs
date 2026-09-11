import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { buildSync } from "esbuild"

import {
  SPIKE_CATEGORIES,
  summarizeSpikeResults,
} from "../scripts/semantic/ohos-typescript-spike/spike-report.mjs"
import { createSpikeProject } from "../scripts/semantic/ohos-typescript-spike/backend-host.mjs"
import {
  BOUNDARY_POLICY_SCENARIO_IDS,
  CORE_SEMANTIC_SCENARIO_IDS,
  DIRECT_SCENARIO_IDS,
  REFERENCE_RENAME_SCENARIO_IDS,
} from "../scripts/semantic/ohos-typescript-spike/direct-scenarios.mjs"
import { evaluateLifecycleEvidence } from "../scripts/semantic/ohos-typescript-spike/lifecycle-report.mjs"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("spike contexts share immutable snapshots by file version and rematerialize an edit once", () => {
  let materializations = 0
  const compiler = fakeCompiler(() => { materializations += 1 })
  const snapshotPool = new Map()
  const runtime = { registry: {}, snapshotPool }
  const inputs = { "workspace/Main.ets": "class Main { value = 1 }\n" }

  const first = createSpikeProject(compiler, projectRoot, inputs, runtime)
  first.completions("workspace/Main.ets", 0)
  first.completions("workspace/Main.ets", 0)
  assert.equal(materializations, 1)
  assert.equal(first.stats().snapshotMaterializationCount, 1)

  first.update("workspace/Main.ets", "class Main { value = 2 }\n")
  first.completions("workspace/Main.ets", 0)
  assert.equal(materializations, 2)
  assert.equal(first.stats().snapshotMaterializationCount, 2)

  const rebuilt = createSpikeProject(compiler, projectRoot, inputs, runtime)
  rebuilt.completions("workspace/Main.ets", 0)
  assert.equal(materializations, 2)
  assert.equal(rebuilt.stats().snapshotMaterializationCount, 0)
  first.dispose()
  rebuilt.dispose()
})

test("official registry pooling shares one SDK identity and isolates a different SDK", (t) => {
  const { officialDocumentRegistryFor } = buildOfficialBackendSupportDriver(t)
  const identity = {
    status: "identified",
    metadataPath: "/sdk/a/ets/oh-uni-package.json",
    apiVersion: "24",
    componentVersion: "6.0.0",
    dialectCompatibility: "unverified",
    declarationSupport: "typescript-compatible-only",
  }
  const first = officialDocumentRegistryFor({ ready: true, path: "/sdk/a", identity, source: "project" })
  const same = officialDocumentRegistryFor({ ready: true, path: "/sdk/a", identity, source: "configuration" })
  const different = officialDocumentRegistryFor({
    ready: true,
    path: "/sdk/b",
    identity: { ...identity, metadataPath: "/sdk/b/ets/oh-uni-package.json" },
    source: "project",
  })
  assert.equal(first, same)
  assert.notEqual(first, different)
})

test("official ETS options come from the selected SDK loader configuration", (t) => {
  const { officialEtsCompilerOptions } = buildOfficialBackendSupportDriver(t)
  const sdkRoot = path.join(
    projectRoot,
    "fixtures",
    "semantic",
    "arkui-sdk-depth",
    "sdk",
    "openharmony",
  )
  const options = officialEtsCompilerOptions(sdkRoot)
  assert.deepEqual(options.ets?.components, ["Column", "Text"])
  assert.equal(options.etsLoaderPath, path.join(sdkRoot, "ets", "build-tools", "ets-loader"))
})

test("declaration-facade spike emits an in-memory .d.ets for an exported ArkTS class", (t) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-facade-spike-"))
  t.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }))
  const sourcePath = path.join(fixtureDirectory, "Box.ets")
  fs.writeFileSync(sourcePath, [
    "export class Box {",
    "  value: string = \"\"",
    "  getValue(): string { return this.value }",
    "}",
    "",
  ].join("\n"))

  const result = spawnSync(
    process.execPath,
    [path.join(projectRoot, "scripts", "semantic", "ets-declaration-facade-spike.mjs"), "--source", sourcePath],
    { cwd: projectRoot, encoding: "utf8" },
  )

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "PASS")
  assert.equal(report.compilerVersion, "4.9.5")
  assert.equal(report.outputExtension, ".d.ets")
  assert.match(report.declarationText, /export declare class Box/u)
  assert.match(report.declarationText, /getValue\(\): string/u)
  assert.equal(report.errorDiagnostics, 0)
})

test("declaration-facade spike preserves a generic cross-file type dependency", (t) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-facade-generic-"))
  t.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }))
  fs.writeFileSync(path.join(fixtureDirectory, "Model.ets"), [
    "export interface Box<T> {",
    "  value: T",
    "}",
    "",
  ].join("\n"))
  const sourcePath = path.join(fixtureDirectory, "Service.ets")
  fs.writeFileSync(sourcePath, [
    "import { Box } from \"./Model\"",
    "export function unwrap<T>(box: Box<T>): T { return box.value }",
    "",
  ].join("\n"))

  const result = spawnSync(
    process.execPath,
    [path.join(projectRoot, "scripts", "semantic", "ets-declaration-facade-spike.mjs"), "--source", sourcePath],
    { cwd: projectRoot, encoding: "utf8" },
  )

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "PASS")
  assert.deepEqual(report.declarations.map(({ fileName }) => fileName), [
    "Model.d.ets",
    "Service.d.ets",
  ])
  assert.match(
    report.declarations.find(({ fileName }) => fileName === "Service.d.ets").text,
    /export declare function unwrap<T>\(box: Box<T>\): T/u,
  )
  assert.match(
    report.declarations.find(({ fileName }) => fileName === "Model.d.ets").text,
    /export interface Box<T>/u,
  )
})

test("declaration-facade spike preserves SDK-configured ArkTS component decorators", (t) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-facade-component-"))
  t.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }))
  const sdkRoot = path.join(fixtureDirectory, "sdk")
  const loaderRoot = path.join(sdkRoot, "ets", "build-tools", "ets-loader")
  const componentRoot = path.join(sdkRoot, "ets", "component")
  const apiRoot = path.join(sdkRoot, "ets", "api")
  fs.mkdirSync(loaderRoot, { recursive: true })
  fs.mkdirSync(componentRoot, { recursive: true })
  fs.mkdirSync(apiRoot, { recursive: true })
  fs.writeFileSync(path.join(loaderRoot, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      ets: {
        render: { method: ["build"], decorator: ["Builder", "LocalBuilder"] },
        components: ["Text"],
        libs: [],
        extend: { decorator: [], components: [] },
        styles: {
          decorator: "Styles",
          component: { name: "", type: "", instance: "" },
          property: "",
        },
        concurrent: { decorator: "Concurrent" },
        propertyDecorators: [],
        emitDecorators: [
          { name: "Component", emitParameters: false },
          { name: "State", emitParameters: false },
        ],
      },
    },
  }))
  fs.writeFileSync(path.join(componentRoot, "index-full.d.ts"), [
    "declare const Component: (target: object) => void",
    "declare const State: (target: object, propertyKey: string) => void",
    "interface TextInterface { (value: string): void }",
    "declare const Text: TextInterface",
    "",
  ].join("\n"))
  fs.writeFileSync(path.join(apiRoot, "@future.annotation.d.ets"), [
    "export @interface FutureAnnotation {",
    "}",
    "",
  ].join("\n"))
  const sourcePath = path.join(fixtureDirectory, "Card.ets")
  fs.writeFileSync(sourcePath, [
    "@Component",
    "export struct Card {",
    "  @State title: string = \"Ready\"",
    "  build(): void { Text(this.title) }",
    "}",
    "",
  ].join("\n"))

  const result = spawnSync(
    process.execPath,
    [
      path.join(projectRoot, "scripts", "semantic", "ets-declaration-facade-spike.mjs"),
      "--source", sourcePath,
      "--sdk", sdkRoot,
    ],
    { cwd: projectRoot, encoding: "utf8" },
  )

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "PASS")
  assert.equal(report.sdkDeclarationFiles, 1)
  assert.ok(report.programSourceFiles >= 3)
  assert.match(report.declarationText, /@Component\s+export declare struct Card/u)
  assert.match(report.declarationText, /@State\s+title: string/u)
})

test("declaration-facade spike emits a declaration map back to the original .ets source", (t) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-facade-map-"))
  t.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }))
  const sourcePath = path.join(fixtureDirectory, "MappedBox.ets")
  fs.writeFileSync(sourcePath, [
    "export class MappedBox {",
    "  value: string = \"\"",
    "}",
    "",
  ].join("\n"))

  const result = spawnSync(
    process.execPath,
    [path.join(projectRoot, "scripts", "semantic", "ets-declaration-facade-spike.mjs"), "--source", sourcePath],
    { cwd: projectRoot, encoding: "utf8" },
  )

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.deepEqual(report.sourceMaps.map(({ fileName }) => fileName), ["MappedBox.d.ets.map"])
  assert.deepEqual(report.sourceMaps[0].sources, ["MappedBox.ets"])
  assert.ok(report.sourceMaps[0].mappings.length > 0)
  const generatedColumn = report.declarationText.indexOf("MappedBox")
  const original = originalPositionForGenerated(report.sourceMaps[0].mappings, 0, generatedColumn)
  assert.deepEqual(original, { line: 0, character: "export class ".length })
})

test("declaration-facade spike reports a bounded relative diagnostic location", (t) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-facade-diagnostic-"))
  t.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }))
  const sourcePath = path.join(fixtureDirectory, "Broken.ets")
  fs.writeFileSync(sourcePath, "export class Broken {\n")

  const result = spawnSync(
    process.execPath,
    [path.join(projectRoot, "scripts", "semantic", "ets-declaration-facade-spike.mjs"), "--source", sourcePath],
    { cwd: projectRoot, encoding: "utf8" },
  )

  assert.equal(result.status, 42, `${result.stderr}\n${result.stdout}`)
  assert.equal(result.stdout.includes(fixtureDirectory), false)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "FAIL")
  assert.equal(report.diagnostics[0].fileName, "Broken.ets")
  assert.equal(report.diagnostics[0].line, 2)
  assert.equal(typeof report.diagnostics[0].character, "number")
})

test("declaration-facade spike resolves an SDK module used by a public type", (t) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-facade-sdk-module-"))
  t.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }))
  const sdkRoot = path.join(fixtureDirectory, "sdk")
  const loaderRoot = path.join(sdkRoot, "ets", "build-tools", "ets-loader")
  const componentRoot = path.join(sdkRoot, "ets", "component")
  const apiRoot = path.join(sdkRoot, "ets", "api")
  fs.mkdirSync(loaderRoot, { recursive: true })
  fs.mkdirSync(componentRoot, { recursive: true })
  fs.mkdirSync(apiRoot, { recursive: true })
  fs.writeFileSync(path.join(loaderRoot, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      ets: {
        render: { method: ["build"], decorator: [] },
        components: [],
        libs: [],
        extend: { decorator: [], components: [] },
        styles: {
          decorator: "Styles",
          component: { name: "", type: "", instance: "" },
          property: "",
        },
        concurrent: { decorator: "Concurrent" },
        propertyDecorators: [],
        emitDecorators: [],
      },
    },
  }))
  fs.writeFileSync(path.join(componentRoot, "index-full.d.ts"), "")
  fs.writeFileSync(path.join(apiRoot, "@ohos.multimedia.image.d.ets"), [
    "declare namespace image {",
    "  export interface PixelMap { readonly width: number }",
    "}",
    "export default image",
    "",
  ].join("\n"))
  const sourcePath = path.join(fixtureDirectory, "Thumbnail.ets")
  fs.writeFileSync(sourcePath, [
    "import image from \"@ohos.multimedia.image\"",
    "export interface Thumbnail { pixel: image.PixelMap }",
    "",
  ].join("\n"))

  const result = spawnSync(
    process.execPath,
    [
      path.join(projectRoot, "scripts", "semantic", "ets-declaration-facade-spike.mjs"),
      "--source", sourcePath,
      "--sdk", sdkRoot,
    ],
    { cwd: projectRoot, encoding: "utf8" },
  )

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "PASS")
  assert.match(report.declarationText, /pixel: image\.PixelMap/u)
})

test("declaration façade consumer maps exact definition and references back to source", (t) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-facade-consumer-"))
  t.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }))
  const declarationPath = path.join(fixtureDirectory, "Box.ets")
  const consumerPath = path.join(fixtureDirectory, "UseBox.ets")
  fs.writeFileSync(declarationPath, [
    "export class Box {",
    "  value: string = \"\"",
    "}",
    "",
  ].join("\n"))
  fs.writeFileSync(consumerPath, [
    "import { Box } from \"./Box\"",
    "export const value = new /*@query*/Box()",
    "",
  ].join("\n"))

  const result = spawnSync(
    process.execPath,
    [
      path.join(projectRoot, "scripts", "semantic", "ets-declaration-facade-consumer-spike.mjs"),
      "--declaration", declarationPath,
      "--consumer", consumerPath,
    ],
    { cwd: projectRoot, encoding: "utf8" },
  )

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  assert.equal(result.stdout.includes(fixtureDirectory), false)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "PASS")
  assert.equal(report.definitionExact, true)
  assert.equal(report.referencesExact, true)
  assert.deepEqual(report.facade.definition, report.source.definition)
  assert.deepEqual(report.facade.references, report.source.references)
  assert.equal(report.facade.definition[0].fileName, "Box.ets")
  assert.equal(report.facade.loadedSourceDeclaration, false)
})

test("declaration façade consumer follows a generic façade dependency without loading its source", () => {
  const fixtureDirectory = path.join(projectRoot, "fixtures", "semantic", "declaration-facade-chain")
  const declarationPath = path.join(fixtureDirectory, "Box.ets")
  const consumerPath = path.join(fixtureDirectory, "UseBox.ets")

  const result = spawnSync(
    process.execPath,
    [
      path.join(projectRoot, "scripts", "semantic", "ets-declaration-facade-consumer-spike.mjs"),
      "--declaration", declarationPath,
      "--consumer", consumerPath,
    ],
    { cwd: projectRoot, encoding: "utf8" },
  )

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "PASS")
  assert.equal(report.definitionExact, true)
  assert.equal(report.referencesExact, true)
  assert.equal(report.facade.definition[0].fileName, "Model.ets")
  assert.equal(report.facade.loadedSourceDeclarations, 0)
  assert.ok(report.facade.programTextBytes < report.source.programTextBytes)
  assert.ok(report.facade.programAstNodes < report.source.programAstNodes)
})

test("declaration façade consumer accepts an explicit UTF-16 position for an unmodified source", () => {
  const fixtureDirectory = path.join(projectRoot, "fixtures", "semantic", "declaration-facade-chain")
  const declarationPath = path.join(fixtureDirectory, "Box.ets")
  const consumerPath = path.join(fixtureDirectory, "UseBoxPosition.ets")
  const result = spawnSync(
    process.execPath,
    [
      path.join(projectRoot, "scripts", "semantic", "ets-declaration-facade-consumer-spike.mjs"),
      "--declaration", declarationPath,
      "--consumer", consumerPath,
      "--line", "1",
      "--character", "25",
    ],
    { cwd: projectRoot, encoding: "utf8" },
  )

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "PASS")
  assert.equal(report.definitionExact, true)
  assert.equal(report.referencesExact, true)
  assert.equal(report.facade.definition[0].fileName, "Box.ets")
})

test("declaration façade source and hybrid queries run in independent processes with exact results", () => {
  const fixtureDirectory = path.join(projectRoot, "fixtures", "semantic", "declaration-facade-chain")
  const declarationPath = path.join(fixtureDirectory, "Box.ets")
  const consumerPath = path.join(fixtureDirectory, "UseBox.ets")
  const runner = path.join(
    projectRoot,
    "scripts",
    "semantic",
    "ets-declaration-facade-consumer-spike.mjs",
  )
  const sourceResult = spawnSync(
    process.execPath,
    [
      runner,
      "--mode", "source",
      "--declaration", declarationPath,
      "--consumer", consumerPath,
    ],
    { cwd: projectRoot, encoding: "utf8" },
  )

  assert.equal(sourceResult.status, 0, `${sourceResult.stderr}\n${sourceResult.stdout}`)
  const sourceReport = JSON.parse(sourceResult.stdout)
  assert.equal(sourceReport.status, "PASS")
  assert.equal(sourceReport.mode, "source")
  assert.ok(Number.isSafeInteger(sourceReport.pid))
  assert.deepEqual(sourceReport.owner, { relativeFileName: "Model.ets", start: 26 })

  const facadeResult = spawnSync(
    process.execPath,
    [
      runner,
      "--mode", "facade",
      "--declaration", declarationPath,
      "--consumer", consumerPath,
      "--owner", path.join(fixtureDirectory, sourceReport.owner.relativeFileName),
      "--owner-start", String(sourceReport.owner.start),
    ],
    { cwd: projectRoot, encoding: "utf8" },
  )

  assert.equal(facadeResult.status, 0, `${facadeResult.stderr}\n${facadeResult.stdout}`)
  const facadeReport = JSON.parse(facadeResult.stdout)
  assert.equal(facadeReport.status, "PASS")
  assert.equal(facadeReport.mode, "facade")
  assert.ok(Number.isSafeInteger(facadeReport.pid))
  assert.notEqual(facadeReport.pid, sourceReport.pid)
  assert.deepEqual(facadeReport.facade.definition, sourceReport.source.definition)
  assert.deepEqual(facadeReport.facade.references, sourceReport.source.references)
  assert.equal(facadeReport.facade.loadedSourceDeclarations, 0)
})

test("declaration façade A/B runner records external RSS curves for independent processes", (t) => {
  const fixtureDirectory = path.join(projectRoot, "fixtures", "semantic", "declaration-facade-chain")
  const reportDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-facade-memory-ab-"))
  t.after(() => fs.rmSync(reportDirectory, { recursive: true, force: true }))
  const reportPath = path.join(reportDirectory, "report.json")
  const result = spawnSync(
    process.execPath,
    [
      path.join(projectRoot, "scripts", "bench", "run-declaration-facade-memory-ab.mjs"),
      "--declaration", path.join(fixtureDirectory, "Box.ets"),
      "--consumer", path.join(fixtureDirectory, "UseBox.ets"),
      "--runs", "1",
      "--sample-interval-ms", "25",
      "--out", reportPath,
    ],
    { cwd: projectRoot, encoding: "utf8", timeout: 30_000 },
  )

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  assert.match(
    result.stdout,
    /^FACADE_MEMORY_AB=PASS\nFACADE_MEMORY_GATE=(?:PASS|FAIL)\nREPORT=.+\n$/u,
  )
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"))
  assert.equal(report.status, "PASS")
  assert.equal(report.measurementKind, "external-process-tree-rss")
  assert.equal(report.memoryGate.requiredPeakReductionRatio, 0.30)
  assert.match(report.memoryGate.status, /^(PASS|FAIL)$/u)
  assert.equal(report.runs.length, 1)
  assert.notEqual(report.runs[0].source.pid, report.runs[0].facade.pid)
  assert.ok(report.runs[0].source.samples.length > 0)
  assert.ok(report.runs[0].facade.samples.length > 0)
  assert.ok(report.runs[0].source.peakRssBytes > 0)
  assert.ok(report.runs[0].facade.peakRssBytes > 0)
  assert.equal(report.runs[0].definitionExact, true)
  assert.equal(report.runs[0].referencesExact, true)
  assert.ok(report.runs[0].facade.programAstNodes < report.runs[0].source.programAstNodes)
})

test("an incomplete official-backend run cannot be reported as a pass", () => {
  const results = [
    ...Array.from({ length: 5 }, (_, index) => ({
      id: "syntax.direct-" + index,
      category: "syntax",
      status: "passed",
    })),
    ...Array.from({ length: 29 }, (_, index) => ({
      id: "references.deferred-" + index,
      category: "references",
      status: "deferred",
      reason: "No direct official-backend scenario yet",
    })),
  ]

  const summary = summarizeSpikeResults(results, 30)
  assert.equal(summary.status, "INCOMPLETE")
  assert.deepEqual(summary.totals, { total: 34, passed: 5, failed: 0, deferred: 29 })
  assert.equal(summary.semanticContractFailures, 0)
  assert.equal(summary.categories.references.deferred, 29)
})

test("any mandatory semantic failure makes the official-backend run fail", () => {
  const results = SPIKE_CATEGORIES.map((category) => ({
    id: category + ".case",
    category,
    status: category === "rename" ? "failed" : "passed",
    reason: category === "rename" ? "wrong declaration identity" : undefined,
  }))

  const summary = summarizeSpikeResults(results, SPIKE_CATEGORIES.length)
  assert.equal(summary.status, "FAIL")
  assert.equal(summary.semanticContractFailures, 1)
  assert.equal(summary.categories.rename.failed, 1)
})

test("PASS requires the minimum case count and every required category without deferrals", () => {
  const results = Array.from({ length: 36 }, (_, index) => ({
    id: SPIKE_CATEGORIES[index % SPIKE_CATEGORIES.length] + ".case-" + index,
    category: SPIKE_CATEGORIES[index % SPIKE_CATEGORIES.length],
    status: "passed",
  }))

  const summary = summarizeSpikeResults(results, 30)
  assert.equal(summary.status, "PASS")
  assert.deepEqual(summary.totals, { total: 36, passed: 36, failed: 0, deferred: 0 })
  assert.equal(summary.semanticContractFailures, 0)
})

test("the committed spike report passes only after every contract executes", () => {
  const reportPath = path.join(projectRoot, "docs", "reports", "ohos-typescript-spike.json")
  const reportBytes = fs.readFileSync(reportPath)
  assert.ok(reportBytes.length <= 64 * 1024)
  assert.equal(reportBytes.includes(Buffer.from(projectRoot)), false)
  const report = JSON.parse(reportBytes.toString("utf8"))
  assert.equal(report.status, "PASS")
  assert.equal(report.summary.totals.total, 34)
  assert.equal(report.summary.totals.passed, 34)
  assert.equal(report.summary.totals.failed, 0)
  assert.equal(report.summary.totals.deferred, 0)
  assert.equal(report.backendRevision, "9cc62fe98f47c0bf113676e3fb33fe932b493052")
  assert.equal(
    report.sdkDeclarationDigest,
    "8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4",
  )
  const executed = report.results.filter(({ status }) => status === "passed")
  assert.ok(executed.every(({ stats }) => stats.disposed === true))
  assert.ok(executed.every(({ observations }) => observations.completionNames === undefined))
  for (const id of DIRECT_SCENARIO_IDS) {
    assert.equal(report.results.find((result) => result.id === id)?.status, "passed")
  }
})

test("the core semantic contracts have direct official-backend scenarios", () => {
  assert.deepEqual(
    [...CORE_SEMANTIC_SCENARIO_IDS].sort(),
    [
      "completion.auto-import",
      "completion.imported-receiver",
      "completion.this-member",
      "definition.alias-reexport",
      "definition.struct-source-map",
      "definition.unopened-utf16",
      "diagnostics.exact-code-range",
      "unicode.identifier-completion",
    ],
  )
})

test("references and rename contracts have direct official-backend scenarios", () => {
  assert.deepEqual(
    [...REFERENCE_RENAME_SCENARIO_IDS].sort(),
    [
      "references.barrel-unopened",
      "references.changed-overlay",
      "references.large-unopened-struct",
      "references.new-target-root",
      "rename.cross-module",
      "rename.explicit-barrel-alias",
      "rename.non-bmp-prepare",
      "rename.same-scope-conflict",
    ],
  )
})

test("freshness and project-boundary contracts have direct backend scenarios", () => {
  assert.deepEqual(
    [...BOUNDARY_POLICY_SCENARIO_IDS].sort(),
    [
      "completion.sdk-hot-switch",
      "definition.cross-module",
      "diagnostics.invalid-sdk",
      "diagnostics.overlay-freshness",
      "incomplete.completion-result-limit",
      "incomplete.references-membership",
      "project-boundary.catalog-identity",
      "project-boundary.declared-module",
      "project-boundary.ghost-module",
      "project-boundary.inactive-target",
      "project-boundary.overlay-authority",
      "project-boundary.target-membership",
      "project-boundary.watcher-freshness",
    ],
  )
})

test("lifecycle evidence fails without GC, reuse, trim, dispose, and 20 churn runs", () => {
  const result = evaluateLifecycleEvidence({
    exposedGc: false,
    stableReuse: { repeatedQueries: 10, additionalSnapshotMaterializations: 1 },
    commentEdit: {
      additionalSnapshotMaterializations: 2,
      maximumSnapshotMaterializations: 1,
    },
    lifecycle: { trimCalls: 0, disposeCalls: 19, sharedRegistry: false },
    churn: { runs: 19, rssGrowthBytes: 0, heapGrowthBytes: 0 },
    gates: { rssGrowthMaxBytes: 64 * 1024 * 1024, heapGrowthMaxBytes: 16 * 1024 * 1024 },
  })
  assert.equal(result.status, "FAIL")
  assert.ok(result.failures.length >= 5)
})

test("the committed lifecycle report closes the backend memory spike gate", () => {
  const reportPath = path.join(projectRoot, "docs", "reports", "ohos-typescript-lifecycle.json")
  const reportBytes = fs.readFileSync(reportPath)
  assert.ok(reportBytes.length <= 64 * 1024)
  assert.equal(reportBytes.includes(Buffer.from(projectRoot)), false)
  const report = JSON.parse(reportBytes.toString("utf8"))
  assert.equal(report.status, "PASS")
  assert.equal(report.backendRevision, "9cc62fe98f47c0bf113676e3fb33fe932b493052")
  assert.equal(report.exposedGc, true)
  assert.equal(report.churn.runs, 20)
  assert.equal(report.lifecycle.sharedRegistry, true)
  assert.ok(report.lifecycle.trimCalls >= 1)
  assert.equal(report.lifecycle.disposeCalls, 21)
  assert.equal(report.stableReuse.additionalSnapshotMaterializations, 0)
  assert.ok(
    report.commentEdit.additionalSnapshotMaterializations
      <= report.commentEdit.maximumSnapshotMaterializations,
  )
  assert.ok(report.churn.rssGrowthBytes <= report.gates.rssGrowthMaxBytes)
  assert.ok(report.churn.heapGrowthBytes <= report.gates.heapGrowthMaxBytes)
  assert.deepEqual(evaluateLifecycleEvidence(report), { status: "PASS", failures: [] })
})

test("production composition has one locked official semantic backend and no virtual rewrite", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"))
  assert.equal(packageJson.dependencies.typescript, "npm:ohos-typescript@4.9.5-r4")

  const contract = readProjectFile("src/semantic/backends/semantic-backend.ts")
  assert.doesNotMatch(contract, /typescript|sqlite|vscode-languageserver/iu)

  const production = readProjectFile("src/composition/production-services.ts")
  assert.doesNotMatch(production, /LegacySemanticEngine/u)
  assert.match(production, /createProductionSemanticEngine/u)

  const runtime = readProjectFile("src/lsp/run-language-server.ts")
  assert.doesNotMatch(runtime, /LegacySemanticEngine/u)

  const factory = readProjectFile("src/semantic/backends/production-semantic-engine.ts")
  assert.equal((factory.match(/new SemanticWorkerEngine/gu) ?? []).length, 1)
  assert.doesNotMatch(factory, /Es2Panda/u)

  const worker = readProjectFile("src/semantic/semantic-worker-runtime.ts")
  assert.equal((worker.match(/new OhosTypeScriptSemanticEngine/gu) ?? []).length, 1)
  assert.doesNotMatch(worker, /Es2Panda/u)

  const engine = readProjectFile("src/core/types/typescript-language-service.ts")
  assert.match(engine, /fileName\.endsWith\("\.ets"\)[\s\S]*ScriptKind\.ETS/u)
  assert.doesNotMatch(engine, /createDocumentRegistry/u)
  assert.doesNotMatch(engine, /arkts-virtual-document/u)
  assert.equal(
    fs.existsSync(path.join(projectRoot, "src/core/virtual/arkts-virtual-document.ts")),
    false,
  )
})

function fakeCompiler(onMaterialize) {
  return {
    ScriptTarget: { ES2021: 1 },
    ModuleKind: { ESNext: 1 },
    ModuleResolutionKind: { NodeJs: 1 },
    ScriptKind: { ETS: 8 },
    ScriptSnapshot: {
      fromString(text) {
        onMaterialize()
        return { text }
      },
    },
    sys: {
      useCaseSensitiveFileNames: true,
      fileExists: () => false,
      readFile: () => undefined,
      readDirectory: () => [],
      newLine: "\n",
    },
    getScriptKindFromFileName: () => 3,
    getDefaultLibFilePath: () => "lib.d.ts",
    createLanguageService(host) {
      return {
        getCompletionsAtPosition() {
          for (const fileName of host.getScriptFileNames()) host.getScriptSnapshot(fileName)
          return { entries: [{ name: "value" }] }
        },
        cleanupSemanticCache() {},
        dispose() {},
      }
    },
  }
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, ...relativePath.split("/")), "utf8")
}

function buildOfficialBackendSupportDriver(t) {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-official-backend-"))
  t.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }))
  const driverPath = path.join(outputDirectory, "support.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "tests", "support", "official-backend-driver.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: driverPath,
  })
  return createRequire(import.meta.url)(driverPath)
}

function originalPositionForGenerated(mappings, targetLine, targetColumn) {
  const state = { source: 0, originalLine: 0, originalColumn: 0 }
  const lines = mappings.split(";")
  for (let line = 0; line <= targetLine; line += 1) {
    let generatedColumn = 0
    let best = null
    for (const segment of lines[line].split(",").filter(Boolean)) {
      const fields = decodeSourceMapSegment(segment)
      generatedColumn += fields[0]
      if (fields.length >= 4) {
        state.source += fields[1]
        state.originalLine += fields[2]
        state.originalColumn += fields[3]
        if (line === targetLine && generatedColumn <= targetColumn) {
          best = {
            line: state.originalLine,
            character: state.originalColumn + targetColumn - generatedColumn,
          }
        }
      }
    }
    if (line === targetLine) return best
  }
  return null
}

function decodeSourceMapSegment(segment) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  const values = []
  let value = 0
  let shift = 0
  for (const character of segment) {
    const digit = alphabet.indexOf(character)
    assert.notEqual(digit, -1)
    value += (digit & 31) << shift
    if ((digit & 32) !== 0) {
      shift += 5
      continue
    }
    values.push((value >> 1) * ((value & 1) === 1 ? -1 : 1))
    value = 0
    shift = 0
  }
  return values
}
