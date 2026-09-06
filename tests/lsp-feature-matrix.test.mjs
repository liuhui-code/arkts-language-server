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

test("requires installed verifiedClaims to exactly match one artifact test's matrix claims", () => {
  const entry = "tests/artifact.test.mjs"
  const exactTest = "runs the installed artifact"
  const matrix = {
    features: [
      artifactFeature("first.artifact.installed-first", entry, exactTest),
      artifactFeature("second.artifact.installed-second", entry, exactTest),
      artifactFeature("other.artifact.different-test", entry, "another artifact test"),
    ],
  }
  const verify = (verifiedClaims) => (
    featureMatrixSupport.assertExactVerifiedArtifactClaims({
      matrix,
      entry,
      test: exactTest,
      evidence: verifiedClaims === undefined ? {} : { verifiedClaims },
    })
  )

  assert.deepEqual(verify([
    "second.artifact.installed-second",
    "first.artifact.installed-first",
  ]), {
    expectedClaims: [
      "first.artifact.installed-first",
      "second.artifact.installed-second",
    ],
    verifiedClaims: [
      "first.artifact.installed-first",
      "second.artifact.installed-second",
    ],
  })
  assert.throws(() => verify(undefined), /verifiedClaims must be an array/)
  assert.throws(
    () => verify(["first.artifact.installed-first"]),
    /missing.*second\.artifact\.installed-second/,
  )
  assert.throws(
    () => verify([
      "first.artifact.installed-first",
      "second.artifact.installed-second",
      "extra.artifact.not-declared",
    ]),
    /extra.*extra\.artifact\.not-declared/,
  )
  assert.throws(
    () => verify([
      "first.artifact.installed-first",
      "first.artifact.installed-first",
      "second.artifact.installed-second",
    ]),
    /duplicate.*first\.artifact\.installed-first/,
  )
})

test("binds the installed semantic umbrella to its exact verified claim set", () => {
  const verifiedClaims = [
    "document-sync.artifact.immutable-incremental-overlay-lifecycle",
    "completion.artifact.immutable-typescript-arkui-sdk-resource-builder",
    "definition.artifact.immutable-typescript-arkui-sdk-resource-builder-ranges",
    "type-definition.artifact.immutable-unopened-variable-type-range",
    "implementation.artifact.immutable-unopened-interface-abstract-ranges",
    "inlay-hint.artifact.immutable-arkui-lowering-parameter-type-range-utf16-overlay",
    "hover.artifact.immutable-negotiated-markdown-plaintext-typescript-arkui-range",
    "signature-help.artifact.immutable-unopened-overload",
    "document-symbol.artifact.immutable-modern-legacy-kind-hierarchy",
    "workspace-symbol.artifact.immutable-modern-legacy-kind-uri-name-range",
    "diagnostics.artifact.immutable-versioned-arkui-resource-builder",
    "completion-resolve.artifact.immutable-auto-import",
    "references.artifact.immutable-unopened-barrel-declaration-policy",
    "rename.artifact.immutable-versioned-alias-conflict-applied-semantic-recheck",
    "code-actions.artifact.immutable-list-resolve-apply",
    "document-highlight.artifact.immutable-versioned-write-read-ranges",
    "folding-range.artifact.immutable-client-options-line-only-range-limit",
    "document-formatting.artifact.immutable-edits-apply-idempotent-semantics",
  ]
  const audit = featureMatrixSupport.assertExactVerifiedArtifactClaims({
    matrix: CURRENT_LSP_FEATURE_MATRIX,
    entry: "tests/release/portable-install.acceptance.mjs",
    test: "installs one verified artifact without source dependencies or a rebuild",
    evidence: { verifiedClaims },
  })

  assert.deepEqual(audit.verifiedClaims, [...verifiedClaims].sort())
  assert.equal(audit.expectedClaims.length, 18)
})

