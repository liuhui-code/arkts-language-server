import fs from "node:fs"
import { isDeepStrictEqual } from "node:util"
import path from "node:path"
import ts from "typescript"

export const CURRENT_LSP_FEATURE_MATRIX = Object.freeze({
  schema: "arkts-language-server.lsp-feature-evidence",
  schemaVersion: 2,
  features: Object.freeze([
    enabledFeature({
      id: "document-sync",
      requiredCapabilities: [
        capability("positionEncoding", "utf-16"),
        capability("textDocumentSync.openClose", true),
        capability("textDocumentSync.change", 2),
      ],
      protocol: [evidence(
        "tests/lsp-session.test.mjs",
        "sends an applied document edit through didChange before the next request",
        "document-sync.protocol.did-change-before-request",
      )],
      bundle: [
        evidence(
          "tests/lsp-document-lifecycle.test.mjs",
          "advertises open/close incremental document synchronization",
          "document-sync.bundle.sync-capability",
        ),
        evidence(
          "tests/lsp-document-lifecycle.test.mjs",
          "applies ranged incremental changes before serving completion",
          "document-sync.bundle.incremental-change",
        ),
        evidence(
          "tests/lsp-document-lifecycle.test.mjs",
          "does not serve a stale overlay after the document closes",
          "document-sync.bundle.close-clears-overlay",
        ),
      ],
      artifact: [evidence(
        "tests/release/portable-install.acceptance.mjs",
        "installs one verified artifact without source dependencies or a rebuild",
        "document-sync.artifact.immutable-incremental-overlay-lifecycle",
      )],
      artifactGap: null,
    }),
    enabledFeature({
      id: "completion",
      requiredCapabilities: [capability("completionProvider.triggerCharacters", ["."])],
      protocol: [evidence(
        "tests/lsp-reliability.test.mjs",
        "a newer completion request supersedes the previous request in its lane",
        "completion.protocol.latest-wins",
      )],
      bundle: [evidence(
        "tests/lsp-transcript.test.mjs",
        "completes both a field and a method from the opened ArkTS snapshot",
        "completion.bundle.open-member-field-method",
      )],
      artifact: [evidence(
        "tests/release/portable-install.acceptance.mjs",
        "installs one verified artifact without source dependencies or a rebuild",
        "completion.artifact.immutable-semantic-smoke",
      )],
      artifactGap: null,
    }),
    enabledFeature({
      id: "definition",
      requiredCapabilities: [capability("definitionProvider", true)],
      protocol: [evidence(
        "tests/lsp-semantic-request-reliability.test.mjs",
        "maps cancellation for every advertised semantic request to RequestCancelled",
        "definition.protocol.cancellation",
      )],
      bundle: [evidence(
        "tests/semantic/semantic-characterization.test.mjs",
        "returns the exact unopened definition range after an emoji prefix",
        "definition.bundle.unopened-utf16-range",
      )],
      artifact: [evidence(
        "tests/release/portable-install.acceptance.mjs",
        "installs one verified artifact without source dependencies or a rebuild",
        "definition.artifact.immutable-exact-range",
      )],
      artifactGap: null,
    }),
    enabledFeature({
      id: "hover",
      requiredCapabilities: [capability("hoverProvider", true)],
      protocol: [evidence(
        "tests/lsp-semantic-request-reliability.test.mjs",
        "maps cancellation for every advertised semantic request to RequestCancelled",
        "hover.protocol.cancellation",
      )],
      bundle: [evidence(
        "tests/semantic/editor-capabilities.test.mjs",
        "returns documented ArkTS hover information at the exact source range",
        "hover.bundle.documented-exact-range",
      )],
      artifact: [evidence(
        "tests/release/portable-install.acceptance.mjs",
        "installs one verified artifact without source dependencies or a rebuild",
        "hover.artifact.immutable-unopened-import",
      )],
      artifactGap: null,
    }),
    enabledFeature({
      id: "signature-help",
      requiredCapabilities: [
        capability("signatureHelpProvider.triggerCharacters", ["(", ",", "<"]),
        capability("signatureHelpProvider.retriggerCharacters", [")"]),
      ],
      protocol: [evidence(
        "tests/lsp-semantic-request-reliability.test.mjs",
        "maps cancellation for every advertised semantic request to RequestCancelled",
        "signature-help.protocol.cancellation",
      )],
      bundle: [evidence(
        "tests/semantic/editor-capabilities.test.mjs",
        "returns ArkTS signature help with the active parameter",
        "signature-help.bundle.active-parameter",
      )],
      artifact: [evidence(
        "tests/release/portable-install.acceptance.mjs",
        "installs one verified artifact without source dependencies or a rebuild",
        "signature-help.artifact.immutable-unopened-overload",
      )],
      artifactGap: null,
    }),
    enabledFeature({
      id: "document-symbol",
      requiredCapabilities: [capability("documentSymbolProvider", true)],
      protocol: [evidence(
        "tests/lsp-semantic-request-reliability.test.mjs",
        "maps cancellation for every advertised semantic request to RequestCancelled",
        "document-symbol.protocol.cancellation",
      )],
      bundle: [
        evidence(
          "tests/semantic/editor-capabilities.test.mjs",
          "returns hierarchical ArkTS document symbols from the changed overlay",
          "document-symbol.bundle.hierarchical-overlay",
        ),
        evidence(
          "tests/semantic/editor-capabilities.test.mjs",
          "uses legacy symbol kinds in flat results when the client omits valueSet",
          "document-symbol.bundle.flat-legacy-kinds",
        ),
      ],
      artifact: [evidence(
        "tests/release/portable-install.acceptance.mjs",
        "installs one verified artifact without source dependencies or a rebuild",
        "document-symbol.artifact.immutable-arkui-hierarchy",
      )],
      artifactGap: null,
    }),
    enabledFeature({
      id: "workspace-symbol",
      requiredCapabilities: [capability("workspaceSymbolProvider", true)],
      protocol: [evidence(
        "tests/lsp-workspace-symbol.test.mjs",
        "search stays live during catalog work and returns the unsaved overlay without status rows",
        "workspace-symbol.protocol.live-overlay-search",
      )],
      bundle: [evidence(
        "tests/lsp-production-index.test.mjs",
        "production composition exposes cached search and terminal catalog progress",
        "workspace-symbol.bundle.production-catalog",
      )],
      artifact: [evidence(
        "tests/release/portable-install.acceptance.mjs",
        "installs one verified artifact without source dependencies or a rebuild",
        "workspace-symbol.artifact.immutable-index",
      )],
      artifactGap: null,
    }),
    enabledFeature({
      id: "diagnostics",
      protocolEvidenceRequired: false,
      bundle: [
        evidence(
          "tests/lsp-diagnostics.test.mjs",
          "latest document version clears obsolete diagnostics",
          "diagnostics.bundle.latest-version",
        ),
        evidence(
          "tests/semantic/diagnostic-code-characterization.test.mjs",
          "publishes the TypeScript spelling diagnostic code at the exact UTF-16 marker range",
          "diagnostics.bundle.numeric-code-utf16",
        ),
      ],
      artifact: [evidence(
        "tests/release/portable-install.acceptance.mjs",
        "installs one verified artifact without source dependencies or a rebuild",
        "diagnostics.artifact.immutable-versioned",
      )],
      artifactGap: null,
      knownGaps: [],
    }),
    enabledFeature({
      id: "completion-resolve",
      requiredCapabilities: [capability("completionProvider.resolveProvider", true)],
      protocol: [evidence(
        "tests/lsp-reliability.test.mjs",
        "maps completion resolve cancellation to the semantic abort signal",
        "completion-resolve.protocol.cancellation",
      )],
      bundle: [evidence(
        "tests/semantic/semantic-characterization.test.mjs",
        "resolves and applies an unopened class auto-import through the production server",
        "completion-resolve.bundle.auto-import",
      )],
      artifact: [evidence(
        "tests/release/portable-install.acceptance.mjs",
        "installs one verified artifact without source dependencies or a rebuild",
        "completion-resolve.artifact.immutable-auto-import",
      )],
      artifactGap: null,
    }),
    enabledFeature({
      id: "references",
      requiredCapabilities: [capability("referencesProvider", true)],
      protocol: [evidence(
        "tests/lsp-semantic-request-reliability.test.mjs",
        "maps cancellation for every advertised semantic request to RequestCancelled",
        "references.protocol.cancellation",
      )],
      bundle: [evidence(
        "tests/semantic/references-depth.test.mjs",
        "finds unopened barrel references with exact UTF-16 ranges and declaration policy",
        "references.bundle.unopened-barrel-declaration-policy",
      )],
      artifact: [evidence(
        "tests/release/portable-install.acceptance.mjs",
        "installs one verified artifact without source dependencies or a rebuild",
        "references.artifact.immutable-unopened-barrel-declaration-policy",
      )],
      artifactGap: null,
    }),
    plannedFeature(
      "rename",
      "renameProvider",
      "Prepare rename and rename are not enabled.",
    ),
    enabledFeature({
      id: "code-actions",
      requiredCapabilities: [capability("codeActionProvider", {
        codeActionKinds: ["quickfix"],
        resolveProvider: true,
      })],
      protocol: [evidence(
        "tests/lsp-reliability.test.mjs",
        "maps code-action resolve cancellation to RequestCancelled without leaking an edit",
        "code-actions.protocol.resolve-cancellation-no-edit",
      )],
      bundle: [
        evidence(
          "tests/lsp-capability-contract.test.mjs",
          "production initialize advertises exactly the implemented LSP capability contract",
          "code-actions.bundle.advertised-options",
        ),
        evidence(
          "tests/lsp-capability-contract.test.mjs",
          "omits code actions when any client prerequisite is missing",
          "code-actions.bundle.conditional-prerequisites",
        ),
        evidence(
          "tests/semantic/diagnostic-code-characterization.test.mjs",
          "resolves and applies the current spelling fix as one versioned document edit",
          "code-actions.bundle.quickfix-list-resolve-versioned-edit",
        ),
      ],
      artifact: [evidence(
        "tests/release/portable-install.acceptance.mjs",
        "installs one verified artifact without source dependencies or a rebuild",
        "code-actions.artifact.immutable-list-resolve-apply",
      )],
      artifactGap: null,
    }),
  ]),
})

