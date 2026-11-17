import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { buildSync } from "esbuild"
import { projectRoot } from "./lsp-process.mjs"

export function callEdgesWithTotalRanges(total) {
  return Array.from({ length: 256 }, (_, edgeIndex) => {
    const count = edgeIndex === 255 ? total - (255 * 8) : 8
    return {
      to: callHierarchyResultItem({
        uri: `file:///workspace/TotalTarget${edgeIndex}.ets`,
        name: `totalTarget${edgeIndex}`,
      }),
      fromRanges: Array.from({ length: count }, (_, rangeIndex) => ({
        start: { line: edgeIndex * 10 + rangeIndex, character: 0 },
        end: { line: edgeIndex * 10 + rangeIndex, character: 1 },
      })),
    }
  })
}

export function callHierarchyInputItem(overrides = {}) {
  return {
    uri: "file:///workspace/Main.ets",
    name: "build",
    kind: "method",
    detail: "Main.build",
    range: {
      start: { line: 3, character: 2 },
      end: { line: 8, character: 3 },
    },
    selectionRange: {
      start: { line: 3, character: 2 },
      end: { line: 3, character: 7 },
    },
    ...overrides,
  }
}

export function callHierarchyResultItem(overrides = {}) {
  return callHierarchyInputItem({
    sourceFingerprint: "1".repeat(64),
    ...overrides,
  })
}

export function requestEnvelope(protocol, overrides = {}) {
  return {
    protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 1,
    id: 1,
    requiredRevision: 1,
    method: "prepareCallHierarchy",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
    cancelCell: protocol.createSemanticWorkerCancellationCell(),
    ...overrides,
  }
}

export function successEnvelope(protocol, value, overrides = {}) {
  return {
    protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 1,
    id: 1,
    appliedRevision: 1,
    documentVersion: 1,
    ok: true,
    value,
    ...overrides,
  }
}

export function buildDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-worker-call-hierarchy-"))
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  const outfile = path.join(outputRoot, "semantic-worker-protocol.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "semantic", "worker-protocol.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
  })
  return createRequire(import.meta.url)(outfile)
}
