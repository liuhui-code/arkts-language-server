import fs from "node:fs"
import { isDeepStrictEqual } from "node:util"
import path from "node:path"

export const CURRENT_LSP_FEATURE_MATRIX = Object.freeze({
  schema: "arkts-language-server.lsp-feature-evidence",
  schemaVersion: 1,
  features: Object.freeze([
    enabledFeature({
      id: "document-sync",
      requiredCapabilities: [
        capability("positionEncoding", "utf-16"),
        capability("textDocumentSync.openClose", true),
        capability("textDocumentSync.change", 2),
      ],
      protocol: ["tests/lsp-session.test.mjs"],
      bundle: ["tests/lsp-document-lifecycle.test.mjs"],
      artifactGap: "No installed transcript applies open/change/close yet.",
    }),
    enabledFeature({
      id: "completion",
      requiredCapabilities: [capability("completionProvider.triggerCharacters", ["."])],
      protocol: ["tests/lsp-reliability.test.mjs"],
      bundle: ["tests/lsp-transcript.test.mjs"],
      artifact: ["tests/release/local-delivery.acceptance.mjs"],
      artifactGap: null,
    }),
    enabledFeature({
      id: "definition",
      requiredCapabilities: [capability("definitionProvider", true)],
      protocol: ["tests/lsp-semantic-request-reliability.test.mjs"],
      bundle: ["tests/semantic/semantic-characterization.test.mjs"],
      artifact: ["tests/release/local-delivery.acceptance.mjs"],
      artifactGap: null,
    }),
    enabledFeature({
      id: "hover",
      requiredCapabilities: [capability("hoverProvider", true)],
      protocol: ["tests/lsp-semantic-request-reliability.test.mjs"],
      bundle: ["tests/semantic/editor-capabilities.test.mjs"],
      artifactGap: "Installed artifacts do not run a hover transcript yet.",
    }),
    enabledFeature({
      id: "signature-help",
      requiredCapabilities: [capability("signatureHelpProvider.triggerCharacters", ["(", ","])],
      protocol: ["tests/lsp-semantic-request-reliability.test.mjs"],
      bundle: ["tests/semantic/editor-capabilities.test.mjs"],
      artifactGap: "Installed artifacts do not run a signature-help transcript yet.",
    }),
    enabledFeature({
      id: "document-symbol",
      requiredCapabilities: [capability("documentSymbolProvider", true)],
      protocol: ["tests/lsp-semantic-request-reliability.test.mjs"],
      bundle: ["tests/semantic/editor-capabilities.test.mjs"],
      artifactGap: "Installed artifacts do not run a document-symbol transcript yet.",
    }),
    enabledFeature({
      id: "workspace-symbol",
      requiredCapabilities: [capability("workspaceSymbolProvider", true)],
      protocol: ["tests/lsp-workspace-symbol.test.mjs"],
      bundle: ["tests/lsp-production-index.test.mjs"],
      artifact: ["tests/release/local-delivery.acceptance.mjs"],
      artifactGap: null,
    }),
    enabledFeature({
      id: "diagnostics",
      protocolEvidenceRequired: false,
      bundle: ["tests/lsp-diagnostics.test.mjs"],
      artifact: ["tests/release/local-delivery.acceptance.mjs"],
      artifactGap: null,
      knownGaps: ["Published diagnostics do not expose a stable code yet."],
    }),
    enabledFeature({
      id: "completion-resolve",
      requiredCapabilities: [capability("completionProvider.resolveProvider", true)],
      protocol: ["tests/lsp-reliability.test.mjs"],
      bundle: ["tests/semantic/semantic-characterization.test.mjs"],
      artifactGap: "Installed artifacts do not run completion resolve and auto-import yet.",
    }),
    plannedFeature(
      "references",
      "referencesProvider",
      "References are not enabled.",
    ),
    plannedFeature(
      "rename",
      "renameProvider",
      "Prepare rename and rename are not enabled.",
    ),
    plannedFeature(
      "code-actions",
      "codeActionProvider",
      "Code actions are not enabled.",
    ),
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

    validateEvidence(root, layerByEntry, feature, "protocol", "protocol", issues)
    validateEvidence(root, layerByEntry, feature, "bundle", "bundle-e2e", issues)
    validateEvidence(root, layerByEntry, feature, "artifact", "artifact-e2e", issues)
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

function validateEvidence(root, layerByEntry, feature, evidenceKind, expectedLayer, issues) {
  for (const entry of feature.evidence[evidenceKind]) {
    const absolutePath = path.resolve(root, ...entry.split("/"))
    if (!fs.existsSync(absolutePath)) {
      issues.push(`${feature.id}: ${evidenceKind} evidence does not exist: ${entry}`)
    }
    const actualLayer = layerByEntry.get(entry)
    if (actualLayer !== expectedLayer) {
      issues.push(
        `${feature.id}: ${entry} is ${actualLayer ?? "unclassified"}, expected ${expectedLayer}`,
      )
    }
  }
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
