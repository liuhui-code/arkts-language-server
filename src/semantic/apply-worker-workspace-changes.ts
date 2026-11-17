import type { SemanticWorkspaceFileChangeBatch } from "../contracts/semantic-engine.js"
import type { WorkspaceReferenceIndexPort } from "../contracts/workspace-index.js"
import type { LocalPackageResolver } from "../core/sdk/local-package-resolver.js"
import type { RootSemanticWorkerMutationInput } from "./semantic-worker-supervisor.js"
import type { ReferenceResultCache } from "./references/reference-result-cache.js"
import type { ReferenceIndexFreshness } from "./references/reference-index-freshness.js"
import { toFilePath } from "./semantic-worker-file-identity.js"

/** Parent cache invalidation and the ordered Worker mutation share one event. */
export function applyWorkerWorkspaceChanges(batches: readonly SemanticWorkspaceFileChangeBatch[], port: {
  cache: ReferenceResultCache; freshness: ReferenceIndexFreshness; index?: WorkspaceReferenceIndexPort
  packages: LocalPackageResolver; mutate(rootUri: string, mutation: RootSemanticWorkerMutationInput): void
}): void {
  if (batches.length > 0) port.cache.clear()
  for (const batch of batches) {
    port.freshness.workspaceFilesChanged(batch, port.index)
    const rootPath = toFilePath(batch.rootUri)
    if (rootPath) port.packages.invalidate(rootPath)
    port.mutate(batch.rootUri, {
      kind: "workspaceFilesChanged", rootUri: batch.rootUri, rootDirty: batch.rootDirty,
      ...(batch.configurationChanged === true ? { configurationChanged: true } : {}),
      resourceDirty: batch.resourceDirty === true, resourceChanged: batch.resourceChanged === true,
      changes: batch.changes,
      ...(batch.managedSourceNamespaces ? { managedSourceNamespaces: batch.managedSourceNamespaces } : {}),
    })
  }
}
