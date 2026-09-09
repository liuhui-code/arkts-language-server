import type { ProjectResolverPort } from "../../../contracts/project-resolver.js"
import type { StructuredLogger } from "../../../observability/logger.js"
import { LegacySemanticEngine } from "../../legacy-semantic-engine.js"
import type { LegacySemanticEngineRuntimeOptions } from "../../legacy-semantic-engine.js"
import type { SemanticBackend } from "../semantic-backend.js"
import { OHOS_TYPESCRIPT_BACKEND_IDENTITY } from "./identity.js"

export class OhosTypeScriptSemanticEngine
  extends LegacySemanticEngine
  implements SemanticBackend {
  readonly backendIdentity = OHOS_TYPESCRIPT_BACKEND_IDENTITY

  constructor(
    projects: ProjectResolverPort,
    logger?: StructuredLogger,
    runtime?: LegacySemanticEngineRuntimeOptions,
  ) {
    super(projects, logger, runtime)
  }
}
