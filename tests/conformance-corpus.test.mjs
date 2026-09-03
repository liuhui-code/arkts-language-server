import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import { materializeConformanceWorkspace } from "./support/materialize-conformance-workspace.mjs"

const fixtureRoot = fileURLToPath(new URL("../fixtures/conformance/v1/", import.meta.url))

test("materializes marker-free files with UTF-16 point and range coordinates", async (t) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-lsp-corpus-test-"))
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }))

  const materialized = await materializeConformanceWorkspace({ temporaryRoot })
  const relativeHomePath = path.join("entry", "src", "main", "ets", "pages", "Home.ets")
  const homePath = path.join(materialized.workspaceRoot, relativeHomePath)
  const source = await fs.readFile(homePath, "utf8")
  const sourceLine = source.split("\n").find((line) => line.includes("Gree"))
  const prefixEnd = sourceLine.indexOf("Gree") + "Gree".length
  const unicodeCase = materialized.cases["completion.unicode"]

  assert.notEqual(materialized.workspaceRoot, path.join(fixtureRoot, "workspace"))
  assert.equal(path.dirname(materialized.root), temporaryRoot)
  assert.doesNotMatch(source, /\/\*@case\./)
  assert.equal(unicodeCase.uri, pathToFileURL(homePath).href)
  assert.deepEqual(unicodeCase.position, { line: 4, character: prefixEnd })
  assert.deepEqual(unicodeCase.range, {
    start: { line: 4, character: sourceLine.indexOf("Gree") },
    end: { line: 4, character: prefixEnd },
  })
  assert.equal(sourceLine.slice(unicodeCase.range.start.character, unicodeCase.range.end.character), "Gree")
  assert.equal(sourceLine.slice(0, unicodeCase.position.character), sourceLine.slice(0, prefixEnd))
  assert.equal(
    unicodeCase.position.character - Array.from(sourceLine.slice(0, prefixEnd)).length,
    1,
    "the emoji before the marker must occupy two UTF-16 code units",
  )
})

test("materializes a deterministic Harmony workspace with unopened semantic files", async (t) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-lsp-harmony-corpus-test-"))
  const previousHome = process.env.HOME
  const previousDevEcoSdkHome = process.env.DEVECO_SDK_HOME
  process.env.HOME = path.join(temporaryRoot, "missing-home")
  process.env.DEVECO_SDK_HOME = path.join(temporaryRoot, "missing-deveco-sdk")
  t.after(async () => {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousDevEcoSdkHome === undefined) delete process.env.DEVECO_SDK_HOME
    else process.env.DEVECO_SDK_HOME = previousDevEcoSdkHome
    await fs.rm(temporaryRoot, { recursive: true, force: true })
  })

  const materialized = await materializeConformanceWorkspace({ temporaryRoot })
  const manifestPaths = [
    "build-profile.json5",
    "oh-package.json5",
    path.join("entry", "build-profile.json5"),
    path.join("entry", "oh-package.json5"),
    path.join("entry", "src", "main", "module.json5"),
  ]
  const semanticFiles = new Map([
    [path.join("entry", "src", "main", "ets", "pages", "Home.ets"), ["completion.unicode", "Gree"]],
    [path.join("entry", "src", "main", "ets", "pages", "OtherConsumer.ets"), ["profile.reference", "Profile"]],
    [path.join("entry", "src", "main", "ets", "model", "Profile.ets"), ["profile.definition", "Profile"]],
    [path.join("entry", "src", "main", "ets", "model", "index.ets"), ["profile.barrel", "Profile"]],
    [path.join("entry", "src", "main", "ets", "services", "Greeter.ets"), ["greeter.definition", "Greeter"]],
  ])

  for (const relativePath of manifestPaths) {
    const fixture = await fs.readFile(path.join(fixtureRoot, "workspace", relativePath), "utf8")
    const copy = await fs.readFile(path.join(materialized.workspaceRoot, relativePath), "utf8")
    assert.equal(copy, fixture, `${relativePath} must be copied byte-for-byte`)
  }

  for (const [relativePath, [caseId, expectedText]] of semanticFiles) {
    const materializedPath = path.join(materialized.workspaceRoot, relativePath)
    const source = await fs.readFile(materializedPath, "utf8")
    const markerCase = materialized.cases[caseId]

    assert.doesNotMatch(source, /\/\*@case\./, `${relativePath} must be marker-free`)
    assert.equal(markerCase.uri, pathToFileURL(materializedPath).href)
    assert.equal(textInRange(source, markerCase.range), expectedText)
  }

  const otherConsumerPath = path.join(
    materialized.workspaceRoot,
    "entry",
    "src",
    "main",
    "ets",
    "pages",
    "OtherConsumer.ets",
  )
  const otherConsumer = await fs.readFile(otherConsumerPath, "utf8")
  const shadowCase = materialized.cases["profile.shadow"]
  assert.equal(shadowCase.uri, pathToFileURL(otherConsumerPath).href)
  assert.equal(textInRange(otherConsumer, shadowCase.range), "Profile")
})

test("materializes isolated ArkUI and OpenHarmony SDK fixtures without host discovery", async (t) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-lsp-arkui-corpus-test-"))
  const previousHome = process.env.HOME
  const previousDevEcoSdkHome = process.env.DEVECO_SDK_HOME
  process.env.HOME = path.join(temporaryRoot, "missing-home")
  process.env.DEVECO_SDK_HOME = path.join(temporaryRoot, "missing-deveco-sdk")
  t.after(async () => {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousDevEcoSdkHome === undefined) delete process.env.DEVECO_SDK_HOME
    else process.env.DEVECO_SDK_HOME = previousDevEcoSdkHome
    await fs.rm(temporaryRoot, { recursive: true, force: true })
  })

  const materialized = await materializeConformanceWorkspace({ temporaryRoot })
  const arkuiPath = path.join(
    materialized.workspaceRoot,
    "entry",
    "src",
    "main",
    "ets",
    "pages",
    "ArkuiPage.ets",
  )
  const arkuiSource = await fs.readFile(arkuiPath, "utf8")
  const arkuiCases = new Map([
    ["arkui.decorator.entry", "Entry"],
    ["arkui.decorator.component", "Component"],
    ["arkui.decorator.state", "State"],
    ["arkui.component.column", "Column"],
    ["arkui.component.text", "Text"],
    ["arkui.attribute.width", "width"],
  ])

  assert.doesNotMatch(arkuiSource, /\/\*@case\./)
  for (const [caseId, expectedText] of arkuiCases) {
    const markerCase = materialized.cases[caseId]
    assert.equal(markerCase.uri, pathToFileURL(arkuiPath).href)
    assert.equal(textInRange(arkuiSource, markerCase.range), expectedText)
  }

  const sdkRoot = path.join(materialized.corpusRoot, "sdk", "openharmony")
  const sdkFiles = [
    "sdk-pkg.json",
    path.join("ets", "component", "arkui.d.ts"),
    path.join("toolchains", "arkts-lsp-fixture.json"),
  ]
  for (const relativePath of sdkFiles) {
    const fixture = await fs.readFile(path.join(fixtureRoot, "sdk", "openharmony", relativePath))
    const copy = await fs.readFile(path.join(sdkRoot, relativePath))
    assert.deepEqual(copy, fixture, `${relativePath} must have deterministic bytes`)
  }
})

function textInRange(source, range) {
  const lines = source.split("\n")
  assert.equal(range.start.line, range.end.line, "this corpus slice uses single-line ranges")
  return lines[range.start.line].slice(range.start.character, range.end.character)
}
