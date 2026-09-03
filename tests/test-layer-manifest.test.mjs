import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  TEST_LAYER_MANIFEST,
  validateTestLayerManifest,
} from "./support/test-layer-manifest.mjs"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("classifies every executable test entry exactly once in an explicit layer", () => {
  const audit = validateTestLayerManifest({ root: projectRoot, manifest: TEST_LAYER_MANIFEST })

  assert.equal(audit.entryCount, 38)
  assert.equal(audit.assignments["tests/index-adapter.test.mjs"], "unit-contract")
  assert.equal(
    audit.assignments["tests/release/index-sidecar.acceptance.mjs"],
    "artifact-e2e",
  )
  assert.equal(audit.assignments["tests/test-layer-manifest.test.mjs"], "unit-contract")
  assert.deepEqual(audit.layerCounts, {
    "unit-contract": 19,
    protocol: 5,
    "bundle-e2e": 10,
    "artifact-e2e": 3,
    large: 1,
  })
})

test("rejects explicit node:test skip calls in fast layers", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-test-layer-skips-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, "tests"), { recursive: true })
  fs.writeFileSync(path.join(root, "tests", "conditional.test.mjs"), [
    'import test from "node:test"',
    "test.skip(\"disabled fast test\", () => {})",
    "test(\"requires a built artifact\", (t) => {",
    "  t.skip(\"artifact is missing\")",
    "})",
    "",
  ].join("\n"))

  assert.throws(
    () => validateTestLayerManifest({
      root,
      manifest: {
        layers: [{
          id: "unit-contract",
          fast: true,
          entries: ["tests/conditional.test.mjs"],
        }],
      },
    }),
    (error) => {
      assert.match(
        error.message,
        /tests\/conditional\.test\.mjs:2: fast layer unit-contract contains test\.skip\(\.\.\.\)/,
      )
      assert.match(
        error.message,
        /tests\/conditional\.test\.mjs:4: fast layer unit-contract contains t\.skip\(\.\.\.\)/,
      )
      return true
    },
  )
})
