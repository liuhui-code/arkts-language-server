import { pathToFileURL } from "node:url"

import type { DocumentSnapshot } from "../../contracts/document.js"
import type { SemanticDefinition, SemanticReferencesQuery, VersionedSemanticResult } from "../../contracts/semantic-engine.js"
import type { SemanticDocumentPosition } from "../../core/protocol.js"
import type { SemanticTypeEngineRegistry } from "../../core/types/type-engine.js"
import type { SemanticDocumentStore, SemanticPrepareObserver, SemanticWorkspaceView } from "../../core/workspace/document-store.js"
import type { StructuredLogger } from "../../observability/logger.js"
import type { SemanticWorkerReferencesArgs } from "../worker-protocol.js"
import { toFilePath } from "../semantic-worker-file-identity.js"
import { publicReferenceResult } from "./reference-result-mapping.js"

export function prepareReferenceSearchWorkspace(
  position: SemanticDocumentPosition,
  documents: SemanticDocumentStore,
  trace?: StructuredLogger,
  document?: DocumentSnapshot,
): SemanticWorkspaceView {
  const started = performance.now()
  const observer: SemanticPrepareObserver | undefined = trace
    ? (phase, durationMs, details) => trace.info("references.search.document-prepare.phase", {
      phase, durationMs, ...details,
    }) : undefined
  const workspace = document?.source?.kind === "disk"
    ? documents.prepareDiskSnapshot(position, document.text, true)
    : documents.prepare(position, true, observer)
  try {
    trace?.info("references.search.document-prepare.complete", {
      durationMs: performance.now() - started,
      preparedDocuments: workspace.documents.length,
    })
  } catch { /* Tracing must not change references. */ }
  return workspace
}

/** Bridge the current source and candidate transport to the existing reference owner. */
export async function runOwnerReferenceQuery(query: SemanticReferencesQuery,
  position: SemanticDocumentPosition, documents: SemanticDocumentStore,
  engines: SemanticTypeEngineRegistry, candidates: Omit<SemanticWorkerReferencesArgs, "position" | "includeDeclaration">,
  trace?: StructuredLogger) {
  const paths = (uris: readonly string[] | undefined) => uris?.flatMap(uri => {
    const filePath = toFilePath(uri)
    return filePath ? [filePath] : []
  })
  const workspace = prepareReferenceSearchWorkspace(position, documents, trace, query.document)
  engines.semanticReadiness(workspace, "query")
  const result = await engines.references(workspace,
    position, query.includeDeclaration, paths(candidates.candidateUris), candidates.candidateIdentityComplete === true,
    candidates.candidateAnchorUri ? toFilePath(candidates.candidateAnchorUri) : undefined,
    paths(candidates.candidateSupportUris), candidates.forceLegacy === true)
  return publicReferenceResult(query.document.version, result)
}

/** Preserve complete membership preparation while measuring its own wall time. */
export async function prepareReferenceAnchor(
  position: SemanticDocumentPosition,
  documentVersion: number,
  documents: SemanticDocumentStore,
  engines: SemanticTypeEngineRegistry,
  trace?: StructuredLogger,
  document?: DocumentSnapshot,
): Promise<VersionedSemanticResult<SemanticDefinition[]>> {
  const prepareStarted = performance.now()
  const workspace = document?.source?.kind === "disk"
    ? documents.prepareDiskSnapshot(position, document.text, true) : documents.prepare(position, true)
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
