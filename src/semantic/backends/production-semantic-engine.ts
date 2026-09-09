import type { ProjectResolverPort } from "../../contracts/project-resolver.js"
import type { SemanticEnginePort } from "../../contracts/semantic-engine.js"
import type { StructuredLogger } from "../../observability/logger.js"
import { OhosTypeScriptSemanticEngine } from "./ohos-typescript/engine.js"
import type { SemanticBackend } from "./semantic-backend.js"

export function createProductionSemanticEngine(
  projects: ProjectResolverPort,
  logger?: StructuredLogger,
): SemanticEnginePort & SemanticBackend {
  return new OhosTypeScriptSemanticEngine(projects, logger)
}
