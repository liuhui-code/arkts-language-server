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
