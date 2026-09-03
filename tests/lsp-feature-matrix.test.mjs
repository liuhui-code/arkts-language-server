import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { CURRENT_LSP_CAPABILITY_CONTRACT } from "./support/capability-contract.mjs"
import {
  CURRENT_LSP_FEATURE_MATRIX,
  validateLspFeatureMatrix,
} from "./support/lsp-feature-matrix.mjs"
import { TEST_LAYER_MANIFEST } from "./support/test-layer-manifest.mjs"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("maps the complete public capability contract to executable feature evidence", () => {
  const audit = validateLspFeatureMatrix({
    root: projectRoot,
    matrix: CURRENT_LSP_FEATURE_MATRIX,
    capabilityContract: CURRENT_LSP_CAPABILITY_CONTRACT,
    layerManifest: TEST_LAYER_MANIFEST,
  })

  assert.deepEqual(audit.enabledFeatureIds, [
    "document-sync",
    "completion",
    "definition",
    "hover",
    "signature-help",
    "document-symbol",
    "workspace-symbol",
    "diagnostics",
    "completion-resolve",
  ])
  assert.deepEqual(audit.plannedFeatureIds, [
    "references",
    "rename",
    "code-actions",
  ])
  assert.equal(audit.requiredCapabilityCount, 10)
  assert.equal(audit.absentCapabilityCount, 3)
  assert.deepEqual(audit.artifactCoveredFeatureIds, [
    "completion",
    "definition",
    "workspace-symbol",
    "diagnostics",
    "completion-resolve",
  ])
  assert.deepEqual(audit.artifactGapFeatureIds, [
    "document-sync",
    "hover",
    "signature-help",
    "document-symbol",
    "references",
    "rename",
    "code-actions",
  ])
  const diagnostics = CURRENT_LSP_FEATURE_MATRIX.features.find(({ id }) => id === "diagnostics")
  assert.deepEqual(diagnostics?.knownGaps, [])
})

test("rejects capability and evidence drift instead of accepting a stale matrix", () => {
  const invalidMatrices = [
    [
      "missing bundle evidence",
      mutateFeature("completion", (feature) => {
        feature.evidence.bundle = []
      }),
      /completion: enabled feature requires bundle-e2e evidence/,
    ],
    [
      "wrong evidence layer",
      mutateFeature("completion", (feature) => {
        feature.evidence.protocol = ["tests/lsp-transcript.test.mjs"]
      }),
      /tests\/lsp-transcript\.test\.mjs is bundle-e2e, expected protocol/,
    ],
    [
      "enabled absent capability",
      mutateFeature("references", (feature) => {
        feature.state = "enabled"
      }),
      /references: enabled feature cannot cover absent capabilities/,
    ],
    [
      "empty artifact gap",
      mutateFeature("hover", (feature) => {
        feature.artifactGap = "   "
      }),
      /hover: missing artifact evidence requires artifactGap/,
    ],
  ]

  for (const [label, matrix, expected] of invalidMatrices) {
    assert.throws(
      () => validateLspFeatureMatrix({
        root: projectRoot,
        matrix,
        capabilityContract: CURRENT_LSP_CAPABILITY_CONTRACT,
        layerManifest: TEST_LAYER_MANIFEST,
      }),
      expected,
      label,
    )
  }
})

function mutateFeature(id, mutate) {
  const matrix = structuredClone(CURRENT_LSP_FEATURE_MATRIX)
  const feature = matrix.features.find((candidate) => candidate.id === id)
  assert.ok(feature, `unknown matrix feature: ${id}`)
  mutate(feature)
  return matrix
}
