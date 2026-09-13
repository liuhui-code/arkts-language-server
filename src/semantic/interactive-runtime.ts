import type { TypeScriptSdkAmbientProfile } from "../core/types/typescript-language-service.js"

export interface InteractiveSemanticRuntimeConfig {
  readonly sdkAmbientProfile: Extract<TypeScriptSdkAmbientProfile, "full" | "core">
  readonly projectRootProfile: "closure" | "current"
  readonly memberCompletionProjectRootProfile: "workspace" | "current"
  readonly autoImportProjectRootProfile: "workspace" | "discovery"
}

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
  }
}
