import { pathToFileURL } from "node:url"

import type { LanguageServerServices } from "../lsp/run-language-server.js"
import { SidecarWorkspaceIndex, type SidecarProtocolEvent } from "../index/sidecar-workspace-index.js"
import { SingleRootProjectResolver } from "../project/single-root-project-resolver.js"
import { createProductionSemanticEngine } from "../semantic/backends/production-semantic-engine.js"
import { DefaultWorkspaceSymbolService } from "../workspace/default-workspace-symbol-service.js"
import { createStructuredLogger } from "../observability/logger.js"
import { resolveLogPath } from "../observability/log-path.js"
import { createIndexStorage } from "./index-storage.js"

export interface ProductionServiceOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
}

export function createProductionLanguageServerServices(
  options: ProductionServiceOptions = {},
): LanguageServerServices {
  const environment = options.env ?? process.env
  const logger = createStructuredLogger(resolveLogPath(environment))
  const projects = new SingleRootProjectResolver(pathToFileURL(options.cwd ?? process.cwd()).href)
  const phaseByWorkspace = new Map<string, { ordinal: number; phaseKey: string }>()
  const onEvent = environment.ARKTS_INDEX_CATALOG_TRACE === "1"
    ? (event: SidecarProtocolEvent) => {
        if (event.event !== "catalog/progress") {
          const receipt = event.qualification as { head?: unknown } | null | undefined
          logger.info("index.maintenance.phase", { nativeEvent: event.event, attemptId: event.attemptId,
            inputRevision: event.input.revision,
            phase: typeof event.phase === "string" ? event.phase : undefined,
            outcome: typeof event.outcome === "string" ? event.outcome : undefined,
            head: typeof receipt?.head === "number" ? receipt.head : undefined,
            writtenDocuments: typeof event.writtenDocuments === "number" ? event.writtenDocuments : undefined,
            indexedDocuments: typeof event.indexedDocuments === "number" ? event.indexedDocuments : undefined,
            reusedDocuments: typeof event.reusedDocuments === "number" ? event.reusedDocuments : undefined,
            currentInput: typeof event.currentInput === "boolean" ? event.currentInput : undefined,
            scope: typeof event.scope === "string" ? event.scope : undefined,
            dataPublished: typeof event.dataPublished === "boolean" ? event.dataPublished : undefined,
            monotonicNs: process.hrtime.bigint().toString() })
          return
        }
        const status = event.params.status
        const phase = status.phase as string
        const buildingGeneration = status.buildingGeneration
        const committedGeneration = status.committedGeneration
        const phaseKey = `${phase}:${buildingGeneration}:${committedGeneration}`
        const previous = phaseByWorkspace.get(event.params.workspaceIdentity)
        if (previous?.phaseKey === phaseKey) return
        const ordinal = previous?.ordinal ?? phaseByWorkspace.size + 1
        phaseByWorkspace.set(event.params.workspaceIdentity, { ordinal, phaseKey })
        logger.info("index.catalog.phase", {
          workspaceOrdinal: ordinal,
          phase,
          monotonicNs: process.hrtime.bigint().toString(),
          buildingGeneration: typeof buildingGeneration === "number" ? buildingGeneration : null,
          committedGeneration: typeof committedGeneration === "number" ? committedGeneration : null,
          discoveredFiles: status.discovered as number,
          indexedFiles: status.indexed as number,
          totalFiles: typeof status.totalFiles === "number" ? status.totalFiles : undefined,
        })
      }
    : undefined
  const index = new SidecarWorkspaceIndex({ env: environment, onEvent, fileMaintenance: true,
    onSourceScopeChanged: root => workspaceSymbols?.workspaceFilesChanged([root]),
    onManagedCacheNamespace: (root, directories) => semantic.setManagedSourceNamespace!(root, directories) })
  let workspaceSymbols: DefaultWorkspaceSymbolService
  const semantic = createProductionSemanticEngine(projects, logger, {
    env: environment,
    exportIndex: index,
    referenceIndex: index,
    onUnobservedSourceNamespace: (rootUri, kind) => {
      // Reuse the existing single-workspace scheduler. No semantic rootDirty
      // mutation: the Store has already reconciled its actual membership.
      if (kind === "namespace") workspaceSymbols.observeWorkspaceFiles([{ rootUri, rootDirty: true, namespaceUncertain: true, changes: [] }])
      workspaceSymbols.workspaceFilesChanged([rootUri])
      logger.info("references.namespace.reconcile", { rootUri, kind })
    },
  })
  const storage = createIndexStorage(environment, logger)
  workspaceSymbols = new DefaultWorkspaceSymbolService({
    index,
    catalog: index,
    semantic,
    cacheDirectory: warning => storage.directory(warning),
    maintenance: storage,
  })
  return { projects, semantic, workspaceSymbols, logger }
}
