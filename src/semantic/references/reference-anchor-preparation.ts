import { pathToFileURL } from "node:url"

import type { SemanticDefinition, VersionedSemanticResult } from "../../contracts/semantic-engine.js"
import type { SemanticDocumentPosition } from "../../core/protocol.js"
import type { SemanticTypeEngineRegistry } from "../../core/types/type-engine.js"
import type { SemanticDocumentStore, SemanticPrepareObserver, SemanticWorkspaceView } from "../../core/workspace/document-store.js"
import type { StructuredLogger } from "../../observability/logger.js"

export function prepareReferenceSearchWorkspace(
  position: SemanticDocumentPosition,
  documents: SemanticDocumentStore,
  trace?: StructuredLogger,
): SemanticWorkspaceView {
  const started = performance.now()
  const observer: SemanticPrepareObserver | undefined = trace
    ? (phase, durationMs, details) => trace.info("references.search.document-prepare.phase", {
      phase, durationMs, ...details,
    }) : undefined
  const workspace = documents.prepare(position, true, observer)
  try {
    trace?.info("references.search.document-prepare.complete", {
      durationMs: performance.now() - started,
      preparedDocuments: workspace.documents.length,
    })
  } catch { /* Tracing must not change references. */ }
  return workspace
}

/** Preserve complete membership preparation while measuring its own wall time. */
export async function prepareReferenceAnchor(
  position: SemanticDocumentPosition,
  documentVersion: number,
  documents: SemanticDocumentStore,
  engines: SemanticTypeEngineRegistry,
  trace?: StructuredLogger,
): Promise<VersionedSemanticResult<SemanticDefinition[]>> {
  const prepareStarted = performance.now()
  const workspace = documents.prepare(position, true)
  trace?.info("references.anchor.document-prepare.complete", {
    durationMs: performance.now() - prepareStarted,
    preparedDocuments: workspace.documents.length,
  })
  const resolveStarted = performance.now()
  const definitions = await engines.referenceAnchor(workspace, position)
  trace?.info("references.anchor.resolve.complete", {
    durationMs: performance.now() - resolveStarted,
    definitions: definitions.length,
  })
  return {
    documentVersion,
    value: definitions.map(target => ({
      uri: pathToFileURL(target.path).href,
      range: {
        start: { line: target.range.startLine - 1, character: target.range.startColumn - 1 },
        end: { line: target.range.endLine - 1, character: target.range.endColumn - 1 },
      },
    })),
  }
}
