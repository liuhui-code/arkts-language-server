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

test("materializes a stable UTF-16 spelling quick-fix target inside an ArkTS struct", async (t) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-lsp-quickfix-corpus-test-"))
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }))
  const schema = JSON.parse(await fs.readFile(path.join(fixtureRoot, "corpus.json"), "utf8"))
  const declaration = schema.cases.find(({ id }) => id === "quickfix.greeting")
  assert.deepEqual(declaration, {
    id: "quickfix.greeting",
    kind: "diagnostic",
    role: "spelling-quickfix",
    file: "workspace/entry/src/main/ets/pages/QuickFixConsumer.ets",
    shape: "range",
  })

  const first = await materializeConformanceWorkspace({ temporaryRoot })
  const second = await materializeConformanceWorkspace({ temporaryRoot })
  const relativePath = path.join("entry", "src", "main", "ets", "pages", "QuickFixConsumer.ets")
  const firstPath = path.join(first.workspaceRoot, relativePath)
  const secondPath = path.join(second.workspaceRoot, relativePath)
  const fixturePath = path.join(fixtureRoot, "workspace", relativePath)
  const fixtureSource = await fs.readFile(fixturePath, "utf8")
  const firstSource = await fs.readFile(firstPath, "utf8")
  const secondSource = await fs.readFile(secondPath, "utf8")
  const quickFixCase = first.cases["quickfix.greeting"]

  assert.equal(
    fixtureSource.match(/\/\*@case\.quickfix\.greeting\.(?:start|end)\*\//g)?.length,
    2,
    "the fixture must contain exactly one start/end marker pair",
  )
  assert.equal(firstSource, secondSource, "repeated materialization must produce identical source")
  assert.deepEqual(quickFixCase.range, second.cases["quickfix.greeting"].range)
  assert.equal(quickFixCase.uri, pathToFileURL(firstPath).href)
  assert.doesNotMatch(firstSource, /\/\*@case\./)
  assert.match(firstSource, /\bstruct QuickFixConsumer\b/)
  assert.equal(textInRange(firstSource, quickFixCase.range), "greting")
  assert.equal(offsetAt(firstSource, quickFixCase.range.start), firstSource.indexOf("greting"))

  const sourceLine = firstSource.split("\n")[quickFixCase.range.start.line]
  const prefix = sourceLine.slice(0, quickFixCase.range.start.character)
  assert.match(prefix, /😀/)
  assert.equal(
    prefix.length - Array.from(prefix).length,
    1,
    "the emoji before greting must occupy two UTF-16 code units",
  )

  const methodStart = firstSource.indexOf("build()")
  const methodEnd = firstSource.indexOf("\n  }", methodStart)
  const greetingOffset = firstSource.indexOf("greeting", methodStart)
  const typoOffset = firstSource.indexOf("greting", methodStart)
  assert.ok(methodStart >= 0 && methodEnd > methodStart)
  assert.ok(greetingOffset > methodStart && greetingOffset < methodEnd)
  assert.ok(typoOffset > greetingOffset && typoOffset < methodEnd)
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
    path.join("shared", "build-profile.json5"),
    path.join("shared", "oh-package.json5"),
    path.join("shared", "src", "main", "module.json5"),
  ]
  const semanticFiles = new Map([
    [path.join("entry", "src", "main", "ets", "pages", "Home.ets"), ["completion.unicode", "Gree"]],
    [path.join("entry", "src", "main", "ets", "pages", "OtherConsumer.ets"), ["profile.reference", "Profile"]],
    [path.join("entry", "src", "main", "ets", "model", "Profile.ets"), ["profile.definition", "Profile"]],
    [path.join("entry", "src", "main", "ets", "model", "index.ets"), ["profile.barrel", "Profile"]],
    [path.join("entry", "src", "main", "ets", "services", "Greeter.ets"), ["greeter.definition", "Greeter"]],
    [path.join("entry", "src", "main", "ets", "pages", "CrossModuleConsumer.ets"), ["cross-module.reference", "SharedProfile"]],
    [path.join("shared", "src", "main", "ets", "model", "SharedProfile.ets"), ["cross-module.definition", "SharedProfile"]],
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

test("returns cases in the declared corpus schema order with stable metadata", async (t) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-lsp-schema-test-"))
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }))

  const schema = JSON.parse(await fs.readFile(path.join(fixtureRoot, "corpus.json"), "utf8"))
  const materialized = await materializeConformanceWorkspace({ temporaryRoot })

  assert.equal(schema.version, 1)
  assert.deepEqual(Object.keys(materialized.cases), schema.cases.map(({ id }) => id))
  for (const declaration of schema.cases) {
    const markerCase = materialized.cases[declaration.id]
    assert.equal(markerCase.kind, declaration.kind)
    assert.equal(markerCase.role, declaration.role)
    assert.equal(markerCase.shape, declaration.shape)
    assert.equal(
      markerCase.uri,
      pathToFileURL(path.join(materialized.corpusRoot, ...declaration.file.split("/"))).href,
    )
  }
})

