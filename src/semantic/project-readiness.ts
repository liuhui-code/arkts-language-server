import type { SemanticReadinessQuery } from "../contracts/semantic-readiness.js"
import { semanticUnprepared } from "../contracts/semantic-readiness.js"
import type { ProjectResolverPort } from "../contracts/project-resolver.js"
import type { SemanticDocumentStore } from "../core/workspace/document-store.js"
import type { SemanticTypeEngineRegistry } from "../core/types/type-engine.js"
import { enableSharedSdkRetention } from "./backends/ohos-typescript/registry-pool.js"
import { InitialProjectPreparation } from "./coordinator/initial-preparation.js"
import { toFilePath } from "./semantic-worker-file-identity.js"

/** Keep the root's initialization lifetime separate from a replaceable Worker. */
export class ProjectReadinessLifecycle {
  private readonly initial = new InitialProjectPreparation()
  restoreCompleted(rootUri: string): void { this.initial.restoreCompleted(rootUri) }
  read(query: SemanticReadinessQuery, projects: ProjectResolverPort,
    documents: SemanticDocumentStore, engines: SemanticTypeEngineRegistry) {
    return prepareProjectReadiness(query, projects, documents, engines, this.initial)
  }
}

/** First complete project preparation owns its pressure exemption, never later recovery. */
export function prepareProjectReadiness(query: SemanticReadinessQuery, projects: ProjectResolverPort,
  documents: SemanticDocumentStore, engines: SemanticTypeEngineRegistry, initial: InitialProjectPreparation) {
  return initial.run(query.rootUri, query.prepare, () => {
    checkpoint(query.signal)
    if (query.prepare) enableSharedSdkRetention()
    const rootPath = toFilePath(query.rootUri)
    if (!rootPath || projects.projectFor(query.rootUri).rootUri !== query.rootUri) {
      return semanticUnprepared(query.rootUri, "workspace-root-unavailable")
    }
    const workspace = documents.prepareRoot(rootPath)
    checkpoint(query.signal)
    if (workspace && query.prepare) engines.prepareInitialGroups(workspace)
    if (workspace && workspace.projectMembership?.status !== "complete") {
      return semanticUnprepared(query.rootUri, "project-membership-incomplete")
    }
    return workspace ? engines.semanticReadiness(workspace, query.prepare)
      : semanticUnprepared(query.rootUri, "workspace-sources-unavailable")
  }, () => checkpoint(query.signal))
}

function checkpoint(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Semantic request cancelled")
}
