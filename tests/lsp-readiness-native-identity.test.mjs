import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { projectRoot } from "./support/lsp-process.mjs"
import { createReadinessFixture, initializeReadinessFixture } from "./support/semantic-readiness-lsp.mjs"
import { createTestResourceScope } from "./support/test-resource-scope.mjs"

test("readiness transcripts use the explicitly selected real Native executable", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-native-selection-"))
  const track = createTestResourceScope(t, () => fs.rmSync(root, { recursive: true, force: true }))
  const name = process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar"
  const selected = path.join(root, name)
  fs.copyFileSync(process.env.ARKTS_TEST_NATIVE_BINARY ?? path.join(projectRoot, "target/release", name), selected)
  fs.chmodSync(selected, 0o755)
  const audit = path.join(root, "owner.ndjson")
  const original = process.env.ARKTS_TEST_NATIVE_BINARY
  let fixture
  process.env.ARKTS_TEST_NATIVE_BINARY = selected
  try {
    fixture = createReadinessFixture({ after: callback => track(callback) }, {
      NODE_OPTIONS: "--require=" + JSON.stringify(path.join(projectRoot, "tests/fixtures/index/native-child-lifetime-audit.cjs")),
      ARKTS_TEST_NATIVE_OWNER_AUDIT: audit,
      ARKTS_MEMORY_BUDGET_MB: undefined,
    })
  } finally {
    if (original === undefined) delete process.env.ARKTS_TEST_NATIVE_BINARY
    else process.env.ARKTS_TEST_NATIVE_BINARY = original
  }
  await initializeReadinessFixture(fixture)
  const rows = fs.readFileSync(audit, "utf8").trim().split("\n").map(JSON.parse)
  const identities = rows.filter(row => row.kind === "identity")
  assert.ok(identities.length > 0, "real Native startup must be observable")
  assert.deepEqual([...new Set(identities.map(row => row.binary))], [selected],
    "the fixture must not silently replace the selected candidate with its default installation")
})
