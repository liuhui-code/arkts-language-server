import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const defaultFixtureRoot = fileURLToPath(
  new URL("../../fixtures/conformance/v1/", import.meta.url),
)

function positionAt(text, offset) {
  let line = 0
  let lineStart = 0

  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1
      lineStart = index + 1
    }
  }

  return { line, character: offset - lineStart }
}

function stripMarkers(source) {
  const markers = []
  const markerPattern = /\/\*@case\.([A-Za-z0-9][A-Za-z0-9._-]*)\*\//g
  let cursor = 0
  let stripped = ""

  for (const match of source.matchAll(markerPattern)) {
    stripped += source.slice(cursor, match.index)
    markers.push({ id: match[1], offset: stripped.length })
    cursor = match.index + match[0].length
  }

  stripped += source.slice(cursor)
  return { source: stripped, markers }
}

function markerIdentity(markerId) {
  if (markerId.endsWith(".start")) {
    return { caseId: markerId.slice(0, -".start".length), endpoint: "start" }
  }
  if (markerId.endsWith(".end")) {
    return { caseId: markerId.slice(0, -".end".length), endpoint: "end" }
  }
  return { caseId: markerId, endpoint: "position" }
}

async function etsFiles(root) {
  const files = []
  const entries = await fs.readdir(root, { withFileTypes: true })

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...await etsFiles(entryPath))
    } else if (entry.isFile() && path.extname(entry.name) === ".ets") {
      files.push(entryPath)
    }
  }

  return files
}

export async function materializeConformanceWorkspace({
  fixtureRoot = defaultFixtureRoot,
  temporaryRoot = os.tmpdir(),
} = {}) {
  const root = await fs.mkdtemp(path.join(temporaryRoot, "arkts-lsp-conformance-"))
  const corpusRoot = path.join(root, "corpus")
  const workspaceRoot = path.join(corpusRoot, "workspace")
  const cases = {}

  try {
    await fs.cp(fixtureRoot, corpusRoot, { recursive: true })

    for (const filePath of await etsFiles(workspaceRoot)) {
      const originalSource = await fs.readFile(filePath, "utf8")
      const materialized = stripMarkers(originalSource)
      const uri = pathToFileURL(filePath).href

      for (const marker of materialized.markers) {
        const { caseId, endpoint } = markerIdentity(marker.id)
        const testCase = cases[caseId] ?? { uri }
        const position = positionAt(materialized.source, marker.offset)

        if (endpoint === "position") {
          testCase.position = position
        } else {
          testCase.range ??= {}
          testCase.range[endpoint] = position
        }
        cases[caseId] = testCase
      }

      if (materialized.markers.length > 0) {
        await fs.writeFile(filePath, materialized.source, "utf8")
      }
    }

    return { root, corpusRoot, workspaceRoot, cases }
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true })
    throw error
  }
}