export function validateLspFeatureMatrix({
  root,
  matrix,
  capabilityContract,
  layerManifest,
}) {
  const issues = []
  const layerByEntry = new Map(layerManifest.layers.flatMap((layer) =>
    layer.entries.map((entry) => [entry, layer.id])))
  const requiredContract = new Map(capabilityContract.required.map((entry) => [entry.path, entry]))
  const absentContract = new Set(capabilityContract.absent)
  const coveredRequired = new Map()
  const coveredAbsent = new Map()
  const featureIds = new Set()
  const nodeTestNamesByEntry = new Map()
  const evidenceClaims = new Set()

  for (const feature of matrix.features) {
    if (featureIds.has(feature.id)) issues.push(`${feature.id}: duplicate feature id`)
    featureIds.add(feature.id)

    if (feature.state === "enabled") {
      if (feature.evidence.bundle.length === 0) {
        issues.push(`${feature.id}: enabled feature requires bundle-e2e evidence`)
      }
      if (feature.protocolEvidenceRequired && feature.evidence.protocol.length === 0) {
        issues.push(`${feature.id}: enabled feature requires protocol evidence`)
      }
      if (feature.absentCapabilities.length > 0) {
        issues.push(`${feature.id}: enabled feature cannot cover absent capabilities`)
      }
    } else if (feature.state === "planned") {
      if (feature.requiredCapabilities.length > 0) {
        issues.push(`${feature.id}: planned feature cannot cover required capabilities`)
      }
    } else {
      issues.push(`${feature.id}: unsupported feature state ${JSON.stringify(feature.state)}`)
    }

    for (const current of feature.requiredCapabilities) {
      const contractEntry = requiredContract.get(current.path)
      if (!contractEntry || !isDeepStrictEqual(contractEntry.expected, current.expected)) {
        issues.push(`${feature.id}: required capability ${current.path} does not match the capability contract`)
      }
      appendCoverage(coveredRequired, current.path, feature.id)
    }
    for (const capabilityPath of feature.absentCapabilities) {
      if (!absentContract.has(capabilityPath)) {
        issues.push(`${feature.id}: absent capability ${capabilityPath} is not absent in the capability contract`)
      }
      appendCoverage(coveredAbsent, capabilityPath, feature.id)
    }

    validateEvidence(
      root,
      layerByEntry,
      nodeTestNamesByEntry,
      evidenceClaims,
      feature,
      "protocol",
      "protocol",
      issues,
    )
    validateEvidence(
      root,
      layerByEntry,
      nodeTestNamesByEntry,
      evidenceClaims,
      feature,
      "bundle",
      "bundle-e2e",
      issues,
    )
    validateEvidence(
      root,
      layerByEntry,
      nodeTestNamesByEntry,
      evidenceClaims,
      feature,
      "artifact",
      "artifact-e2e",
      issues,
    )
    if (!Object.hasOwn(feature, "artifactGap")) {
      issues.push(`${feature.id}: artifactGap must be explicit`)
    } else if (feature.evidence.artifact.length === 0
      && (typeof feature.artifactGap !== "string" || feature.artifactGap.trim().length === 0)) {
      issues.push(`${feature.id}: missing artifact evidence requires artifactGap`)
    }
  }

  validateCoverage("required", requiredContract.keys(), coveredRequired, issues)
  validateCoverage("absent", absentContract.keys(), coveredAbsent, issues)
  if (issues.length > 0) {
    throw new Error(["Invalid LSP feature evidence matrix:", ...issues.map((issue) => `- ${issue}`)].join("\n"))
  }

  return {
    enabledFeatureIds: matrix.features.filter(({ state }) => state === "enabled").map(({ id }) => id),
    plannedFeatureIds: matrix.features.filter(({ state }) => state === "planned").map(({ id }) => id),
    requiredCapabilityCount: requiredContract.size,
    absentCapabilityCount: absentContract.size,
    artifactCoveredFeatureIds: matrix.features
      .filter(({ evidence }) => evidence.artifact.length > 0)
      .map(({ id }) => id),
    artifactGapFeatureIds: matrix.features
      .filter(({ evidence }) => evidence.artifact.length === 0)
      .map(({ id }) => id),
  }
}

