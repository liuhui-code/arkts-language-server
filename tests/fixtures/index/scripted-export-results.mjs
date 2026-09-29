import path from "node:path"
import fs from "node:fs"
import { pathToFileURL } from "node:url"

/** Export responses owned by the scripted sidecar protocol fixture. */
export function scriptedExports(workspaceRoot, committedGeneration) {
  const batchedCompletionFixture = process.env.ARKTS_INDEX_TEST_SCENARIO
    === "semantic-auto-import-batches"
  const semanticFixture = process.env.ARKTS_INDEX_TEST_SCENARIO?.startsWith(
    "semantic-over-4096",
  ) === true
  const staleSemanticFixture = process.env.ARKTS_INDEX_TEST_SCENARIO
    === "semantic-over-4096-stale"
  const directItems = process.env.ARKTS_INDEX_TEST_SCENARIO === "reference-direct-import-anchor"
    ? directImportExport(workspaceRoot) : undefined
  const batchedItems = [
    "ChatAlpha",
    "ChatChoice",
    "ChatGamma",
    "ChatChoice",
    "ChatEpsilon",
  ].map((exportedName, ordinal) => ({
    exportedName,
    kind: "class",
    uri: pathToFileURL(path.join(
      workspaceRoot,
      "entry",
      "src",
      "main",
      "ets",
      "pages",
      `BatchExport${ordinal + 1}.ets`,
    )).href,
    range: {
      start: { line: 0, character: 13 },
      end: { line: 0, character: 13 + exportedName.length },
    },
    ordinal,
    declarationIdentity: `semantic-auto-import-batch-${ordinal + 1}`,
    importSpecifier: `./BatchExport${ordinal + 1}`,
    moduleId: "entry",
    targetScope: "default",
  }))
  return {
    items: directItems ?? (batchedCompletionFixture ? batchedItems : semanticFixture ? [{
      exportedName: "ExactNeedleExport",
      kind: "class",
      uri: pathToFileURL(path.join(
        workspaceRoot,
        "entry",
        "src",
        "main",
        "ets",
        "pages",
        "ManyExports.ets",
      )).href,
      range: {
        start: { line: 4_999, character: 13 },
        end: { line: 4_999, character: 30 },
      },
      ordinal: 4_999,
      declarationIdentity: "semantic-over-4096",
      importSpecifier: "./ManyExports",
      moduleId: "entry",
      targetScope: "default",
    }] : []),
    servedGeneration: committedGeneration,
    completeness: committedGeneration > 0 && !staleSemanticFixture ? "ready" : "stale",
  }
}

function directImportExport(workspaceRoot) {
  const target = path.join(workspaceRoot, "Target.ets")
  const line = fs.readFileSync(target, "utf8").split("\n")[0]
  const character = line.indexOf("Thing")
  return [{ exportedName: "Thing", kind: line.includes("type") ? "type" : "class",
    uri: pathToFileURL(target).href,
    range: { start: { line: 0, character }, end: { line: 0, character: character + 5 } },
    ordinal: 0, declarationIdentity: "scripted-reference-candidate" }]
}
