import assert from "node:assert/strict"
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

  assert.equal(audit.entryCount, 33)
  assert.equal(audit.assignments["tests/test-layer-manifest.test.mjs"], "unit-contract")
  assert.deepEqual(audit.layerCounts, {
    "unit-contract": 16,
    protocol: 5,
    "bundle-e2e": 9,
    "artifact-e2e": 2,
    large: 1,
  })
})