function validateEvidence(
  root,
  layerByEntry,
  nodeTestNamesByEntry,
  evidenceClaims,
  feature,
  evidenceKind,
  expectedLayer,
  issues,
) {
  for (const reference of feature.evidence[evidenceKind]) {
    if (!isNamedEvidence(reference)) {
      issues.push(
        `${feature.id}: ${evidenceKind} evidence must name entry, node:test, and stable claim`,
      )
      continue
    }
    if (!isStableClaim(reference.claim, feature.id, evidenceKind)) {
      issues.push(
        `${feature.id}: ${evidenceKind} evidence claim must match ${feature.id}.${evidenceKind}.<stable-slug>`,
      )
    }
    if (evidenceClaims.has(reference.claim)) {
      issues.push(`${feature.id}: duplicate evidence claim ${reference.claim}`)
    } else {
      evidenceClaims.add(reference.claim)
    }
    const { entry } = reference
    if (!isSafeEvidenceEntry(entry)) {
      issues.push(
        `${feature.id}: ${evidenceKind} evidence entry must be a normalized repository-relative path: ${entry}`,
      )
      continue
    }
    const absolutePath = path.resolve(root, ...entry.split("/"))
    if (!fs.existsSync(absolutePath)) {
      issues.push(`${feature.id}: ${evidenceKind} evidence does not exist: ${entry}`)
    } else {
      let testNameCounts = nodeTestNamesByEntry.get(entry)
      if (!testNameCounts) {
        testNameCounts = collectNodeTestNameCounts(absolutePath)
        nodeTestNamesByEntry.set(entry, testNameCounts)
      }
      const matchingTestCount = testNameCounts.get(reference.test) ?? 0
      if (matchingTestCount === 0) {
        issues.push(
          `${feature.id}: ${entry} has no exact node:test named ${JSON.stringify(reference.test)}`,
        )
      } else if (matchingTestCount !== 1) {
        issues.push(
          `${feature.id}: ${entry} has ${matchingTestCount} node:tests named ${JSON.stringify(reference.test)}; expected exactly one`,
        )
      }
    }
    const actualLayer = layerByEntry.get(entry)
    if (actualLayer !== expectedLayer) {
      issues.push(
        `${feature.id}: ${entry} is ${actualLayer ?? "unclassified"}, expected ${expectedLayer}`,
      )
    }
  }
}

