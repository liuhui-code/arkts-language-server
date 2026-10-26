import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { CURRENT_LSP_CAPABILITY_CONTRACT } from "./support/capability-contract.mjs"
import * as featureMatrixSupport from "./support/lsp-feature-matrix.mjs"
import {
  CURRENT_LSP_FEATURE_MATRIX,
  validateLspFeatureMatrix,
} from "./support/lsp-feature-matrix.mjs"
import { TEST_LAYER_MANIFEST } from "./support/test-layer-manifest.mjs"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("cannot silently drop an enabled editor capability evidence slice", () => {
  const requiredProviders = new Map([
    ["call-hierarchy", "callHierarchyProvider"],
    ["document-highlight", "documentHighlightProvider"],
    ["folding-range", "foldingRangeProvider"],
    ["document-formatting", "documentFormattingProvider"],
  ])

  for (const [featureId, provider] of requiredProviders) {
    const matrix = structuredClone(CURRENT_LSP_FEATURE_MATRIX)
    matrix.features = matrix.features.filter(({ id }) => id !== featureId)
    assert.throws(
      () => validateLspFeatureMatrix({
        root: projectRoot,
        matrix,
        capabilityContract: CURRENT_LSP_CAPABILITY_CONTRACT,
        layerManifest: TEST_LAYER_MANIFEST,
      }),
      new RegExp(`${provider}: required capability must be covered once; covered by none`),
      featureId,
    )
  }
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
        feature.evidence.protocol = [{
          entry: "tests/lsp-transcript.test.mjs",
          test: "completes both a field and a method from the opened ArkTS snapshot",
          claim: "completion.protocol.wrong-layer",
        }]
      }),
      /tests\/lsp-transcript\.test\.mjs is bundle-e2e, expected protocol/,
    ],
    [
      "planned required capability",
      mutateFeature("rename", (feature) => {
        feature.state = "planned"
      }),
      /rename: planned feature cannot cover required capabilities/,
    ],
    [
      "empty artifact gap",
      mutateFeature("completion", (feature) => {
        feature.evidence.artifact = []
        feature.artifactGap = "   "
      }),
      /completion: missing artifact evidence requires artifactGap/,
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

test("rejects an enabled capability without immutable artifact evidence", () => {
  const matrix = mutateFeature("references", (feature) => {
    feature.evidence.artifact = []
    feature.artifactGap = "Artifact transcript is still pending."
  })

  assert.throws(
    () => validateLspFeatureMatrix({
      root: projectRoot,
      matrix,
      capabilityContract: CURRENT_LSP_CAPABILITY_CONTRACT,
      layerManifest: TEST_LAYER_MANIFEST,
    }),
    /references: enabled feature requires artifact-e2e evidence/,
  )
})

test("rejects path-only evidence without an exact node:test name and stable claim", () => {
  const matrix = structuredClone(CURRENT_LSP_FEATURE_MATRIX)
  const completion = matrix.features.find(({ id }) => id === "completion")
  assert.ok(completion)
  completion.evidence.protocol = ["tests/lsp-reliability.test.mjs"]

  assert.throws(
    () => validateLspFeatureMatrix({
      root: projectRoot,
      matrix,
      capabilityContract: CURRENT_LSP_CAPABILITY_CONTRACT,
      layerManifest: TEST_LAYER_MANIFEST,
    }),
    /completion: protocol evidence must name entry, node:test, and stable claim/,
  )
})

test("rejects evidence whose exact node:test name is missing", () => {
  const matrix = mutateFeature("completion", (feature) => {
    feature.evidence.protocol[0].test = "renamed completion scenario"
  })

  assert.throws(
    () => validateLspFeatureMatrix({
      root: projectRoot,
      matrix,
      capabilityContract: CURRENT_LSP_CAPABILITY_CONTRACT,
      layerManifest: TEST_LAYER_MANIFEST,
    }),
    /completion: tests\/lsp-completion-reliability\.test\.mjs has no exact node:test named "renamed completion scenario"/,
  )
})

test("rejects an ambiguous duplicate node:test name in one evidence entry", (t) => {
  const fixture = makeEvidenceFixture(t, {
    protocolSource: [
      'import test from "node:test"',
      'test("duplicate scenario", () => {})',
      'test("duplicate scenario", () => {})',
    ].join("\n"),
    protocolTest: "duplicate scenario",
  })

  assert.throws(
    () => validateLspFeatureMatrix(fixture),
    /fixture: tests\/protocol\.test\.mjs has 2 node:tests named "duplicate scenario"; expected exactly one/,
  )
})

test("rejects a human label instead of a feature-scoped stable claim", () => {
  const matrix = mutateFeature("completion", (feature) => {
    feature.evidence.protocol[0].claim = "Completion latest wins."
  })

  assert.throws(
    () => validateLspFeatureMatrix({
      root: projectRoot,
      matrix,
      capabilityContract: CURRENT_LSP_CAPABILITY_CONTRACT,
      layerManifest: TEST_LAYER_MANIFEST,
    }),
    /completion: protocol evidence claim must match completion\.protocol\.<stable-slug>/,
  )
})

test("rejects a duplicate evidence claim across the matrix", () => {
  const matrix = mutateFeature("completion", (feature) => {
    feature.evidence.protocol.push({
      entry: "tests/lsp-reliability.test.mjs",
      test: "runs injected semantic services and observes framed notifications",
      claim: feature.evidence.protocol[0].claim,
    })
  })

  assert.throws(
    () => validateLspFeatureMatrix({
      root: projectRoot,
      matrix,
      capabilityContract: CURRENT_LSP_CAPABILITY_CONTRACT,
      layerManifest: TEST_LAYER_MANIFEST,
    }),
    /completion: duplicate evidence claim completion\.protocol\.latest-wins/,
  )
})

test("rejects relabeling one exact test as multiple claims in one feature layer", () => {
  const matrix = mutateFeature("completion", (feature) => {
    feature.evidence.protocol.push({
      ...feature.evidence.protocol[0],
      claim: "completion.protocol.same-test-new-label",
    })
  })

  assert.throws(
    () => validateLspFeatureMatrix({
      root: projectRoot,
      matrix,
      capabilityContract: CURRENT_LSP_CAPABILITY_CONTRACT,
      layerManifest: TEST_LAYER_MANIFEST,
    }),
    /completion: protocol evidence reuses tests\/lsp-completion-reliability\.test\.mjs#"a newer completion request supersedes the previous request in its lane" for multiple claims/,
  )
})

test("rejects evidence records with extra fields or whitespace-only names", () => {
  const extraField = mutateFeature("completion", (feature) => {
    feature.evidence.protocol[0].owner = "someone"
  })
  const whitespaceName = mutateFeature("completion", (feature) => {
    feature.evidence.protocol[0].test = "   "
  })

  for (const matrix of [extraField, whitespaceName]) {
    assert.throws(
      () => validateLspFeatureMatrix({
        root: projectRoot,
        matrix,
        capabilityContract: CURRENT_LSP_CAPABILITY_CONTRACT,
        layerManifest: TEST_LAYER_MANIFEST,
      }),
      /completion: protocol evidence must name entry, node:test, and stable claim/,
    )
  }
})

test("rejects evidence entries that escape the repository root", (t) => {
  const fixture = makeEvidenceFixture(t, {
    protocolEntry: "../outside.test.mjs",
    protocolSource: 'import test from "node:test"\ntest("outside scenario", () => {})\n',
    protocolTest: "outside scenario",
  })

  assert.throws(
    () => validateLspFeatureMatrix(fixture),
    /fixture: protocol evidence entry must be a normalized repository-relative path: \.\.\/outside\.test\.mjs/,
  )
})

test("does not treat a dynamic test title as exact named evidence", (t) => {
  const fixture = makeEvidenceFixture(t, {
    protocolSource: [
      'import test from "node:test"',
      'const title = "dynamic scenario"',
      "test(title, () => {})",
    ].join("\n"),
    protocolTest: "dynamic scenario",
  })

  assert.throws(
    () => validateLspFeatureMatrix(fixture),
    /fixture: tests\/protocol\.test\.mjs has no exact node:test named "dynamic scenario"/,
  )
})

function mutateFeature(id, mutate) {
  const matrix = structuredClone(CURRENT_LSP_FEATURE_MATRIX)
  const feature = matrix.features.find((candidate) => candidate.id === id)
  assert.ok(feature, `unknown matrix feature: ${id}`)
  mutate(feature)
  return matrix
}

function makeEvidenceFixture(t, {
  protocolEntry = "tests/protocol.test.mjs",
  protocolSource,
  protocolTest,
  protocolClaim = "fixture.protocol.scenario",
}) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-feature-matrix-"))
  const root = path.join(temporaryRoot, "project")
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, "tests"), { recursive: true })
  const protocolPath = path.resolve(root, ...protocolEntry.split("/"))
  fs.mkdirSync(path.dirname(protocolPath), { recursive: true })
  fs.writeFileSync(protocolPath, protocolSource)
  fs.writeFileSync(
    path.join(root, "tests", "bundle.test.mjs"),
    'import test from "node:test"\ntest("bundle scenario", () => {})\n',
  )

  return {
    root,
    matrix: {
      features: [{
        id: "fixture",
        state: "enabled",
        requiredCapabilities: [],
        absentCapabilities: [],
        protocolEvidenceRequired: true,
        evidence: {
          protocol: [{
            entry: protocolEntry,
            test: protocolTest,
            claim: protocolClaim,
          }],
          bundle: [{
            entry: "tests/bundle.test.mjs",
            test: "bundle scenario",
            claim: "fixture.bundle.scenario",
          }],
          artifact: [],
        },
        artifactGap: "No artifact fixture is required for this validator test.",
        knownGaps: [],
      }],
    },
    capabilityContract: { required: [], absent: [] },
    layerManifest: {
      layers: [
        { id: "protocol", entries: [protocolEntry] },
        { id: "bundle-e2e", entries: ["tests/bundle.test.mjs"] },
        { id: "artifact-e2e", entries: [] },
      ],
    },
  }
}
