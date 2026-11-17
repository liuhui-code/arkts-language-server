import type { SemanticWorkspaceFileChangeBatch } from "../contracts/semantic-engine.js"
import { isArkUIStringResourcePath } from "../core/arkui/resource-path.js"
import { toFilePath } from "./semantic-worker-file-identity.js"
import { SemanticTypeEngineRegistry } from "../core/types/type-engine.js"
import { SemanticDocumentStore } from "../core/workspace/document-store.js"
import { LocalPackageResolver } from "../core/sdk/local-package-resolver.js"
import type { StructuredLogger } from "../observability/logger.js"
import type { LegacySemanticEngineRuntimeOptions } from "./semantic-engine-runtime-options.js"
import { referenceCheckpoint } from "./references/reference-context-retention.js"

/** One engine owns the store/resolver/compiler registry and their request cancellation domain. */
export function createSemanticEngineResources(logger: StructuredLogger | undefined,
  runtime: LegacySemanticEngineRuntimeOptions) {
  const packageResolver = new LocalPackageResolver()
  // The token reads the current request's shared cell. Outside request scope,
  // document/config mutations remain authoritative and cannot inherit a cancellation.
  // Compiler synchronization retains its existing in-place commit exception.
  const documents = new SemanticDocumentStore({ packageResolver, managedSourceNamespaces: runtime.managedSourceNamespaces,
    operationControl: { checkpoint: referenceCheckpoint(runtime.hostCancellationToken) ?? (() => {}) } })
  const engines = new SemanticTypeEngineRegistry(packageResolver,
    logger ? (workspaceRoot, sdk) => {
      logger.info("sdk.selected", {
        workspaceRoot, sdkPath: sdk.path, source: sdk.source, ready: sdk.ready,
        metadataStatus: sdk.identity?.status ?? "unavailable",
        apiVersion: sdk.identity?.apiVersion, componentVersion: sdk.identity?.componentVersion,
        dialectCompatibility: "unverified", declarationSupport: "typescript-compatible-only",
        targetQualification: sdk.targetQualification?.status, compileApi: sdk.targetQualification?.compileApi,
        compatibleApi: sdk.targetQualification?.compatibleApi, targetApi: sdk.targetQualification?.targetApi,
        sdkTargetMessage: sdk.targetQualification?.message,
      })
    } : undefined, documents, {
      ...runtime,
      onReferenceTrace: logger ? (event, fields) => logger.info(event, fields) : undefined,
    })
  return { packageResolver, documents, engines }
}

/** Watched-file orchestration; only explicit configuration provenance authorizes reload. */
export function applySemanticWorkspaceChanges(batches: readonly SemanticWorkspaceFileChangeBatch[],
  documents: SemanticDocumentStore, engines: SemanticTypeEngineRegistry): void {
    for (const batch of batches) {
      const rootPath = toFilePath(batch.rootUri)
      if (!rootPath) continue
      if (batch.managedSourceNamespaces) documents.setManagedSourceNamespaces(rootPath, batch.managedSourceNamespaces)
      const changes = batch.changes.flatMap((change) => {
        const changedPath = toFilePath(change.uri)
        return changedPath ? [{ path: changedPath, kind: change.kind }] : []
      })
      if (batch.resourceChanged || batch.resourceDirty || changes.some(({ path: changedPath }) => (
        isArkUIStringResourcePath(changedPath)
      ))) {
        engines.invalidateArkUIResources(rootPath)
      }
      if (batch.configurationChanged === true) engines.configurationFilesChanged(rootPath)
      // Non-source entries can replace source-containing directories. The store
      // derives affected source descendants; regular metadata is not a source.
      if (!batch.rootDirty && changes.length === 0) continue
      documents.workspaceFilesChanged({
        rootPath,
        rootDirty: batch.rootDirty,
        changes,
      })
    }
}
