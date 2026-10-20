import type { HostCancellationToken } from "typescript"
import type { TypeScriptSdkAmbientProfile } from "../core/types/typescript-language-service.js"
import type { ReferenceSearchRuntimeConfig } from "./references/reference-runtime.js"
import type { SemanticMemoryLevel } from "./coordinator/semantic-coordinator.js"
import type { TransientSemanticWorkerObserver } from "./transient-worker-lifecycle.js"

export interface LegacySemanticEngineRuntimeOptions {
  readonly maxResidentContexts?: number | null
  readonly hostCancellationToken?: HostCancellationToken
  readonly references?: ReferenceSearchRuntimeConfig
  readonly refreshMemoryPressure?: () => void
  readonly readMemoryPressure?: () => SemanticMemoryLevel
  readonly onTransientWorker?: TransientSemanticWorkerObserver
  readonly interactiveSdkAmbientProfile?: TypeScriptSdkAmbientProfile
  readonly interactiveProjectRootProfile?: "closure" | "current"
  readonly memberCompletionProjectRootProfile?: "group" | "workspace" | "current"
  readonly autoImportProjectRootProfile?: "workspace" | "discovery"
  readonly autoImportBatchRootLimit?: number
  readonly autoImportTrimBetweenBatches?: boolean
}