function collectNodeTestNameCounts(absolutePath) {
  const sourceFile = ts.createSourceFile(
    absolutePath,
    fs.readFileSync(absolutePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  )
  const testBindings = new Set()
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== "node:test") continue
    const importClause = statement.importClause
    if (importClause?.name) testBindings.add(importClause.name.text)
    if (importClause?.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
      for (const element of importClause.namedBindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text
        if (importedName === "test" || importedName === "it") {
          testBindings.add(element.name.text)
        }
      }
    }
  }

  const counts = new Map()
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement)
      || !ts.isCallExpression(statement.expression)
      || !ts.isIdentifier(statement.expression.expression)
      || !testBindings.has(statement.expression.expression.text)) continue
    const [name] = statement.expression.arguments
    if (!name || !ts.isStringLiteralLike(name)) continue
    counts.set(name.text, (counts.get(name.text) ?? 0) + 1)
  }
  return counts
}

function validateCoverage(kind, contractPaths, coverage, issues) {
  for (const capabilityPath of contractPaths) {
    const featureIds = coverage.get(capabilityPath) ?? []
    if (featureIds.length !== 1) {
      issues.push(
        `${capabilityPath}: ${kind} capability must be covered once; covered by ${featureIds.join(", ") || "none"}`,
      )
    }
  }
}