test("maps the complete public capability contract to executable feature evidence", () => {
  assert.equal(CURRENT_LSP_FEATURE_MATRIX.schemaVersion, 2)
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
    "type-definition",
    "implementation",
    "inlay-hint",
    "hover",
    "signature-help",
    "document-symbol",
    "workspace-symbol",
    "diagnostics",
    "completion-resolve",
    "references",
    "rename",
    "code-actions",
    "document-highlight",
    "folding-range",
    "document-formatting",
  ])
  assert.deepEqual(audit.plannedFeatureIds, [])
  assert.equal(audit.requiredCapabilityCount, 20)
  assert.equal(audit.absentCapabilityCount, 0)
  assert.deepEqual(audit.artifactCoveredFeatureIds, [
    "document-sync",
    "completion",
    "definition",
    "type-definition",
    "implementation",
    "inlay-hint",
    "hover",
    "signature-help",
    "document-symbol",
    "workspace-symbol",
    "diagnostics",
    "completion-resolve",
    "references",
    "rename",
    "code-actions",
    "document-highlight",
    "folding-range",
    "document-formatting",
  ])
  assert.deepEqual(audit.artifactGapFeatureIds, [])
  const editorFeatures = new Map([
    ["implementation", {
      provider: "implementationProvider",
      bundle: [{
        entry: "tests/lsp-transcript.test.mjs",
        test: "returns exact unopened implementations of an ArkTS interface and abstract class",
        claim: "implementation.bundle.unopened-interface-abstract-ranges",
      }],
      artifactClaim: "implementation.artifact.immutable-unopened-interface-abstract-ranges",
    }],
    ["type-definition", {
      provider: "typeDefinitionProvider",
      bundle: [{
        entry: "tests/lsp-transcript.test.mjs",
        test: "returns the exact unopened type definition for an ArkTS variable",
        claim: "type-definition.bundle.unopened-variable-type-range",
      }],
      artifactClaim: "type-definition.artifact.immutable-unopened-variable-type-range",
    }],
    ["inlay-hint", {
      provider: "inlayHintProvider",
      protocol: [
        {
          entry: "tests/lsp-semantic-request-reliability.test.mjs",
          test: "maps cancellation for every advertised semantic request to RequestCancelled",
          claim: "inlay-hint.protocol.cancellation",
        },
        {
          entry: "tests/lsp-semantic-request-reliability.test.mjs",
          test: "drops stale results for every advertised semantic request after didChange",
          claim: "inlay-hint.protocol.document-freshness",
        },
        {
          entry: "tests/lsp-semantic-request-reliability.test.mjs",
          test: "rejects every advertised semantic request after shutdown",
          claim: "inlay-hint.protocol.shutdown",
        },
        {
          entry: "tests/lsp-semantic-request-reliability.test.mjs",
          test: "sorts, deduplicates, and hard-bounds serialized inlay hint results",
          claim: "inlay-hint.protocol.stable-dedup-count-byte-budgets",
        },
      ],
      bundle: [
        {
          entry: "tests/lsp-transcript.test.mjs",
          test: "returns complete parameter-name inlay hints for an ArkTS call",
          claim: "inlay-hint.bundle.complete-parameter-names-range",
        },
        {
          entry: "tests/lsp-transcript.test.mjs",
          test: "returns an inferred type inlay hint within the requested UTF-16 range",
          claim: "inlay-hint.bundle.inferred-type-utf16-end-exclusive",
        },
        {
          entry: "tests/lsp-transcript.test.mjs",
          test: "returns inlay hints from the latest changed ArkTS overlay",
          claim: "inlay-hint.bundle.changed-overlay-freshness",
        },
      ],
      artifactClaim: "inlay-hint.artifact.immutable-arkui-lowering-parameter-type-range-utf16-overlay",
    }],
    ["document-highlight", {
      provider: "documentHighlightProvider",
      bundle: [{
        entry: "tests/semantic/document-highlight-depth.test.mjs",
        test: "highlights declaration writes and reads from the current changed overlay",
        claim: "document-highlight.bundle.versioned-write-read-ranges",
      }],
      artifactClaim: "document-highlight.artifact.immutable-versioned-write-read-ranges",
    }],
    ["folding-range", {
      provider: "foldingRangeProvider",
      bundle: [
        {
          entry: "tests/semantic/folding-range.test.mjs",
          test: "returns ArkUI, import, comment, and group folds for a line-only client",
          claim: "folding-range.bundle.arkui-import-comment-group-line-only",
        },
        {
          entry: "tests/semantic/folding-range.test.mjs",
          test: "honors rangeLimit with deterministic bounded character ranges",
          claim: "folding-range.bundle.client-range-limit-character-ranges",
        },
      ],
      artifactClaim: "folding-range.artifact.immutable-client-options-line-only-range-limit",
    }],
    ["document-formatting", {
      provider: "documentFormattingProvider",
      bundle: [{
        entry: "tests/semantic/document-formatting.test.mjs",
        test: "formats an ArkUI document without changing diagnostics or symbol identity",
        claim: "document-formatting.bundle.apply-idempotent-semantics",
      }],
      artifactClaim: "document-formatting.artifact.immutable-edits-apply-idempotent-semantics",
    }],
  ])
  for (const [featureId, expected] of editorFeatures) {
    const feature = CURRENT_LSP_FEATURE_MATRIX.features.find(({ id }) => id === featureId)
    assert.equal(feature?.state, "enabled")
    assert.deepEqual(feature?.requiredCapabilities, [{ path: expected.provider, expected: true }])
    assert.deepEqual(feature?.absentCapabilities, [])
    assert.deepEqual(feature?.evidence.protocol, expected.protocol ?? [
      {
        entry: "tests/lsp-semantic-request-reliability.test.mjs",
        test: "maps cancellation for every advertised semantic request to RequestCancelled",
        claim: `${featureId}.protocol.cancellation`,
      },
      {
        entry: "tests/lsp-semantic-request-reliability.test.mjs",
        test: "drops stale results for every advertised semantic request after didChange",
        claim: `${featureId}.protocol.document-freshness`,
      },
    ])
    assert.deepEqual(feature?.evidence.bundle, expected.bundle)
    assert.deepEqual(feature?.evidence.artifact, [{
      entry: "tests/release/portable-install.acceptance.mjs",
      test: "installs one verified artifact without source dependencies or a rebuild",
      claim: expected.artifactClaim,
    }])
    assert.equal(feature?.artifactGap, null)
  }
  const diagnostics = CURRENT_LSP_FEATURE_MATRIX.features.find(({ id }) => id === "diagnostics")
  assert.deepEqual(diagnostics?.knownGaps, [])
  const hover = CURRENT_LSP_FEATURE_MATRIX.features.find(({ id }) => id === "hover")
  assert.deepEqual(hover?.evidence.artifact, [{
    entry: "tests/release/portable-install.acceptance.mjs",
    test: "installs one verified artifact without source dependencies or a rebuild",
    claim: "hover.artifact.immutable-negotiated-markdown-plaintext-typescript-arkui-range",
  }])
  assert.equal(hover?.artifactGap, null)
  const signatureHelp = CURRENT_LSP_FEATURE_MATRIX.features.find(
    ({ id }) => id === "signature-help",
  )
  assert.deepEqual(signatureHelp?.evidence.artifact, [{
    entry: "tests/release/portable-install.acceptance.mjs",
    test: "installs one verified artifact without source dependencies or a rebuild",
    claim: "signature-help.artifact.immutable-unopened-overload",
  }])
  assert.equal(signatureHelp?.artifactGap, null)
  const documentSymbol = CURRENT_LSP_FEATURE_MATRIX.features.find(
    ({ id }) => id === "document-symbol",
  )
  assert.deepEqual(documentSymbol?.evidence.artifact, [{
    entry: "tests/release/portable-install.acceptance.mjs",
    test: "installs one verified artifact without source dependencies or a rebuild",
    claim: "document-symbol.artifact.immutable-modern-legacy-kind-hierarchy",
  }])
  assert.equal(documentSymbol?.artifactGap, null)
  const workspaceSymbol = CURRENT_LSP_FEATURE_MATRIX.features.find(
    ({ id }) => id === "workspace-symbol",
  )
  assert.deepEqual(workspaceSymbol?.evidence.bundle, [
    {
      entry: "tests/lsp-production-index.test.mjs",
      test: "production composition exposes cached search and terminal catalog progress",
      claim: "workspace-symbol.bundle.production-catalog",
    },
    {
      entry: "tests/semantic/workspace-symbol-production.test.mjs",
      test: "returns every production overlay workspace-symbol kind with exact UTF-16 name ranges",
      claim: "workspace-symbol.bundle.production-full-kinds",
    },
  ])
  assert.deepEqual(workspaceSymbol?.evidence.artifact, [{
    entry: "tests/release/portable-install.acceptance.mjs",
    test: "installs one verified artifact without source dependencies or a rebuild",
    claim: "workspace-symbol.artifact.immutable-modern-legacy-kind-uri-name-range",
  }])
  const references = CURRENT_LSP_FEATURE_MATRIX.features.find(
    ({ id }) => id === "references",
  )
  assert.deepEqual(references?.evidence.protocol, [
    {
      entry: "tests/lsp-semantic-request-reliability.test.mjs",
      test: "maps cancellation for every advertised semantic request to RequestCancelled",
      claim: "references.protocol.cancellation",
    },
    {
      entry: "tests/lsp-workspace-global-freshness.test.mjs",
      test: "a didOpen in the same workspace makes an in-flight references result ContentModified",
      claim: "references.protocol.workspace-global-freshness",
    },
  ])
  assert.deepEqual(references?.evidence.bundle, [
    {
      entry: "tests/semantic/references-depth.test.mjs",
      test: "finds unopened barrel references with exact UTF-16 ranges and declaration policy",
      claim: "references.bundle.unopened-barrel-declaration-policy",
    },
    {
      entry: "tests/semantic/references-completeness.test.mjs",
      test: "classifies every overload declaration without losing stable usage references",
      claim: "references.bundle.overload-declaration-policy",
    },
    {
      entry: "tests/semantic/references-depth.test.mjs",
      test: "uses only changed overlay references for both declaration policies",
      claim: "references.bundle.changed-overlay",
    },
  ])
  assert.deepEqual(references?.evidence.artifact, [{
    entry: "tests/release/portable-install.acceptance.mjs",
    test: "installs one verified artifact without source dependencies or a rebuild",
    claim: "references.artifact.immutable-unopened-barrel-declaration-policy",
  }])
  assert.equal(references?.artifactGap, null)
  const rename = CURRENT_LSP_FEATURE_MATRIX.features.find(({ id }) => id === "rename")
  assert.deepEqual(rename?.evidence.protocol, [
    {
      entry: "tests/lsp-semantic-request-reliability.test.mjs",
      test: "maps rename client cancellation to RequestCancelled without leaking an edit",
      claim: "rename.protocol.cancellation-no-edit",
    },
    {
      entry: "tests/lsp-workspace-global-freshness.test.mjs",
      test: "every same-workspace mutation makes cancellation-resistant rename ContentModified",
      claim: "rename.protocol.workspace-global-freshness",
    },
  ])
  assert.deepEqual(rename?.evidence.bundle, [
    {
      entry: "tests/semantic/rename-depth.test.mjs",
      test: "rename preserves the barrel API while changing the origin declaration",
      claim: "rename.bundle.origin-barrel-api-preservation",
    },
    {
      entry: "tests/semantic/rename-completeness.test.mjs",
      test: "renaming an explicit barrel alias changes only the public alias layer",
      claim: "rename.bundle.public-local-alias-boundary",
    },
    {
      entry: "tests/semantic/rename-completeness.test.mjs",
      test: "rejects rename when the target name already exists in the same scope",
      claim: "rename.bundle.same-scope-conflict",
    },
  ])
  assert.deepEqual(rename?.evidence.artifact, [{
    entry: "tests/release/portable-install.acceptance.mjs",
    test: "installs one verified artifact without source dependencies or a rebuild",
    claim: "rename.artifact.immutable-versioned-alias-conflict-applied-semantic-recheck",
  }])
  assert.equal(rename?.artifactGap, null)
})

test("cannot silently drop an enabled editor capability evidence slice", () => {
  const requiredProviders = new Map([
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
    /completion: tests\/lsp-reliability\.test\.mjs has no exact node:test named "renamed completion scenario"/,
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
    /completion: protocol evidence reuses tests\/lsp-reliability\.test\.mjs#"a newer completion request supersedes the previous request in its lane" for multiple claims/,
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

function artifactFeature(claim, entry, exactTest) {
  return {
    evidence: {
      artifact: [{ entry, test: exactTest, claim }],
    },
  }
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
