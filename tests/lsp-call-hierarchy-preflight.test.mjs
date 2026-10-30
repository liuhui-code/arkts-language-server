import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { buildSync } from "esbuild"
import { projectRoot } from "./support/lsp-process.mjs"

const require = createRequire(import.meta.url)
const fixtureRoot = path.join(projectRoot, "fixtures", "basic")
const fixtureRootUri = pathToFileURL(fixtureRoot).href
const sourceUri = pathToFileURL(path.join(fixtureRoot, "CallSource.ets")).href
const sourceText = fs.readFileSync(path.join(fixtureRoot, "CallSource.ets"), "utf8")

test("rejects raw duplicate work before any result-source filesystem validation", async (t) => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-runner-preflight-"))
  t.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }))
  const outputPath = path.join(outputDirectory, "runner.cjs")
  buildSync({
    stdin: {
      contents: [
        "export { SemanticRequestRunner } from './src/lsp/semantic-request-runner.ts'",
        "export { assertCallHierarchyOutgoingWorkBudget } from './src/lsp/call-hierarchy-adapter.ts'",
      ].join("\n"),
      resolveDir: projectRoot,
      sourcefile: "runner-preflight.ts",
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: outputPath,
    logLevel: "silent",
  })
  const {
    SemanticRequestRunner,
    assertCallHierarchyOutgoingWorkBudget,
  } = require(outputPath)
  const abortController = new AbortController()
  let resultSourceLookups = 0
  const runner = new SemanticRequestRunner({
    documents: {},
    freshness: {
      startConcurrent: () => ({
        signal: abortController.signal,
        clientCancelled: () => false,
        isCurrent: () => true,
        finish: () => {},
      }),
    },
    logger: { info: () => {} },
    callHierarchySources: {
      workspace: () => ({ id: "workspace", rootUri: fixtureRootUri }),
      resolve: async () => ({
        status: "complete",
        source: {
          kind: "disk",
          uri: sourceUri,
          text: sourceText,
          workspaceId: "workspace",
          workspaceRootUri: fixtureRootUri,
        },
        identity: {},
      }),
      validateResultItems: async () => {
        resultSourceLookups += 1
        return undefined
      },
      isCurrent: async () => true,
    },
    assertRunning: () => {},
    snapshot: () => { throw new Error("unused") },
  })
  const duplicate = {
    to: semanticCallHierarchyItem("Missing.ts", "missing"),
    fromRanges: [protocolRange(0)],
  }
  await assert.rejects(
    runner.runCallHierarchy({
      method: "callHierarchy/outgoingCalls",
      documentUri: sourceUri,
      rootUri: fixtureRootUri,
      fallback: { status: "stale" },
      incomplete: (reason) => ({ status: "incomplete", reason }),
      preflight: (result) => assertCallHierarchyOutgoingWorkBudget(result.calls),
      resultItems: (result) => result.calls.map((call) => call.to),
      execute: async () => ({
        status: "complete",
        calls: Array.from({ length: 257 }, () => duplicate),
      }),
    }),
    (error) => error.code === -32803
      && error.message === "Call hierarchy result is incomplete: result-limit-exceeded.",
  )
  assert.equal(resultSourceLookups, 0)
})

function semanticCallHierarchyItem(fileName, name) {
  const range = protocolRange(0)
  return {
    uri: pathToFileURL(path.join(fixtureRoot, fileName)).href,
    name,
    kind: "function",
    range,
    selectionRange: range,
  }
}

function protocolRange(line) {
  return {
    start: { line, character: 0 },
    end: { line, character: 1 },
  }
}
