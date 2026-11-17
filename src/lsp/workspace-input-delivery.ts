import type { SemanticEnginePort, SemanticWorkspaceFileChangeBatch } from "../contracts/semantic-engine.js"
import type { WorkspaceSymbolServicePort } from "../contracts/workspace-symbol-service.js"

/** Revoke Native input proof before semantic dirty-baseline reads start. Legacy
 * catalogs do not observe, so their original capture-before-start order remains.
 */
export function deliverWorkspaceFileInputs(semantic: SemanticEnginePort,
  symbols: WorkspaceSymbolServicePort | undefined, batches: readonly SemanticWorkspaceFileChangeBatch[]): void {
  symbols?.observeWorkspaceFiles?.(batches)
  const semanticBatches = batches.filter(batch => batch.rootDirty || batch.configurationChanged
    || batch.resourceDirty || batch.resourceChanged || batch.changes.length > 0)
  if (semanticBatches.length > 0) semantic.workspaceFilesChanged?.(semanticBatches)
}
