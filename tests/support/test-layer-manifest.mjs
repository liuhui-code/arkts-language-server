import fs from "node:fs"
import path from "node:path"

export const TEST_LAYER_MANIFEST = Object.freeze({
  schema: "arkts-language-server.test-layers",
  schemaVersion: 1,
  layers: Object.freeze([
    layer("unit-contract", true, [
      "tests/arkts-document-formatter.test.mjs",
      "tests/artifact-manifest.test.mjs",
      "tests/build-test-server.test.mjs",
      "tests/code-action-resolution-store.test.mjs",
      "tests/conformance-corpus.test.mjs",
      "tests/folding-range-provider.test.mjs",
      "tests/index-adapter.test.mjs",
      "tests/index-catalog-adapter.test.mjs",
      "tests/local-delivery-config.test.mjs",
      "tests/logging.test.mjs",
      "tests/lsp-feature-matrix.test.mjs",
      "tests/lsp-edits.test.mjs",
      "tests/portable-artifact-builder.test.mjs",
      "tests/project-file-set-cache.test.mjs",
      "tests/project-resolver.test.mjs",
      "tests/resource-sampler.test.mjs",
      "tests/sdk-discovery.test.mjs",
      "tests/test-evidence.test.mjs",
      "tests/test-layer-manifest.test.mjs",
      "tests/test-layer-runner.test.mjs",
      "tests/workspace-file-change-coordinator.test.mjs",
      "tests/workspace-symbol-service.test.mjs",
      "tests/zed-adapter.test.mjs",
      "tests/zed-query-gate.test.mjs",
      "tests/semantic/document-highlight-core.test.mjs",
    ]),
    layer("protocol", true, [
      "tests/lsp-process.test.mjs",
      "tests/lsp-reliability.test.mjs",
      "tests/lsp-semantic-request-reliability.test.mjs",
      "tests/lsp-session.test.mjs",
      "tests/lsp-workspace-global-freshness.test.mjs",
      "tests/lsp-workspace-symbol.test.mjs",
    ]),
    layer("bundle-e2e", true, [
      "tests/conformance-scenario.test.mjs",
      "tests/lsp-capability-contract.test.mjs",
      "tests/lsp-diagnostics.test.mjs",
      "tests/lsp-document-lifecycle.test.mjs",
      "tests/lsp-production-index.test.mjs",
      "tests/lsp-transcript.test.mjs",
      "tests/lsp-workspace-file-changes.test.mjs",
      "tests/semantic/arkui-builder-tail.test.mjs",
      "tests/semantic/arkui-diagnostics-depth.test.mjs",
      "tests/semantic/arkui-language-features.test.mjs",
      "tests/semantic/arkui-resource-watch-diagnostics.test.mjs",
      "tests/semantic/arkui-sdk-symbols.test.mjs",
      "tests/semantic/diagnostic-code-characterization.test.mjs",
      "tests/semantic/document-formatting.test.mjs",
      "tests/semantic/document-highlight-depth.test.mjs",
      "tests/semantic/document-symbol-depth.test.mjs",
      "tests/semantic/editor-capabilities.test.mjs",
      "tests/semantic/folding-range.test.mjs",
      "tests/semantic/project-membership-language-service.test.mjs",
      "tests/semantic/references-completeness.test.mjs",
      "tests/semantic/references-depth.test.mjs",
      "tests/semantic/rename-depth.test.mjs",
      "tests/semantic/rename-completeness.test.mjs",
      "tests/semantic/semantic-characterization.test.mjs",
      "tests/semantic/workspace-symbol-production.test.mjs",
      "tests/version-identity.test.mjs",
    ]),
    layer("artifact-e2e", false, [
      "tests/release/index-sidecar.acceptance.mjs",
      "tests/release/local-delivery.acceptance.mjs",
      "tests/release/portable-install.acceptance.mjs",
    ]),
    layer("large", false, [
      "tests/release/large-workspace.acceptance.mjs",
    ]),
  ]),
})

export function validateTestLayerManifest({ root, manifest }) {
  const discovered = discoverTestEntries(root)
  const discoveredSet = new Set(discovered)
  const assignedLayers = new Map()
  const issues = []
  const layerCounts = {}

  for (const currentLayer of manifest.layers) {
    layerCounts[currentLayer.id] = currentLayer.entries.length
    for (const entry of currentLayer.entries) {
      const absolutePath = path.resolve(root, ...entry.split("/"))
      const previousLayer = assignedLayers.get(entry)
      if (previousLayer) {
        issues.push(`${entry}: assigned to both ${previousLayer} and ${currentLayer.id}`)
      } else {
        assignedLayers.set(entry, currentLayer.id)
      }

      if (!fs.existsSync(absolutePath)) {
        issues.push(`${entry}: manifest path does not exist`)
      } else if (!discoveredSet.has(entry)) {
        issues.push(`${entry}: manifest path is not an executable test entry`)
      } else if (currentLayer.fast) {
        for (const skip of explicitNodeTestSkips(absolutePath)) {
          issues.push(
            `${entry}:${skip.line}: fast layer ${currentLayer.id} contains ${skip.syntax}`,
          )
        }
      }

      if (currentLayer.fast && isReleaseAcceptance(entry)) {
        issues.push(`${entry}: release acceptance must not be in fast layer ${currentLayer.id}`)
      }
    }
  }

  for (const entry of discovered) {
    if (!assignedLayers.has(entry)) issues.push(`${entry}: discovered test has no layer`)
  }

  if (issues.length > 0) {
    throw new Error(["Invalid test layer manifest:", ...issues.map((issue) => `- ${issue}`)].join("\n"))
  }

  return {
    entryCount: discovered.length,
    assignments: Object.fromEntries([...assignedLayers].sort(([left], [right]) => (
      ordinalCompare(left, right)
    ))),
    layerCounts,
  }
}

function explicitNodeTestSkips(absolutePath) {
  return fs.readFileSync(absolutePath, "utf8")
    .split(/\r?\n/)
    .flatMap((sourceLine, index) => {
      if (/^\s*t\.skip\s*\(/.test(sourceLine)) {
        return [{ line: index + 1, syntax: "t.skip(...)" }]
      }
      const directSkip = /^\s*(test|it|describe|suite)\.skip\s*\(/.exec(sourceLine)
      return directSkip
        ? [{ line: index + 1, syntax: `${directSkip[1]}.skip(...)` }]
        : []
    })
}

function discoverTestEntries(root) {
  const testsRoot = path.join(root, "tests")
  const discovered = []
  walk(testsRoot, (absolutePath) => {
    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/")
    if (relativePath.endsWith(".test.mjs") || isReleaseAcceptance(relativePath)) {
      discovered.push(relativePath)
    }
  })
  return discovered.sort(ordinalCompare)
}

function walk(directory, visitFile) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(entryPath, visitFile)
    else if (entry.isFile()) visitFile(entryPath)
  }
}

function isReleaseAcceptance(entry) {
  return /^tests\/release\/[^/]+\.acceptance\.mjs$/.test(entry)
}

function layer(id, fast, entries) {
  return Object.freeze({ id, fast, entries: Object.freeze(entries) })
}

function ordinalCompare(left, right) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
