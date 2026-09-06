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

  assert.equal(audit.entryCount, 78)
  assert.equal(audit.assignments["tests/arkts-document-formatter.test.mjs"], "unit-contract")
  assert.equal(audit.assignments["tests/build-test-server.test.mjs"], "unit-contract")
  assert.equal(
    audit.assignments["tests/code-action-resolution-store.test.mjs"],
    "unit-contract",
  )
  assert.equal(audit.assignments["tests/document-store-cancellation.test.mjs"], "unit-contract")
  assert.equal(audit.assignments["tests/index-adapter.test.mjs"], "unit-contract")
  assert.equal(audit.assignments["tests/folding-range-provider.test.mjs"], "unit-contract")
  assert.equal(audit.assignments["tests/performance-evidence.test.mjs"], "unit-contract")
  assert.equal(audit.assignments["tests/portable-artifact-builder.test.mjs"], "unit-contract")
  assert.equal(audit.assignments["tests/process-resource-probe.test.mjs"], "unit-contract")
  assert.equal(audit.assignments["tests/semantic-cancellation-scope.test.mjs"], "unit-contract")
  assert.equal(
    audit.assignments["tests/semantic/typescript-inlay-highlight-cancellation.test.mjs"],
    "unit-contract",
  )
  assert.equal(
    audit.assignments["tests/semantic-worker-call-hierarchy-protocol.test.mjs"],
    "unit-contract",
  )
  assert.equal(audit.assignments["tests/semantic-worker-protocol.test.mjs"], "unit-contract")
  assert.equal(audit.assignments["tests/semantic-worker-supervisor.test.mjs"], "unit-contract")
  assert.equal(
    audit.assignments["tests/semantic/typescript-cancellation-bridge.test.mjs"],
    "unit-contract",
  )
  assert.equal(
    audit.assignments["tests/semantic/typescript-cooperative-cancellation.test.mjs"],
    "unit-contract",
  )
  assert.equal(
    audit.assignments["tests/semantic/typescript-diagnostics-symbol-cancellation.test.mjs"],
    "unit-contract",
  )
  assert.equal(
    audit.assignments["tests/semantic/typescript-rename-cancellation.test.mjs"],
    "unit-contract",
  )
  assert.equal(
    audit.assignments["tests/release/index-sidecar.acceptance.mjs"],
    "artifact-e2e",
  )
  assert.equal(
    audit.assignments["tests/release/sealed-portable-artifact.acceptance.mjs"],
    "sealed-artifact-e2e",
  )
  assert.equal(audit.assignments["tests/lsp-workspace-global-freshness.test.mjs"], "protocol")
  assert.equal(audit.assignments["tests/lsp-call-hierarchy-reliability.test.mjs"], "protocol")
  assert.equal(audit.assignments["tests/semantic-worker-test-harness.test.mjs"], "protocol")
  assert.equal(audit.assignments["tests/test-layer-manifest.test.mjs"], "unit-contract")
  assert.equal(
    audit.assignments["tests/semantic/document-formatting.test.mjs"],
    "bundle-e2e",
  )
  assert.equal(audit.assignments["tests/lsp-call-hierarchy.test.mjs"], "bundle-e2e")
  assert.equal(
    audit.assignments["tests/semantic/document-highlight-core.test.mjs"],
    "unit-contract",
  )
  assert.equal(
    audit.assignments["tests/semantic/document-highlight-depth.test.mjs"],
    "bundle-e2e",
  )
  assert.equal(
    audit.assignments["tests/semantic/document-symbol-depth.test.mjs"],
    "bundle-e2e",
  )
  assert.equal(audit.assignments["tests/semantic/folding-range.test.mjs"], "bundle-e2e")
  assert.equal(
    audit.assignments["tests/semantic/arkui-language-features.test.mjs"],
    "bundle-e2e",
  )
  assert.equal(
    audit.assignments["tests/semantic/arkui-builder-tail.test.mjs"],
    "bundle-e2e",
  )
  assert.equal(
    audit.assignments["tests/semantic/arkui-diagnostics-depth.test.mjs"],
    "bundle-e2e",
  )
  assert.equal(
    audit.assignments["tests/semantic/arkui-resource-watch-diagnostics.test.mjs"],
    "bundle-e2e",
  )
  assert.equal(
    audit.assignments["tests/semantic/arkui-sdk-symbols.test.mjs"],
    "bundle-e2e",
  )
  assert.equal(
    audit.assignments["tests/semantic/project-membership-language-service.test.mjs"],
    "bundle-e2e",
  )
  assert.equal(
    audit.assignments["tests/semantic/references-completeness.test.mjs"],
    "bundle-e2e",
  )
  assert.equal(audit.assignments["tests/semantic/references-depth.test.mjs"], "bundle-e2e")
  assert.equal(audit.assignments["tests/semantic/rename-depth.test.mjs"], "bundle-e2e")
  assert.equal(
    audit.assignments["tests/semantic/rename-completeness.test.mjs"],
    "bundle-e2e",
  )
  assert.equal(
    audit.assignments["tests/semantic/workspace-symbol-production.test.mjs"],
    "bundle-e2e",
  )
  assert.deepEqual(audit.layerCounts, {
    "unit-contract": 38,
    protocol: 8,
    "bundle-e2e": 27,
    "artifact-e2e": 3,
    "sealed-artifact-e2e": 1,
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
