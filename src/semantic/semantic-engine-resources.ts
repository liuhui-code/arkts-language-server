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
  const documents = new SemanticDocumentStore({ packageResolver,
    operationControl: { checkpoint: referenceCheckpoint(runtime.hostCancellationToken) ?? (() => {}) } })
  const engines = new SemanticTypeEngineRegistry(packageResolver,
    logger ? (workspaceRoot, sdk) => {
      logger.info("sdk.selected", {
        workspaceRoot, sdkPath: sdk.path, source: sdk.source, ready: sdk.ready,
        metadataStatus: sdk.identity?.status ?? "unavailable",
        apiVersion: sdk.identity?.apiVersion, componentVersion: sdk.identity?.componentVersion,
        dialectCompatibility: "unverified", declarationSupport: "typescript-compatible-only",
      })
    } : undefined, documents, {
      ...runtime,
      onReferenceTrace: logger ? (event, fields) => logger.info(event, fields) : undefined,
    })
  return { packageResolver, documents, engines }
}