function appendCoverage(coverage, capabilityPath, featureId) {
  const featureIds = coverage.get(capabilityPath) ?? []
  featureIds.push(featureId)
  coverage.set(capabilityPath, featureIds)
}

function capability(path, expected) {
  return { path, expected }
}

function evidence(entry, test, claim) {
  return { entry, test, claim }
}

function isNamedEvidence(reference) {
  return reference !== null
    && typeof reference === "object"
    && isDeepStrictEqual(Object.keys(reference).sort(), ["claim", "entry", "test"])
    && typeof reference.entry === "string"
    && reference.entry.trim().length > 0
    && typeof reference.test === "string"
    && reference.test.trim().length > 0
    && typeof reference.claim === "string"
    && reference.claim.trim().length > 0
}

function isStableClaim(claim, featureId, evidenceKind) {
  const prefix = `${featureId}.${evidenceKind}.`
  return claim.startsWith(prefix)
    && /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(
      claim.slice(prefix.length),
    )
}

function isSafeEvidenceEntry(entry) {
  return !entry.includes("\\")
    && !path.posix.isAbsolute(entry)
    && !/^[A-Za-z]:\//.test(entry)
    && path.posix.normalize(entry) === entry
    && !entry.split("/").includes("..")
}

function enabledFeature({
  id,
  requiredCapabilities = [],
  protocolEvidenceRequired = true,
  protocol = [],
  bundle,
  artifact = [],
  artifactGap,
  knownGaps = [],
}) {
  return {
    id,
    state: "enabled",
    requiredCapabilities,
    absentCapabilities: [],
    protocolEvidenceRequired,
    evidence: { protocol, bundle, artifact },
    artifactGap,
    knownGaps,
  }
}

function plannedFeature(id, absentCapability, artifactGap) {
  return {
    id,
    state: "planned",
    requiredCapabilities: [],
    absentCapabilities: [absentCapability],
    protocolEvidenceRequired: false,
    evidence: { protocol: [], bundle: [], artifact: [] },
    artifactGap,
    knownGaps: [],
  }
}
