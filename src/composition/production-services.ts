import { pathToFileURL } from "node:url"

import type { LanguageServerServices } from "../lsp/run-language-server.js"
import { resolveIndexCacheDirectory } from "../index/cache-directory.js"
import { SidecarWorkspaceIndex } from "../index/sidecar-workspace-index.js"
import { SingleRootProjectResolver } from "../project/single-root-project-resolver.js"
import { LegacySemanticEngine } from "../semantic/legacy-semantic-engine.js"
import { DefaultWorkspaceSymbolService } from "../workspace/default-workspace-symbol-service.js"

export interface ProductionServiceOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
}

export function createProductionLanguageServerServices(
  options: ProductionServiceOptions = {},
): LanguageServerServices {
  const environment = options.env ?? process.env
  const projects = new SingleRootProjectResolver(pathToFileURL(options.cwd ?? process.cwd()).href)
  const semantic = new LegacySemanticEngine(projects)
  const index = new SidecarWorkspaceIndex({ env: environment })
  const workspaceSymbols = new DefaultWorkspaceSymbolService({
    index,
    catalog: index,
    semantic,
    cacheDirectory: resolveIndexCacheDirectory({ env: environment }),
  })
  return { projects, semantic, workspaceSymbols }
}
