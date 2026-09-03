import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { withTestEvidence } from "./support/test-evidence.mjs"

test("uses a unique evidence directory for each successful case and cleans it", async (t) => {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-test-evidence-"))
  t.after(() => fs.rmSync(evidenceRoot, { recursive: true, force: true }))

  const evidenceDirectories = []
  const results = await Promise.all(["first", "second"].map((result) => (
    withTestEvidence({ root: evidenceRoot, caseId: "completion/resolve" }, async ({ evidenceDirectory }) => {
      evidenceDirectories.push(evidenceDirectory)
      assert.equal(path.dirname(evidenceDirectory), evidenceRoot)
      assert.equal(fs.statSync(evidenceDirectory).isDirectory(), true)
      fs.writeFileSync(path.join(evidenceDirectory, "transcript.ndjson"), "temporary evidence")
      return result
    })
  )))

  assert.deepEqual(results, ["first", "second"])
  assert.notEqual(evidenceDirectories[0], evidenceDirectories[1])
  assert.deepEqual(fs.readdirSync(evidenceRoot), [])
})

test("retains failed case evidence with only an allowlisted failure summary", async (t) => {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-test-failure-"))
  t.after(() => fs.rmSync(evidenceRoot, { recursive: true, force: true }))

  const failure = Object.assign(new Error("language server exited"), {
    code: 17,
    signal: "SIGTERM",
    environment: { SECRET_TOKEN: "must-not-be-recorded" },
    source: "export const privateSource = true",
  })
  let retainedDirectory

  await assert.rejects(
    withTestEvidence({
      root: evidenceRoot,
      caseId: "completion/resolve",
      metadata: {
        target: "installed-artifact",
        commit: "0123456789abcdef",
        platform: "darwin-arm64",
        environment: { SECRET_TOKEN: "must-not-be-recorded" },
        source: "export const privateSource = true",
      },
    }, async ({ evidenceDirectory }) => {
      retainedDirectory = evidenceDirectory
      fs.writeFileSync(path.join(evidenceDirectory, "transcript.ndjson"), "request/response summary\n")
      throw failure
    }),
    (error) => error === failure,
  )

  assert.ok(retainedDirectory)
  assert.equal(fs.readFileSync(path.join(retainedDirectory, "transcript.ndjson"), "utf8"), "request/response summary\n")
  const failureJson = fs.readFileSync(path.join(retainedDirectory, "failure.json"), "utf8")
  assert.deepEqual(JSON.parse(failureJson), {
    schema: "arkts-language-server.test-failure",
    schemaVersion: 1,
    caseId: "completion/resolve",
    error: {
      name: "Error",
      message: "language server exited",
      code: 17,
      signal: "SIGTERM",
    },
    metadata: {
      commit: "0123456789abcdef",
      platform: "darwin-arm64",
      target: "installed-artifact",
    },
  })
  assert.doesNotMatch(failureJson, /SECRET_TOKEN|privateSource|must-not-be-recorded/)
})
