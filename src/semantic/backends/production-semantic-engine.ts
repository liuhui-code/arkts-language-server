import type { ProjectResolverPort } from "../../contracts/project-resolver.js"
import type { SemanticEnginePort } from "../../contracts/semantic-engine.js"
import type { WorkspaceExportIndexPort } from "../../contracts/workspace-index.js"
import type { StructuredLogger } from "../../observability/logger.js"
import { SemanticWorkerEngine } from "../semantic-worker-proxy.js"
import type { SemanticBackend } from "./semantic-backend.js"

export function createProductionSemanticEngine(
  projects: ProjectResolverPort,
  logger?: StructuredLogger,
  options: {
    env?: NodeJS.ProcessEnv
    workerPath?: string
    exportIndex?: WorkspaceExportIndexPort
  } = {},
): SemanticEnginePort & SemanticBackend {
  return new SemanticWorkerEngine(projects, logger, options)
}
