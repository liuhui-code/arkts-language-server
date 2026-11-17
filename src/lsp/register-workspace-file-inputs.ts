import { fileURLToPath } from "node:url"
import type { Connection, TextDocuments } from "vscode-languageserver/node.js"
import type { TextDocument } from "vscode-languageserver-textdocument"
import type { ProjectResolverPort } from "../contracts/project-resolver.js"
import type { SemanticEnginePort } from "../contracts/semantic-engine.js"
import type { WorkspaceSymbolServicePort } from "../contracts/workspace-symbol-service.js"
import type { StructuredLogger } from "../observability/logger.js"
import type { DocumentDiagnostics } from "./document-diagnostics.js"
import type { RequestFreshness } from "./request-freshness.js"
import type { WorkspaceFileChangeCoordinator, WorkspaceFileEvent } from "./workspace-file-change-coordinator.js"
import { deliverWorkspaceFileInputs } from "./workspace-input-delivery.js"

interface Dependencies {
  connection: Connection
  documents: TextDocuments<TextDocument>
  projects: ProjectResolverPort
  semantic: SemanticEnginePort
  workspaceSymbols?: WorkspaceSymbolServicePort
  freshness: RequestFreshness
  diagnostics: DocumentDiagnostics
  logger: StructuredLogger
  coordinator(): WorkspaceFileChangeCoordinator
}

/** Save and watcher notifications invalidate disk proofs through the same path.
 * TextDocuments owns save delivery; payload text is never an index input.
 */
export function registerWorkspaceFileInputs({ connection, documents, projects, semantic,
  workspaceSymbols, freshness, diagnostics, logger, coordinator }: Dependencies): void {
  const accept = (changes: readonly WorkspaceFileEvent[]) => {
    const workspaceFileChanges = coordinator()
    workspaceFileChanges.accept(changes)
    const batches = workspaceFileChanges.drain()
    if (batches.length > 0) {
      for (const batch of batches) {
        freshness.cancelWorkspace(projects.projectFor(batch.rootUri).id)
      }
      deliverWorkspaceFileInputs(semantic, workspaceSymbols, batches)
      const resourceWorkspaceIds = new Set(
        batches
          .filter((batch) => batch.resourceChanged)
          .map((batch) => projects.projectFor(batch.rootUri).id),
      )
      const dirtyWorkspaceIds = new Set(
        batches.filter((batch) => batch.rootDirty || batch.catalogRulesChanged
          || batch.changes.some(change => /\.(?:ets|ts)$/i.test(fileURLToPath(change.uri)))).map((batch) => projects.projectFor(batch.rootUri).id),
      )
      const catalogWorkspaceIds = new Set(dirtyWorkspaceIds)
      for (const batch of batches) if (batch.catalogRulesChanged) {
        catalogWorkspaceIds.add(projects.projectFor(batch.rootUri).id)
      }
      if (catalogWorkspaceIds.size > 0) workspaceSymbols?.workspaceFilesChanged([...catalogWorkspaceIds])
      for (const workspaceId of dirtyWorkspaceIds) diagnostics.refreshWorkspace(workspaceId)
      if (resourceWorkspaceIds.size > 0) {
        let scheduledDocuments = 0
        for (const document of documents.all()) {
          const workspaceId = projects.projectFor(document.uri).id
          if (
            !dirtyWorkspaceIds.has(workspaceId)
            && document.getText().includes("$r") && resourceWorkspaceIds.has(workspaceId)
          ) {
            scheduledDocuments += 1
            diagnostics.update(document)
          }
        }
        logger.info("diagnostics.resource.refresh.scheduled", {
          workspaceCount: resourceWorkspaceIds.size,
          documentCount: scheduledDocuments,
        })
      }
    }
  }
  connection.onDidChangeWatchedFiles(({ changes }) => accept(changes))
  documents.onDidSave(({ document }) => accept([{ uri: document.uri, type: 2 }]))
}