test("rejects a duplicate marker endpoint", async (t) => {
  const injected = await copyFixtureForMutation(t, "duplicate-marker")
  const homePath = path.join(
    injected.fixtureRoot,
    "workspace",
    "entry",
    "src",
    "main",
    "ets",
    "pages",
    "Home.ets",
  )
  const source = await fs.readFile(homePath, "utf8")
  await fs.writeFile(
    homePath,
    source.replace(
      "/*@case.completion.unicode*/",
      "/*@case.completion.unicode*//*@case.completion.unicode*/",
    ),
    "utf8",
  )

  await assert.rejects(
    materializeConformanceWorkspace(injected),
    /duplicate marker endpoint "position" for case "completion\.unicode"/i,
  )
})

test("rejects a marker that is not declared in corpus.json", async (t) => {
  const injected = await copyFixtureForMutation(t, "undeclared-marker")
  const homePath = path.join(
    injected.fixtureRoot,
    "workspace",
    "entry",
    "src",
    "main",
    "ets",
    "pages",
    "Home.ets",
  )
  await fs.appendFile(homePath, "\n/*@case.not.declared*/\n", "utf8")

  await assert.rejects(
    materializeConformanceWorkspace(injected),
    /marker case "not\.declared" is not declared in corpus\.json/i,
  )
})

test("rejects a declared case whose markers are missing", async (t) => {
  const injected = await copyFixtureForMutation(t, "missing-marker")
  const barrelPath = path.join(
    injected.fixtureRoot,
    "workspace",
    "entry",
    "src",
    "main",
    "ets",
    "model",
    "index.ets",
  )
  const source = await fs.readFile(barrelPath, "utf8")
  await fs.writeFile(
    barrelPath,
    source.replace(/\/\*@case\.profile\.barrel\.(?:start|end)\*\//g, ""),
    "utf8",
  )

  await assert.rejects(
    materializeConformanceWorkspace(injected),
    /declared case "profile\.barrel" has no markers/i,
  )
})

test("rejects point and range markers that do not match the declared shape", async (t) => {
  const injected = await copyFixtureForMutation(t, "marker-shape")
  const schemaPath = path.join(injected.fixtureRoot, "corpus.json")
  const schema = JSON.parse(await fs.readFile(schemaPath, "utf8"))
  schema.cases.find(({ id }) => id === "completion.unicode").shape = "range"
  await fs.writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8")

  await assert.rejects(
    materializeConformanceWorkspace(injected),
    /case "completion\.unicode" declares marker shape "range" but found "point\+range"/i,
  )
})

test("rejects one case whose marker endpoints span different files", async (t) => {
  const injected = await copyFixtureForMutation(t, "cross-file-marker")
  const homePath = path.join(
    injected.fixtureRoot,
    "workspace",
    "entry",
    "src",
    "main",
    "ets",
    "pages",
    "Home.ets",
  )
  const consumerPath = path.join(
    injected.fixtureRoot,
    "workspace",
    "entry",
    "src",
    "main",
    "ets",
    "pages",
    "OtherConsumer.ets",
  )
  const home = await fs.readFile(homePath, "utf8")
  await fs.writeFile(homePath, home.replace("/*@case.completion.unicode*/", ""), "utf8")
  await fs.appendFile(consumerPath, "\n/*@case.completion.unicode*/\n", "utf8")

  await assert.rejects(
    materializeConformanceWorkspace(injected),
    /case "completion\.unicode" marker file conflicts with corpus\.json/i,
  )
})

function textInRange(source, range) {
  const lines = source.split("\n")
  assert.equal(range.start.line, range.end.line, "this corpus slice uses single-line ranges")
  return lines[range.start.line].slice(range.start.character, range.end.character)
}

function offsetAt(source, position) {
  const lines = source.split("\n")
  return lines.slice(0, position.line).reduce((offset, line) => offset + line.length + 1, 0)
    + position.character
}

async function copyFixtureForMutation(t, name) {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), `arkts-lsp-${name}-test-`))
  const mutableFixtureRoot = path.join(temporaryRoot, "fixture")
  await fs.cp(fixtureRoot, mutableFixtureRoot, { recursive: true })
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }))
  return { fixtureRoot: mutableFixtureRoot, temporaryRoot }
}
