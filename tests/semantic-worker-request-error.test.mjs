import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { buildSync } from "esbuild"
import { projectRoot } from "./support/lsp-process.mjs"

// Pure transport classification complements the actual stdio stale-result RED.
test("post-computation invalidation stays distinct from unavailable inputs and cancellation wins", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-worker-error-contract-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const entry = path.join(directory, "entry.ts"), output = path.join(directory, "entry.cjs")
  fs.writeFileSync(entry, [
    `export { workerRequestErrorCode } from ${JSON.stringify(path.join(projectRoot, "src/semantic/semantic-worker-request-error.ts"))}`,
    `export { SemanticInputUnavailableError, SemanticResultInvalidatedError } from ${JSON.stringify(path.join(projectRoot, "src/core/types/typescript-query-inputs.ts"))}`,
    `export { createSemanticWorkerCancellationCell, SemanticWorkerCancelState } from ${JSON.stringify(path.join(projectRoot, "src/semantic/worker-protocol.ts"))}`,
  ].join("\n"))
  buildSync({ entryPoints: [entry], outfile: output, bundle: true, platform: "node", format: "cjs", target: "node20" })
  const api = createRequire(import.meta.url)(output)
  const unavailable = new api.SemanticInputUnavailableError()
  const invalidated = new api.SemanticResultInvalidatedError(unavailable)
  const cases = [
    ["active", invalidated, "content-modified"],
    ["active", unavailable, "workspace-incomplete"],
    ["clientCancelled", invalidated, "client-cancelled"],
    ["contentModified", unavailable, "content-modified"],
    ["supervisorDisposing", invalidated, "worker-unavailable"],
    ["active", new Error("unrelated failure"), "internal-error"],
  ]
  for (const [state, error, expected] of cases) {
    const cell = api.createSemanticWorkerCancellationCell()
    Atomics.store(new Int32Array(cell), 0, api.SemanticWorkerCancelState[state])
    assert.equal(api.workerRequestErrorCode(cell, error), expected, `${state}/${error.name}`)
  }
})
