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

test("captures provider evidence only when the test case fails", async (t) => {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-provider-evidence-"))
  t.after(() => fs.rmSync(evidenceRoot, { recursive: true, force: true }))
  let captureCount = 0
  let retainedDirectory
  const captureFailure = async ({ evidenceDirectory }) => {
    captureCount += 1
    retainedDirectory = evidenceDirectory
    fs.writeFileSync(path.join(evidenceDirectory, "process.json"), "{\"exitCode\":23}\n")
    fs.writeFileSync(path.join(evidenceDirectory, "transcript.ndjson"), "{\"direction\":\"rx\"}\n")
  }

  const result = await withTestEvidence({
    root: evidenceRoot,
    caseId: "provider-success",
    captureFailure,
  }, async () => "passed")

  assert.equal(result, "passed")
  assert.equal(captureCount, 0)
  assert.deepEqual(fs.readdirSync(evidenceRoot), [])

  const originalFailure = new Error("semantic transcript failed")
  await assert.rejects(
    withTestEvidence({
      root: evidenceRoot,
      caseId: "provider-failure",
      captureFailure,
    }, async () => {
      throw originalFailure
    }),
    (error) => error === originalFailure,
  )

  assert.equal(captureCount, 1)
  assert.ok(retainedDirectory)
  assert.equal(fs.readFileSync(path.join(retainedDirectory, "process.json"), "utf8"), "{\"exitCode\":23}\n")
  assert.equal(fs.readFileSync(path.join(retainedDirectory, "transcript.ndjson"), "utf8"), "{\"direction\":\"rx\"}\n")
})

test("preserves the test error when failure evidence capture also fails", async (t) => {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-provider-failure-"))
  t.after(() => fs.rmSync(evidenceRoot, { recursive: true, force: true }))
  const originalFailure = new Error("original semantic assertion failed")
  const captureError = Object.assign(
    new TypeError(`CAPTURE_SECRET-${"x".repeat(1_000)}-PRIVATE_SOURCE`),
    {
      code: "SECRET_CAPTURE_CODE",
      environment: { SECRET_TOKEN: "must-not-be-recorded" },
      source: "export const privateSource = true",
    },
  )
  let retainedDirectory

  await assert.rejects(
    withTestEvidence({
      root: evidenceRoot,
      caseId: "provider-capture-failure",
      captureFailure: async ({ evidenceDirectory }) => {
        retainedDirectory = evidenceDirectory
        fs.writeFileSync(path.join(evidenceDirectory, "partial-process.json"), "{}\n")
        throw captureError
      },
    }, async () => {
      throw originalFailure
    }),
    (error) => error === originalFailure,
  )

  assert.ok(retainedDirectory)
  assert.equal(fs.readFileSync(path.join(retainedDirectory, "partial-process.json"), "utf8"), "{}\n")
  const failureJson = fs.readFileSync(path.join(retainedDirectory, "failure.json"), "utf8")
  const failure = JSON.parse(failureJson)
  assert.deepEqual(failure.captureFailure, {
    name: "TypeError",
    message: "Failure evidence provider did not complete",
  })
  assert.equal(failure.error.message, originalFailure.message)
  assert.ok(failureJson.length < 600, "capture failure summary must stay bounded")
  assert.doesNotMatch(
    failureJson,
    /CAPTURE_SECRET|PRIVATE_SOURCE|SECRET_CAPTURE_CODE|SECRET_TOKEN|privateSource|must-not-be-recorded/,
  )
})
