import type { TypeScriptSdkAmbientProfile } from "../core/types/typescript-language-service.js"

export interface InteractiveSemanticRuntimeConfig {
  readonly sdkAmbientProfile: Extract<TypeScriptSdkAmbientProfile, "full" | "core">
  readonly projectRootProfile: "closure" | "current"
  readonly memberCompletionProjectRootProfile: "workspace" | "current"
  readonly autoImportProjectRootProfile: "workspace" | "discovery"
  readonly autoImportBatchRootLimit: number
  readonly autoImportTrimBetweenBatches: boolean
}

const DEFAULT_AUTO_IMPORT_BATCH_ROOT_LIMIT = 128
const MAX_AUTO_IMPORT_BATCH_ROOT_LIMIT = 128

export function interactiveSemanticRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): InteractiveSemanticRuntimeConfig {
  const sdkAmbientProfile = environment.ARKTS_INTERACTIVE_SDK_AMBIENT_PROFILE ?? "full"
  if (sdkAmbientProfile !== "full" && sdkAmbientProfile !== "core") {
    throw new Error("ARKTS_INTERACTIVE_SDK_AMBIENT_PROFILE must be full or core")
  }
  const projectRootProfile = environment.ARKTS_INTERACTIVE_PROJECT_ROOT_PROFILE ?? "closure"
  if (projectRootProfile !== "closure" && projectRootProfile !== "current") {
    throw new Error("ARKTS_INTERACTIVE_PROJECT_ROOT_PROFILE must be closure or current")
  }
  const memberCompletionProjectRootProfile = environment.ARKTS_MEMBER_COMPLETION_PROJECT_ROOT_PROFILE
    ?? "workspace"
  if (
    memberCompletionProjectRootProfile !== "workspace"
    && memberCompletionProjectRootProfile !== "current"
  ) {
    throw new Error(
      "ARKTS_MEMBER_COMPLETION_PROJECT_ROOT_PROFILE must be workspace or current",
    )
  }
  const autoImportProjectRootProfile = environment.ARKTS_AUTO_IMPORT_PROJECT_ROOT_PROFILE
    ?? "workspace"
  if (
    autoImportProjectRootProfile !== "workspace"
    && autoImportProjectRootProfile !== "discovery"
  ) {
    throw new Error(
      "ARKTS_AUTO_IMPORT_PROJECT_ROOT_PROFILE must be workspace or discovery",
    )
  }
  return {
    sdkAmbientProfile,
    projectRootProfile,
    memberCompletionProjectRootProfile,
    autoImportProjectRootProfile,
    autoImportBatchRootLimit: positiveInteger(
      environment.ARKTS_AUTO_IMPORT_BATCH_ROOTS,
      DEFAULT_AUTO_IMPORT_BATCH_ROOT_LIMIT,
      MAX_AUTO_IMPORT_BATCH_ROOT_LIMIT,
    ),
    autoImportTrimBetweenBatches:
      environment.ARKTS_AUTO_IMPORT_TRIM_BETWEEN_BATCHES === "1",
  }
}

function positiveInteger(value: string | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`ARKTS_AUTO_IMPORT_BATCH_ROOTS must be an integer from 1 to ${maximum}`)
  }
  return parsed
}
