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
    "call-hierarchy.artifact.immutable-prepare-outgoing-incoming-unopened-utf16",
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
  assert.equal(audit.expectedClaims.length, 19)
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
    "call-hierarchy",
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
  assert.equal(audit.requiredCapabilityCount, 21)
  assert.equal(audit.absentCapabilityCount, 0)
  assert.deepEqual(audit.artifactCoveredFeatureIds, [
    "document-sync",
    "completion",
    "definition",
    "type-definition",
    "implementation",
    "call-hierarchy",
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
    ["call-hierarchy", {
      provider: "callHierarchyProvider",
      protocol: [
        {
          entry: "tests/lsp-call-hierarchy-reliability.test.mjs",
          test: "maps prepareCallHierarchy client cancellation to RequestCancelled",
          claim: "call-hierarchy.protocol.prepare-cancellation",
        },
        {
          entry: "tests/lsp-call-hierarchy-reliability.test.mjs",
          test: "maps outgoingCalls client cancellation to RequestCancelled",
          claim: "call-hierarchy.protocol.outgoing-cancellation",
        },
        {
          entry: "tests/lsp-call-hierarchy-reliability.test.mjs",
          test: "maps incomingCalls client cancellation to RequestCancelled",
          claim: "call-hierarchy.protocol.incoming-cancellation",
        },
        {
          entry: "tests/lsp-call-hierarchy-reliability.test.mjs",
          test: "rejects cancellation-resistant prepareCallHierarchy after didChange",
          claim: "call-hierarchy.protocol.prepare-document-freshness",
        },
        {
          entry: "tests/lsp-call-hierarchy-reliability.test.mjs",
          test: "rejects cancellation-resistant outgoingCalls after didChange",
          claim: "call-hierarchy.protocol.outgoing-document-freshness",
        },
        {
          entry: "tests/lsp-call-hierarchy-reliability.test.mjs",
          test: "rejects cancellation-resistant incomingCalls after didChange",
          claim: "call-hierarchy.protocol.incoming-document-freshness",
        },
        {
          entry: "tests/lsp-call-hierarchy-reliability.test.mjs",
          test: "rejects every call hierarchy request after shutdown",
          claim: "call-hierarchy.protocol.shutdown",
        },
      ],
      bundle: [
        {
          entry: "tests/lsp-call-hierarchy.test.mjs",
          test: "prepares a callable and returns its exact cross-file outgoing calls over production stdio",
          claim: "call-hierarchy.bundle.prepare-outgoing-unopened-target-utf16",
        },
        {
          entry: "tests/lsp-call-hierarchy.test.mjs",
          test: "returns one exact unopened caller with both UTF-16 incoming call sites",
          claim: "call-hierarchy.bundle.incoming-unopened-caller-utf16",
        },
        {
          entry: "tests/lsp-call-hierarchy.test.mjs",
          test: "rejects a physically escaped result source through production registration stdio",
          claim: "call-hierarchy.bundle.stdio-production-wiring-physical-result-source-validation",
        },
        {
          entry: "tests/lsp-call-hierarchy.test.mjs",
          test: "rejects raw call work before result-source validation through production registration stdio",
          claim: "call-hierarchy.bundle.stdio-production-wiring-raw-work-preflight-before-source-validation",
        },
        {
          entry: "tests/lsp-call-hierarchy.test.mjs",
          test: "enforces aggregate result-source bytes through production registration stdio",
          claim: "call-hierarchy.bundle.stdio-production-wiring-aggregate-result-source-budget",
        },
      ],
      artifactClaim: "call-hierarchy.artifact.immutable-prepare-outgoing-incoming-unopened-utf16",
    }],
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
  const callHierarchy = CURRENT_LSP_FEATURE_MATRIX.features.find(
    ({ id }) => id === "call-hierarchy",
  )
  assert.deepEqual(callHierarchy?.knownGaps, [
    "Incoming call discovery performs a correctness-first O(project) membership and content refresh for each request.",
    "TypeScript call-hierarchy queries run synchronously on the stdio process and cannot be preempted inside the compiler query.",
  ])
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

function artifactFeature(claim, entry, exactTest) {
  return {
    evidence: {
      artifact: [{ entry, test: exactTest, claim }],
    },
  }
}
