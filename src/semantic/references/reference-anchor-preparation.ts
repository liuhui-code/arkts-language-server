import type { ProjectResolverPort } from "../../contracts/project-resolver.js"
import { hasLocalBindingHint } from "./reference-lexical-probe.js"
import { toLegacyPosition } from "../interactive-workspace.js"
import { withRequestInputValidation, withSynchronousInputPreparation, withPreparationInputValidation } from "../../project/request-input-validation.js"
import { SemanticInputUnavailableError } from "../../core/types/typescript-query-inputs.js"
import { fileURLToPath, pathToFileURL } from "node:url"

import type { DocumentSnapshot } from "../../contracts/document.js"
import type { SemanticDefinition, SemanticQuery, SemanticReferencesQuery, VersionedSemanticResult } from "../../contracts/semantic-engine.js"
import type { SemanticDocumentPosition } from "../../core/protocol.js"
import type { SemanticTypeEngineRegistry } from "../../core/types/type-engine.js"
import type { SemanticDocumentStore, SemanticPrepareObserver, SemanticWorkspaceView } from "../../core/workspace/document-store.js"
import type { StructuredLogger } from "../../observability/logger.js"
import type { SemanticWorkerReferencesArgs } from "../worker-protocol.js"
import { toFilePath } from "../semantic-worker-file-identity.js"
import { publicReferenceResult } from "./reference-result-mapping.js"
import { prepareCompleteProjectWorkspace } from "../workspace-membership-admission.js"

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
  const workspace = prepareCompleteProjectWorkspace(documents, () => document?.source?.kind === "disk"
    ? documents.prepareDiskSnapshot(position, document.text, true)
    : documents.prepare(position, true, observer))
  try {
    trace?.info("references.search.document-prepare.complete", {
      durationMs: performance.now() - started,
      preparedDocuments: workspace.documents.length,
    })
  } catch { /* Tracing must not change references. */ }
  return workspace
}

/** Preparation facts belong to the actual leased resident query. No promise or
 * asynchronous verifier is started inside this synchronous handoff. */
export function runResidentReferenceQuery(query: SemanticReferencesQuery,
  position: SemanticDocumentPosition, rootPath: string, documents: SemanticDocumentStore,
  engines: SemanticTypeEngineRegistry, synchronize: boolean, trace?: StructuredLogger, qualification?: SemanticWorkerReferencesArgs["qualifiedOnly"]) {
  return withSynchronousInputPreparation(() => {
    const prepare = () => prepareReferenceSearchWorkspace(position, documents, trace, query.document)
    // One admission job: honor the existing warm-owner policy before trying a
    // projected group. A null result must not cause a second retained RPC.
    let result = qualification === "retained-first"
      ? engines.retainedReferences(rootPath, prepare, position, query.includeDeclaration) : undefined
    if (!result && qualification && hasLocalBindingHint(position, query.document.text))
      result = engines.lexicalReferences(prepare(), position, query.includeDeclaration)
    if (!qualification) result = synchronize
      ? engines.retainedReferences(rootPath, prepare, position, query.includeDeclaration)
      : engines.residentReferences(prepare(), position, query.includeDeclaration)
    return result ? publicReferenceResult(query.document.version, result)
      : { documentVersion: query.document.version, value: null }
  })
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
  // No asynchronous verifier may start until the original preparation's final union succeeds.
  const dispatch = withSynchronousInputPreparation(() => {
    const workspace = withPreparationInputValidation(() => {
      const captured = prepareReferenceSearchWorkspace(position, documents, trace, query.document)
      if (engines.needsReadinessRootRefresh(captured)) engines.semanticReadiness(captured, "query")
      return captured
    }, () => { throw new SemanticInputUnavailableError() })
    return withRequestInputValidation(() => engines.prepareReferenceQuery(workspace,
      position, query.includeDeclaration, paths(candidates.candidateUris), candidates.candidateIdentityComplete === true,
      candidates.candidateAnchorUri ? toFilePath(candidates.candidateAnchorUri) : undefined,
      paths(candidates.candidateSupportUris), candidates.forceLegacy === true),
    () => { throw new SemanticInputUnavailableError() })
  })
  const result = await dispatch()
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
  const workspace = prepareCompleteProjectWorkspace(documents, () => document?.source?.kind === "disk"
    ? documents.prepareDiskSnapshot(position, document.text, true) : documents.prepare(position, true))
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

/** References and anchors share the same workspace/position identity conversion. */
export function referenceQueryPosition(query: SemanticQuery,
  projects: ProjectResolverPort) {
  const workspace = projects.projectFor(query.document.uri)
  return { position: toLegacyPosition(query.document, query.position, workspace), rootPath: fileURLToPath(workspace.rootUri) }
}
