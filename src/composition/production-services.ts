import { pathToFileURL } from "node:url"

import type { LanguageServerServices } from "../lsp/run-language-server.js"
import { resolveIndexCacheDirectory } from "../index/cache-directory.js"
import { SidecarWorkspaceIndex, type SidecarProtocolEvent } from "../index/sidecar-workspace-index.js"
import { SingleRootProjectResolver } from "../project/single-root-project-resolver.js"
import { createProductionSemanticEngine } from "../semantic/backends/production-semantic-engine.js"
import { DefaultWorkspaceSymbolService } from "../workspace/default-workspace-symbol-service.js"
import { createStructuredLogger } from "../observability/logger.js"
import { resolveLogPath } from "../observability/log-path.js"

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
  const index = new SidecarWorkspaceIndex({ env: environment, onEvent })
  const semantic = createProductionSemanticEngine(projects, logger, {
    env: environment,
    exportIndex: index,
    referenceIndex: index,
  })
  const workspaceSymbols = new DefaultWorkspaceSymbolService({
    index,
    catalog: index,
    semantic,
    cacheDirectory: resolveIndexCacheDirectory({ env: environment }),
  })
  return { projects, semantic, workspaceSymbols, logger }
}
