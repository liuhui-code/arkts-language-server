import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"
import { materializeConformanceWorkspace } from "../support/materialize-conformance-workspace.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"
import { conformanceGlobalScripts } from "../support/conformance-global-scripts.mjs"

test("validates every ready auto-import candidate in bounded sequential root batches", { timeout: 60_000 }, async (t) => {
  const materialized = await materializeConformanceWorkspace()
  const sourceDirectory = path.join(
    materialized.workspaceRoot,
    "entry",
    "src",
    "main",
    "ets",
    "pages",
  )
  const exportedNames = [
    "ChatAlpha",
    "ChatChoice",
    "ChatGamma",
    "ChatChoice",
    "ChatEpsilon",
  ]
  await Promise.all(exportedNames.map((exportedName, index) => (
    fs.promises.writeFile(
      path.join(sourceDirectory, `BatchExport${index + 1}.ets`),
      index === 0
        ? [
            'import { ChatGamma } from "./BatchExport3"',
            `export class ${exportedName} { value?: ChatGamma }`,
            "",
          ].join("\n")
        : `export class ${exportedName} {}\n`,
      "utf8",
    )
  )))
  const consumerPath = path.join(sourceDirectory, "BatchedAutoImportConsumer.ets")
  const source = "const selected = Cha\nconst globalGuard = Home\n"
  await fs.promises.writeFile(consumerPath, source, "utf8")
  const uri = pathToFileURL(consumerPath).href
  const globals = conformanceGlobalScripts(materialized.workspaceRoot, consumerPath)
  assert.equal(globals.length, 6, "the fixture has six independent global scripts")
  const logDirectory = path.join(materialized.root, "semantic-auto-import-batches-logs")
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
      ARKTS_INDEX_SIDECAR_PATH: path.join(
        projectRoot,
        "tests",
        "fixtures",
        "index",
        "scripted-catalog-sidecar.mjs",
      ),
      ARKTS_INDEX_TEST_SCENARIO: "semantic-auto-import-batches",
      ARKTS_LSP_LOG_DIR: logDirectory,
      ARKTS_REFERENCES_TRACE: "1",
      ARKTS_AUTO_IMPORT_PROJECT_ROOT_PROFILE: "discovery",
      ARKTS_AUTO_IMPORT_BATCH_ROOTS: "2",
      ARKTS_AUTO_IMPORT_TRIM_BETWEEN_BATCHES: "1",
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  await session.initialize()
  session.openDocument({ uri, languageId: "arkts", version: 1, text: source })
  let indexReady = false
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const discovery = await session.request("workspace/symbol", { query: "ProductionIndexedType" })
    if (discovery.result?.some((symbol) => symbol.name === "ProductionIndexedType")) {
      indexReady = true
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.equal(indexReady, true, "scripted index session must open before completion discovery")

  const prefixOffset = source.indexOf("Cha")
  const response = await session.request("textDocument/completion", {
    textDocument: { uri },
    position: positionAt(source, prefixOffset + "Cha".length),
  })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  const matches = items.filter((item) => exportedNames.includes(item.label))
  assert.deepEqual(
    matches.map((item) => item.label).sort(),
    [...exportedNames].sort(),
    "batching must not truncate ready same-prefix export candidates",
  )

  const completionEvents = fs.readFileSync(path.join(logDirectory, "server.log"), "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse)
    .filter((entry) => entry.event === "completion.program.complete")
  assert.equal(completionEvents.length, 3, JSON.stringify(completionEvents))
  assert.deepEqual(
    completionEvents.map((entry) => entry.programProjectRootFiles),
    [3, 3, 2].map(count => count + globals.length),
    "candidate batches stay bounded while necessary script globals remain roots",
  )
  assert.deepEqual(completionEvents.map((entry) => entry.completionBatchIndex), [0, 1, 2])
  assert.deepEqual(completionEvents.map((entry) => entry.completionBatchCount), [3, 3, 3])
  assert.deepEqual(completionEvents.map((entry) => entry.discoveryRootCount), [2, 2, 1])
  assert.deepEqual(completionEvents.map((entry) => entry.discoveryCandidateCount), [2, 2, 1])
  assert.deepEqual(
    completionEvents.map((entry) => entry.discoveryRootFingerprints),
    [[1, 2], [3, 4], [5]].map((indexes) => indexes
      .map((index) => semanticRootFingerprint(
        materialized.workspaceRoot,
        path.join(sourceDirectory, `BatchExport${index}.ets`),
      ))
      .join(",")),
    "trace must correlate every Program with stable privacy-safe input root identities",
  )
  assert.equal(
    completionEvents.reduce((total, entry) => total + entry.preResolvedCompletions, 0),
    exportedNames.length,
  )
  const trimEvents = fs.readFileSync(path.join(logDirectory, "server.log"), "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse)
    .filter((entry) => entry.event === "completion.batch.trim")
  assert.deepEqual(trimEvents.map((entry) => entry.completionBatchIndex), [0, 1])
  assert.deepEqual(trimEvents.map((entry) => entry.completionBatchCount), [3, 3])
  assert.deepEqual(
    trimEvents.map((entry) => entry.discoveryRootFingerprints),
    completionEvents.slice(0, -1).map((entry) => entry.discoveryRootFingerprints),
  )
  assert.deepEqual(
    matches
      .filter((item) => item.label === "ChatChoice")
      .map((item) => item.detail)
      .sort(),
    ["./BatchExport2", "./BatchExport4"],
    "same-name candidates in different batches must retain distinct import sources",
  )

  for (const item of matches) {
    const resolved = await session.request("completionItem/resolve", item)
    assert.equal(resolved.error, undefined, JSON.stringify(resolved.error))
    const expectedIndex = Number.parseInt(item.detail.match(/BatchExport(\d+)/)?.[1] ?? "", 10)
    assert.equal(Number.isSafeInteger(expectedIndex), true, item.detail)
    assert.match(
      resolved.result.additionalTextEdits?.[0]?.newText ?? "",
      new RegExp(`BatchExport${expectedIndex}`),
    )
  }
  const resolveEvents = fs.readFileSync(path.join(logDirectory, "server.log"), "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse)
    .filter((entry) => entry.event === "completion.resolve.program.complete")
  assert.equal(resolveEvents.length, 0)
  const globalDefinition = await session.request("textDocument/definition", { textDocument: { uri },
    position: positionAt(source, source.lastIndexOf("Home") + 1) })
  assert.equal(globalDefinition.error, undefined, JSON.stringify(globalDefinition))
  assert.equal(globalDefinition.result?.length, 1)
  assert.equal(globalDefinition.result[0].uri, pathToFileURL(path.join(sourceDirectory, "Home.ets")).href)
})

function semanticRootFingerprint(workspaceRoot, rootPath) {
  const relative = path.relative(workspaceRoot, path.resolve(rootPath)).split(path.sep).join("/")
  return createHash("sha256").update(relative).digest("hex").slice(0, 16)
}
